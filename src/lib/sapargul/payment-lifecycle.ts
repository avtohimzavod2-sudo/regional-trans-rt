// ShipmentPayment state machine (AGENTS spec s.2/s.6/s.43 — the critical
// financial invariant). Mirrors src/lib/sapar/lifecycle.ts's pattern
// (idempotent transitionShipmentPayment, canTransitionPayment table), with
// one deliberate structural difference: PAYMENT_CONFIRMED is reachable only
// from AWAITING_TREASURER_CONFIRMATION or PAYMENT_MISMATCH — there is no
// path into it from PAYMENT_EVIDENCE_RECEIVED/PAYMENT_REVIEW directly, so
// "customer sent a receipt" can never by itself reach "money confirmed"
// (spec s.2/s.36 test A).
import type { ShipmentPaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { AgentContext } from "@/lib/agents/types";
import { logSapargulAction } from "./events";

const VALID_TRANSITIONS: Record<ShipmentPaymentStatus, ShipmentPaymentStatus[]> = {
  PAYMENT_REQUIRED: ["PAYMENT_INSTRUCTIONS_READY", "CANCELLED"],
  PAYMENT_INSTRUCTIONS_READY: ["AWAITING_PAYMENT", "CANCELLED"],
  AWAITING_PAYMENT: ["PAYMENT_EVIDENCE_RECEIVED", "CANCELLED"],
  PAYMENT_EVIDENCE_RECEIVED: ["PAYMENT_REVIEW"],
  PAYMENT_REVIEW: ["AWAITING_TREASURER_CONFIRMATION"],
  // Only these two states may ever move to PAYMENT_CONFIRMED — see module
  // comment. Both may also be rejected or (re-flagged as) a mismatch.
  AWAITING_TREASURER_CONFIRMATION: ["PAYMENT_CONFIRMED", "PAYMENT_MISMATCH", "PAYMENT_REJECTED"],
  PAYMENT_MISMATCH: ["PAYMENT_CONFIRMED", "PAYMENT_REJECTED", "AWAITING_PAYMENT", "REFUND_REQUIRED", "CANCELLED"],
  PAYMENT_CONFIRMED: ["REFUND_REQUIRED"], // e.g. an overpayment discovered after confirmation
  PAYMENT_REJECTED: ["AWAITING_PAYMENT", "CANCELLED"],
  REFUND_REQUIRED: ["REFUND_PENDING"],
  REFUND_PENDING: ["REFUND_CONFIRMED"],
  REFUND_CONFIRMED: [],
  CANCELLED: [],
};

/** Pure: whether a ShipmentPayment status transition is allowed. */
export function canTransitionPayment(from: ShipmentPaymentStatus, to: ShipmentPaymentStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/** Pure: whether the Payment Gate is open for a shipment in this payment
 * state — the only condition under which Sapar may continue the order
 * (spec s.16/s.43: "Payment Gate открывается -> Сапар продолжает заказ"). */
export function isBookingAllowed(status: ShipmentPaymentStatus): boolean {
  return status === "PAYMENT_CONFIRMED";
}

export class InvalidPaymentTransitionError extends Error {
  constructor(from: ShipmentPaymentStatus, to: ShipmentPaymentStatus) {
    super(`Cannot transition ShipmentPayment from ${from} to ${to}`);
    this.name = "InvalidPaymentTransitionError";
  }
}

export interface TransitionPaymentExtra {
  [key: string]: unknown;
}

/** Idempotent: transitioning to the status a payment is already in is a
 * no-op (spec s.29). Any other invalid jump throws rather than silently
 * skipping intermediate states — this is how the module guarantees the
 * invariant in code, not just by convention. */
export async function transitionShipmentPayment(
  ctx: AgentContext,
  paymentId: string,
  to: ShipmentPaymentStatus,
  extra?: Record<string, unknown>,
) {
  const payment = await db.shipmentPayment.findUniqueOrThrow({ where: { id: paymentId } });

  if (payment.status === to) {
    return payment; // idempotent no-op, no duplicate audit entry
  }
  if (!canTransitionPayment(payment.status, to)) {
    throw new InvalidPaymentTransitionError(payment.status, to);
  }

  const updated = await db.shipmentPayment.update({
    where: { id: paymentId },
    data: { status: to, ...extra },
  });

  await logSapargulAction({
    ctx,
    action: "sapargul.payment_status_changed",
    entityId: paymentId,
    details: { shipmentId: payment.shipmentId, from: payment.status, to },
  });

  return updated;
}
