// Dependency-free Tyyin domain types (AGENTS Tyyin spec s.9/s.10/s.38/s.65)
// — mirrors src/lib/sapargul/types.ts's role: the shared vocabulary every
// other Tyyin file imports from, kept free of db/provider imports so it
// stays trivially unit-testable.
import type { TreasuryDepartment } from "@prisma/client";

/** A single real bank transaction as the adapter layer reports it — never a
 * receipt/screenshot/OCR/customer's word (spec s.2's source-of-truth rule). */
export interface IncomingBankTransaction {
  externalTransactionId: string;
  accountRef: string;
  amountSom: number;
  currency: string;
  paymentReference: string | null;
  counterpartyMasked: string | null;
  transactionTime: Date;
}

export interface AccountStatusSnapshot {
  accountRef: string;
  label: string;
  environment: "SANDBOX" | "PRODUCTION";
  isReachable: boolean;
  lastSyncedAt: Date;
}

export interface ApprovedPaymentInstructionView {
  destinationId: string;
  label: string;
  method: string;
  accountReference: string | null;
  instructionsText: string | null;
}

/** A candidate ShipmentPayment the reconciliation engine may match a
 * transaction to — the DB-touching caller resolves candidates by exact
 * orderReference lookup; this shape keeps the matching logic itself pure
 * (spec s.44: deterministic, never fuzzy). */
export interface ReconciliationCandidatePayment {
  paymentId: string;
  orderReference: string;
  amountExpectedSom: number;
  currency: string;
}

export interface ReconciliationInput {
  transaction: {
    amountSom: number;
    currency: string;
    paymentReference: string | null;
  };
  candidates: ReconciliationCandidatePayment[];
}

export type ReconciliationOutcome =
  | { kind: "MATCHED_EXACT"; paymentId: string }
  | { kind: "MATCHED_OVERPAID"; paymentId: string; overpaidSom: number }
  | { kind: "MATCHED_UNDERPAID"; paymentId: string; underpaidSom: number }
  | { kind: "NO_REFERENCE_MATCH" }
  | { kind: "AMBIGUOUS_MATCH"; paymentIds: string[] }
  | { kind: "CURRENCY_MISMATCH"; paymentId: string };

export interface TreasuryPeriod {
  from: Date;
  to: Date;
}

export interface TreasuryPeriodReport {
  period: TreasuryPeriod;
  transactionsReceived: number;
  transactionsMatched: number;
  transactionsNeedingManualReconciliation: number;
  totalReceivedSom: number;
  totalMatchedSom: number;
  overpaymentSom: number;
  underpaymentSom: number;
  accountantCasesOpened: number;
  accountantCasesResolved: number;
  accountantCasesOpenAtEnd: number;
  byDepartment: Partial<Record<TreasuryDepartment, { transactionsReceived: number; totalReceivedSom: number }>>;
}

export type TreasuryDailyReport = TreasuryPeriodReport;
export type TreasuryWeeklyReport = TreasuryPeriodReport;
