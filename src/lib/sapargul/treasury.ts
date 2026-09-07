// The head treasurer's confirmation boundary (AGENTS spec s.4/s.15/s.27).
// This is the ONLY module in the whole codebase allowed to write
// status = PAYMENT_CONFIRMED. Every entry point here starts with
// requireTreasuryRole — Sapargul, Sapar, and a plain dispatcher have no
// technical path to call these functions successfully (spec s.5's "no
// technical bypass" and s.43's central rule).
import { db } from "@/lib/db";
import type { AgentContext } from "@/lib/agents/types";
import { transitionShipment } from "@/lib/sapar/lifecycle";
import { logSapargulAction } from "./events";
import { transitionShipmentPayment } from "./payment-lifecycle";
import { evaluateTreasuryConfirmation } from "./matching";
import { requireTreasuryRole } from "./role";

export class PaymentNotAwaitingTreasuryReviewError extends Error {
  constructor(paymentId: string, status: string) {
    super(`ShipmentPayment ${paymentId} is not awaiting treasury review (status=${status})`);
    this.name = "PaymentNotAwaitingTreasuryReviewError";
  }
}

export interface ConfirmActualPaymentReceiptParams {
  actualAmountSom: number;
  transactionReference?: string | null;
  reviewerId: string;
}

/** The single writer of PAYMENT_CONFIRMED (spec s.2/s.4/s.43). Idempotent:
 * calling it again for an already-confirmed payment is a safe no-op (spec
 * s.29 test J), never a second confirmation or a second Payment Gate open.
 * On confirmation, opens the Payment Gate by advancing the *shipment* itself
 * (CONFIRMED -> AWAITING_PICKUP) through Sapar's own, unmodified lifecycle
 * function — this is the only place that call is ever made (spec s.16). */
export async function confirmActualPaymentReceipt(ctx: AgentContext, dispatcherRole: string, paymentId: string, params: ConfirmActualPaymentReceiptParams) {
  requireTreasuryRole(dispatcherRole);

  const payment = await db.shipmentPayment.findUniqueOrThrow({ where: { id: paymentId } });
  if (payment.status === "PAYMENT_CONFIRMED") {
    return payment; // idempotent no-op — no re-confirmation, no duplicate Payment Gate open
  }
  if (payment.status !== "AWAITING_TREASURER_CONFIRMATION" && payment.status !== "PAYMENT_MISMATCH") {
    throw new PaymentNotAwaitingTreasuryReviewError(paymentId, payment.status);
  }

  const decision = evaluateTreasuryConfirmation(payment.amountExpectedSom, params.actualAmountSom);
  const now = new Date();
  const discrepancyFlags = decision.flag && !payment.discrepancyFlags.includes(decision.flag) ? [...payment.discrepancyFlags, decision.flag] : payment.discrepancyFlags;

  const updated = await transitionShipmentPayment(ctx, paymentId, decision.nextStatus, {
    confirmedAmountSom: params.actualAmountSom,
    confirmedAt: decision.nextStatus === "PAYMENT_CONFIRMED" ? now : null,
    treasuryReviewStatus: decision.nextStatus === "PAYMENT_CONFIRMED" ? "CONFIRMED" : "PENDING",
    treasuryReviewedAt: now,
    treasuryReviewerId: params.reviewerId,
    transactionReference: params.transactionReference ?? payment.transactionReference,
    mismatchReason: decision.outcome === "UNDERPAID" ? `Недоплата: ожидалось ${payment.amountExpectedSom}, поступило ${params.actualAmountSom}.` : payment.mismatchReason,
    discrepancyFlags,
  });

  await logSapargulAction({
    ctx,
    action: "sapargul.treasury_receipt_confirmed",
    entityId: paymentId,
    details: { shipmentId: payment.shipmentId, reviewerId: params.reviewerId, actualAmountSom: params.actualAmountSom, expectedAmountSom: payment.amountExpectedSom, outcome: decision.outcome },
  });

  if (decision.nextStatus === "PAYMENT_CONFIRMED") {
    await transitionShipment(ctx, payment.shipmentId, "AWAITING_PICKUP");
  }

  return updated;
}

export interface RejectPaymentParams {
  reason: string;
  reviewerId: string;
}

/** Idempotent rejection — a repeat call for an already-rejected payment is a
 * no-op. Never confirms; only the treasurer may call this (spec s.27). */
export async function rejectPayment(ctx: AgentContext, dispatcherRole: string, paymentId: string, params: RejectPaymentParams) {
  requireTreasuryRole(dispatcherRole);

  const payment = await db.shipmentPayment.findUniqueOrThrow({ where: { id: paymentId } });
  if (payment.status === "PAYMENT_REJECTED") {
    return payment;
  }
  if (payment.status !== "AWAITING_TREASURER_CONFIRMATION" && payment.status !== "PAYMENT_MISMATCH") {
    throw new PaymentNotAwaitingTreasuryReviewError(paymentId, payment.status);
  }

  const now = new Date();
  const updated = await transitionShipmentPayment(ctx, paymentId, "PAYMENT_REJECTED", {
    rejectedAt: now,
    rejectionReason: params.reason,
    treasuryReviewStatus: "REJECTED",
    treasuryReviewedAt: now,
    treasuryReviewerId: params.reviewerId,
  });

  await logSapargulAction({
    ctx,
    action: "sapargul.treasury_payment_rejected",
    entityId: paymentId,
    details: { shipmentId: payment.shipmentId, reviewerId: params.reviewerId, reason: params.reason },
  });

  return updated;
}

export interface MarkPaymentMismatchParams {
  reason: string;
  reviewerId: string;
}

/** Treasurer flags evidence as not matching reality without outright
 * rejecting the order — e.g. the client may resubmit corrected evidence.
 * Idempotent for an already-mismatched payment. */
export async function markPaymentMismatch(ctx: AgentContext, dispatcherRole: string, paymentId: string, params: MarkPaymentMismatchParams) {
  requireTreasuryRole(dispatcherRole);

  const payment = await db.shipmentPayment.findUniqueOrThrow({ where: { id: paymentId } });
  if (payment.status === "PAYMENT_MISMATCH") {
    return payment;
  }
  if (payment.status !== "AWAITING_TREASURER_CONFIRMATION") {
    throw new PaymentNotAwaitingTreasuryReviewError(paymentId, payment.status);
  }

  const now = new Date();
  const updated = await transitionShipmentPayment(ctx, paymentId, "PAYMENT_MISMATCH", {
    mismatchReason: params.reason,
    treasuryReviewStatus: "PENDING",
    treasuryReviewedAt: now,
    treasuryReviewerId: params.reviewerId,
  });

  await logSapargulAction({
    ctx,
    action: "sapargul.treasury_payment_mismatch",
    entityId: paymentId,
    details: { shipmentId: payment.shipmentId, reviewerId: params.reviewerId, reason: params.reason },
  });

  return updated;
}
