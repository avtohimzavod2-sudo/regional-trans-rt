// Sapargul's operational payment service (AGENTS spec s.1/s.6/s.9/s.10/s.12).
// Everything here is Sapargul's own contour: create a payment request, issue
// instructions (never inventing requisites — see destination.ts), record
// evidence, run a preliminary (non-final) reconciliation. Final confirmation
// of real money lives only in treasury.ts — nothing in this file may ever
// write status = PAYMENT_CONFIRMED (spec s.4/s.5).
import type { PaymentEvidenceType } from "@prisma/client";
import { db } from "@/lib/db";
import type { AgentContext } from "@/lib/agents/types";
import { openShipmentIncident } from "@/lib/sapar/incidents";
import { logSapargulAction } from "./events";
import { transitionShipmentPayment } from "./payment-lifecycle";
import { evaluatePreliminaryMatch } from "./matching";
import { currentPaymentEnvironment, getActivePaymentDestination, PaymentDestinationNotConfiguredError } from "./destination";
import type { PaymentEvidenceInput } from "./types";

export class ShipmentPaymentNotAwaitingEvidenceError extends Error {
  constructor(paymentId: string, status: string) {
    super(`ShipmentPayment ${paymentId} is not awaiting evidence (status=${status})`);
    this.name = "ShipmentPaymentNotAwaitingEvidenceError";
  }
}

/** Idempotent: a repeat call for a shipment that already has a payment
 * request returns the existing one unchanged, never creating a second
 * ShipmentPayment or re-pricing an existing one (spec s.29). */
export async function createPaymentRequest(ctx: AgentContext, shipmentId: string, amountExpectedSom: number, currency = "KGS") {
  const existing = await db.shipmentPayment.findUnique({ where: { shipmentId } });
  if (existing) return existing;

  const shipment = await db.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  const payment = await db.shipmentPayment.create({
    data: {
      shipmentId,
      orderReference: `${shipment.publicId}-PAY`,
      amountExpectedSom,
      currency,
      status: "PAYMENT_REQUIRED",
    },
  });

  await logSapargulAction({
    ctx,
    action: "sapargul.payment_requested",
    entityId: payment.id,
    details: { shipmentId, amountExpectedSom, currency, orderReference: payment.orderReference },
  });

  return payment;
}

/** Idempotent no-op if instructions were already issued. Never fabricates a
 * destination — throws PaymentDestinationNotConfiguredError if none is
 * active for the current environment (spec s.8). */
export async function issuePaymentInstructions(ctx: AgentContext, paymentId: string) {
  const payment = await db.shipmentPayment.findUniqueOrThrow({ where: { id: paymentId } });
  if (payment.status !== "PAYMENT_REQUIRED") {
    return payment; // already issued (or moved further) — safe no-op
  }

  const environment = currentPaymentEnvironment();
  const destination = await getActivePaymentDestination(environment);
  if (!destination) {
    throw new PaymentDestinationNotConfiguredError(environment);
  }

  await db.shipmentPayment.update({
    where: { id: paymentId },
    data: { destinationId: destination.id, instructionsIssuedAt: new Date() },
  });
  await transitionShipmentPayment(ctx, paymentId, "PAYMENT_INSTRUCTIONS_READY");
  const final = await transitionShipmentPayment(ctx, paymentId, "AWAITING_PAYMENT");

  await logSapargulAction({
    ctx,
    action: "sapargul.payment_instructions_issued",
    entityId: paymentId,
    details: { shipmentId: payment.shipmentId, destinationId: destination.id, environment },
  });

  return final;
}

export interface RequestShipmentPaymentResult {
  paymentId: string;
  status: string;
  amountExpectedSom: number;
  currency: string;
  orderReference: string;
  destinationLabel: string | null;
  destinationMethod: string | null;
  instructionsText: string | null;
  isSandbox: boolean;
  destinationConfigured: boolean;
}

/** The single entry point Sapar's confirmation.ts calls once a customer
 * confirms a quote (spec s.16: "Sapargul -> Payment Gate -> Sapar", never
 * the other way). Creates the payment request and tries to issue
 * instructions; if no PaymentDestination is configured for the current
 * environment, opens an admin-visible incident instead of ever inventing
 * requisites, and leaves the payment at PAYMENT_REQUIRED for a dispatcher to
 * resolve (spec s.8/s.36 test M). */
