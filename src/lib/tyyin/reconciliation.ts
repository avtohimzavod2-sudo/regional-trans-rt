// Deterministic reconciliation engine (AGENTS Tyyin spec s.9/s.44). Pure,
// dependency-free, exact-match only: a transaction is matched to a
// ShipmentPayment strictly by an exact paymentReference == orderReference
// equality against payments the DB-touching caller has already narrowed to
// "still awaiting money" (see runReconciliationForTransaction below). No
// fuzzy/partial/similarity matching exists here — anything that isn't a
// clean single exact match falls back to NEEDS_MANUAL_RECONCILIATION rather
// than risk a wrong auto-confirmation (spec s.44's central safety rule).
//
// This module never writes ShipmentPayment.status itself — it only decides
// *which* payment (if any) a transaction belongs to and the raw amount
// diff. The actual status transition (and its own underpaid/overpaid
// classification) stays exclusively in src/lib/sapargul/treasury.ts's
// evaluateTreasuryConfirmation, preserving that module's "single writer of
// PAYMENT_CONFIRMED" invariant (spec s.2/s.43) — see
// runReconciliationForTransaction in ./ingestion.ts for how the two compose.
import type { ReconciliationInput, ReconciliationOutcome } from "./types";

export function reconcileTransaction(input: ReconciliationInput): ReconciliationOutcome {
  const { transaction, candidates } = input;

  if (!transaction.paymentReference) return { kind: "NO_REFERENCE_MATCH" };

  const referenceMatches = candidates.filter((c) => c.orderReference === transaction.paymentReference);
  if (referenceMatches.length === 0) return { kind: "NO_REFERENCE_MATCH" };
  if (referenceMatches.length > 1) return { kind: "AMBIGUOUS_MATCH", paymentIds: referenceMatches.map((c) => c.paymentId) };

  const candidate = referenceMatches[0];
  if (candidate.currency !== transaction.currency) return { kind: "CURRENCY_MISMATCH", paymentId: candidate.paymentId };

  const diff = transaction.amountSom - candidate.amountExpectedSom;
  if (diff === 0) return { kind: "MATCHED_EXACT", paymentId: candidate.paymentId };
  if (diff > 0) return { kind: "MATCHED_OVERPAID", paymentId: candidate.paymentId, overpaidSom: diff };
  return { kind: "MATCHED_UNDERPAID", paymentId: candidate.paymentId, underpaidSom: -diff };
}

/** Pure: whether an outcome should ever drive an automatic status write vs.
 * only ever being surfaced for a human/manual re-run — used by
 * runReconciliationForTransaction to decide whether to call into
 * treasury.ts at all. */
export function isActionableMatch(outcome: ReconciliationOutcome): boolean {
  return outcome.kind === "MATCHED_EXACT" || outcome.kind === "MATCHED_OVERPAID" || outcome.kind === "MATCHED_UNDERPAID";
}
