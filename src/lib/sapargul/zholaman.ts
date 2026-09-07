// The only view Zholaman (cargo delivery manager) may ever get of a payment
// (AGENTS spec s.21) — a coarse business status, never raw banking data,
// amounts, evidence, or treasury review details.
import type { ShipmentPaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { JolamanPaymentStatus } from "./types";

/** Pure: collapses the fine-grained ShipmentPaymentStatus into the three
 * values Zholaman is allowed to see. REFUND_* after a confirmed payment
 * still reads as PAID — the order itself was paid; a refund is a
 * financial-only follow-up and must not stall the operational contour
 * (spec s.22). */
export function paymentStatusForJolaman(status: ShipmentPaymentStatus): JolamanPaymentStatus {
  switch (status) {
    case "PAYMENT_CONFIRMED":
    case "REFUND_REQUIRED":
    case "REFUND_PENDING":
    case "REFUND_CONFIRMED":
      return "PAID";
    case "PAYMENT_MISMATCH":
    case "PAYMENT_REJECTED":
    case "CANCELLED":
      return "PAYMENT_PROBLEM";
    default:
      return "PAYMENT_PENDING";
  }
}

/** Convenience DB-touching wrapper for callers (e.g. a future Zholaman
 * quality-report integration) that only have a shipmentId on hand. */
export async function jolamanPaymentStatusForShipment(shipmentId: string): Promise<JolamanPaymentStatus | null> {
  const payment = await db.shipmentPayment.findUnique({ where: { shipmentId } });
  return payment ? paymentStatusForJolaman(payment.status) : null;
}
