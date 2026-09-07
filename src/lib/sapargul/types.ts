// Dependency-free Sapargul domain types — mirrors src/lib/sapar/types.ts's
// role: the shared vocabulary every other Sapargul file imports from, kept
// free of db/provider imports so it stays trivially unit-testable.
import type { PaymentEvidenceType, PaymentPreliminaryCheckStatus, ShipmentPaymentStatus } from "@prisma/client";

// Deterministic, non-accusatory risk flags (AGENTS spec s.35). These never
// prove fraud — they mean a human (the treasurer) must look closer.
export const DISCREPANCY_FLAGS = [
  "DUPLICATE_REFERENCE",
  "AMOUNT_MISMATCH",
  "RECIPIENT_MISMATCH",
  "ORDER_REFERENCE_MISMATCH",
  "STALE_EVIDENCE",
  "UNREADABLE_EVIDENCE",
  "ALREADY_USED_TRANSACTION",
  "UNKNOWN_PAYMENT_DESTINATION",
  "UNDERPAID",
  "OVERPAID",
  "CURRENCY_MISMATCH",
] as const;
export type DiscrepancyFlag = (typeof DISCREPANCY_FLAGS)[number];

/** What the customer/dispatcher reports about a payment they made — untrusted
 * input, never a confirmation (AGENTS spec s.2/s.11). */
export interface PaymentEvidenceInput {
  evidenceType: PaymentEvidenceType;
  evidenceReference: string;
  claimedAmountSom?: number | null;
  claimedCurrency?: string | null;
  claimedPaymentTime?: Date | null;
  transactionReference?: string | null;
}

/** What Sapargul expects for a given shipment's payment, used as the "EXPECTED"
 * side of the preliminary match (spec s.12). */
export interface ExpectedPayment {
  amountExpectedSom: number;
  currency: string;
  destinationId: string | null;
  orderReference: string;
}

export interface PreliminaryMatchInput {
  expected: ExpectedPayment;
  evidence: PaymentEvidenceInput;
  /** Whether evidence.transactionReference is already tied to a *different*
   * ShipmentPayment — computed by the DB-touching caller, kept as a plain
   * boolean here so the matching logic itself stays pure/testable. */
  isDuplicateReference: boolean;
  now: Date;
}

export interface PreliminaryMatchResult {
  status: PaymentPreliminaryCheckStatus;
  flags: DiscrepancyFlag[];
  notes: string;
}

// Evidence older than this relative to `now` is flagged STALE_EVIDENCE, not
// rejected outright — the treasurer still makes the final call.
export const STALE_EVIDENCE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export type TreasuryConfirmationOutcome = "EXACT" | "UNDERPAID" | "OVERPAID";

export interface TreasuryConfirmationResult {
  outcome: TreasuryConfirmationOutcome;
  nextStatus: ShipmentPaymentStatus;
  flag: DiscrepancyFlag | null;
}

/** The only view Zholaman (cargo delivery manager) may see of a payment —
 * never raw banking data (AGENTS spec s.21). */
export type JolamanPaymentStatus = "PAID" | "PAYMENT_PENDING" | "PAYMENT_PROBLEM";

export interface SapargulReportPeriod {
  from: Date;
  to: Date;
}

export interface SapargulReportItem {
  paymentId: string;
  shipmentId: string;
  reason: string;
  amountSom: number;
  ageMs: number;
  severity: "LOW" | "MEDIUM" | "HIGH";
}

export interface SapargulReport {
  period: SapargulReportPeriod;
  paymentsRequested: number;
  paymentsAwaiting: number;
  paymentsUnderReview: number;
  paymentsConfirmed: number;
  paymentsRejected: number;
  totalExpectedAmountSom: number;
  totalConfirmedAmountSom: number;
  underpaymentAmountSom: number;
  overpaymentAmountSom: number;
  refundPendingAmountSom: number;
  refundCompletedAmountSom: number;
  discrepancyCount: number;
  unresolvedCount: number;
  itemsRequiringAttention: SapargulReportItem[];
}