export async function requestShipmentPayment(ctx: AgentContext, shipmentId: string, amountExpectedSom: number, currency = "KGS"): Promise<RequestShipmentPaymentResult> {
  const payment = await createPaymentRequest(ctx, shipmentId, amountExpectedSom, currency);

  try {
    const withInstructions = await issuePaymentInstructions(ctx, payment.id);
    const destination = withInstructions.destinationId ? await db.paymentDestination.findUnique({ where: { id: withInstructions.destinationId } }) : null;
    return {
      paymentId: withInstructions.id,
      status: withInstructions.status,
      amountExpectedSom: withInstructions.amountExpectedSom,
      currency: withInstructions.currency,
      orderReference: withInstructions.orderReference,
      destinationLabel: destination?.label ?? null,
      destinationMethod: destination?.method ?? null,
      instructionsText: destination?.instructionsText ?? null,
      isSandbox: destination?.environment === "SANDBOX",
      destinationConfigured: true,
    };
  } catch (err) {
    if (err instanceof PaymentDestinationNotConfiguredError) {
      await openShipmentIncident(ctx, {
        shipmentId,
        type: "payment_destination_not_configured",
        severity: "HIGH",
        description: err.message,
        openedByType: "AGENT",
      });
      return {
        paymentId: payment.id,
        status: payment.status,
        amountExpectedSom: payment.amountExpectedSom,
        currency: payment.currency,
        orderReference: payment.orderReference,
        destinationLabel: null,
        destinationMethod: null,
        instructionsText: null,
        isSandbox: false,
        destinationConfigured: false,
      };
    }
    throw err;
  }
}

/** Records PAYMENT EVIDENCE, never a confirmation (spec s.2/s.10/s.11). Runs
 * the deterministic preliminary match and always lands the payment at
 * AWAITING_TREASURER_CONFIRMATION — even a perfectly matching receipt never
 * reaches PAYMENT_CONFIRMED here (spec s.36 test A). Rejects evidence for a
 * payment that isn't currently awaiting it (e.g. already confirmed), so a
 * replayed/duplicate submission can never reopen a closed payment. */
export async function submitPaymentEvidence(ctx: AgentContext, paymentId: string, evidence: PaymentEvidenceInput) {
  const payment = await db.shipmentPayment.findUniqueOrThrow({ where: { id: paymentId } });
  if (payment.status !== "AWAITING_PAYMENT" && payment.status !== "PAYMENT_MISMATCH") {
    throw new ShipmentPaymentNotAwaitingEvidenceError(paymentId, payment.status);
  }

  if (payment.status === "PAYMENT_MISMATCH") {
    await transitionShipmentPayment(ctx, paymentId, "AWAITING_PAYMENT");
  }

  const duplicate = evidence.transactionReference
    ? await db.shipmentPayment.findFirst({ where: { transactionReference: evidence.transactionReference, id: { not: paymentId } } })
    : null;

  const match = evaluatePreliminaryMatch({
    expected: {
      amountExpectedSom: payment.amountExpectedSom,
      currency: payment.currency,
      destinationId: payment.destinationId,
      orderReference: payment.orderReference,
    },
    evidence,
    isDuplicateReference: duplicate != null,
    now: new Date(),
  });

  await transitionShipmentPayment(ctx, paymentId, "PAYMENT_EVIDENCE_RECEIVED", {
    evidenceType: evidence.evidenceType,
    evidenceReference: evidence.evidenceReference,
    evidenceReceivedAt: new Date(),
    claimedAmountSom: evidence.claimedAmountSom ?? null,
    claimedCurrency: evidence.claimedCurrency ?? null,
    claimedPaymentTime: evidence.claimedPaymentTime ?? null,
    transactionReference: evidence.transactionReference ?? null,
    preliminaryCheckStatus: match.status,
    preliminaryCheckNotes: match.notes,
    discrepancyFlags: match.flags,
  });
  await transitionShipmentPayment(ctx, paymentId, "PAYMENT_REVIEW");
  const final = await transitionShipmentPayment(ctx, paymentId, "AWAITING_TREASURER_CONFIRMATION");

  await logSapargulAction({
    ctx,
    action: "sapargul.payment_evidence_submitted",
    entityId: paymentId,
    details: { shipmentId: payment.shipmentId, evidenceType: evidence.evidenceType, preliminaryCheckStatus: match.status, flags: match.flags },
  });

  return final;
}

export type { PaymentEvidenceType };
