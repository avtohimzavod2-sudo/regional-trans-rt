// Structured report to the head treasurer (AGENTS spec s.19) — built from
// plain aggregation, never LLM-composed, so every number is traceable back
// to a ShipmentPayment row. Schema is deliberately flat so a future daily
// aggregator (AI Director, spec s.20) can merge it with other departments'
// reports without changes here.
import { db } from "@/lib/db";
import type { SapargulReport, SapargulReportItem, SapargulReportPeriod } from "./types";

const ATTENTION_STATUSES = ["AWAITING_TREASURER_CONFIRMATION", "PAYMENT_MISMATCH"] as const;

/** Pure: how urgently an item requires the treasurer's attention, based on
 * how long it has been waiting. */
export function severityForAgeMs(ageMs: number): SapargulReportItem["severity"] {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  if (ageMs > 3 * ONE_DAY_MS) return "HIGH";
  if (ageMs > ONE_DAY_MS) return "MEDIUM";
  return "LOW";
}

export async function buildSapargulReport(period: SapargulReportPeriod): Promise<SapargulReport> {
  const payments = await db.shipmentPayment.findMany({
    where: { createdAt: { gte: period.from, lte: period.to } },
  });

  const now = new Date();
  let paymentsAwaiting = 0;
  let paymentsUnderReview = 0;
  let paymentsConfirmed = 0;
  let paymentsRejected = 0;
  let totalExpectedAmountSom = 0;
  let totalConfirmedAmountSom = 0;
  let underpaymentAmountSom = 0;
  let overpaymentAmountSom = 0;
  let refundPendingAmountSom = 0;
  let refundCompletedAmountSom = 0;
  let discrepancyCount = 0;
  const itemsRequiringAttention: SapargulReportItem[] = [];

  for (const payment of payments) {
    totalExpectedAmountSom += payment.amountExpectedSom;
    if (payment.discrepancyFlags.length > 0) discrepancyCount += 1;

    switch (payment.status) {
      case "AWAITING_PAYMENT":
        paymentsAwaiting += 1;
        break;
      case "PAYMENT_EVIDENCE_RECEIVED":
      case "PAYMENT_REVIEW":
      case "AWAITING_TREASURER_CONFIRMATION":
        paymentsUnderReview += 1;
        break;
      case "PAYMENT_CONFIRMED":
        paymentsConfirmed += 1;
        totalConfirmedAmountSom += payment.confirmedAmountSom ?? 0;
        if (payment.confirmedAmountSom != null && payment.confirmedAmountSom > payment.amountExpectedSom) {
          overpaymentAmountSom += payment.confirmedAmountSom - payment.amountExpectedSom;
        }
        break;
      case "PAYMENT_REJECTED":
        paymentsRejected += 1;
        break;
      case "PAYMENT_MISMATCH":
        if (payment.claimedAmountSom != null && payment.claimedAmountSom < payment.amountExpectedSom) {
          underpaymentAmountSom += payment.amountExpectedSom - payment.claimedAmountSom;
        }
        break;
      case "REFUND_REQUIRED":
      case "REFUND_PENDING":
        refundPendingAmountSom += payment.confirmedAmountSom != null ? Math.max(0, payment.confirmedAmountSom - payment.amountExpectedSom) : 0;
        break;
      case "REFUND_CONFIRMED":
        refundCompletedAmountSom += payment.confirmedAmountSom != null ? Math.max(0, payment.confirmedAmountSom - payment.amountExpectedSom) : 0;
        break;
      default:
        break;
    }

    if ((ATTENTION_STATUSES as readonly string[]).includes(payment.status)) {
      const ageMs = now.getTime() - payment.updatedAt.getTime();
      itemsRequiringAttention.push({
        paymentId: payment.id,
        shipmentId: payment.shipmentId,
        reason: payment.status === "PAYMENT_MISMATCH" ? (payment.mismatchReason ?? "Расхождение суммы платежа") : "Ожидает подтверждения казначея",
        amountSom: payment.amountExpectedSom,
        ageMs,
        severity: severityForAgeMs(ageMs),
      });
    }
  }

  return {
    period,
    paymentsRequested: payments.length,
    paymentsAwaiting,
    paymentsUnderReview,
    paymentsConfirmed,
    paymentsRejected,
    totalExpectedAmountSom,
    totalConfirmedAmountSom,
    underpaymentAmountSom,
    overpaymentAmountSom,
    refundPendingAmountSom,
    refundCompletedAmountSom,
    discrepancyCount,
    unresolvedCount: itemsRequiringAttention.length,
    itemsRequiringAttention,
  };
}
