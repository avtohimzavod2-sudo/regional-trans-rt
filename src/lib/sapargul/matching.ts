// Preliminary payment reconciliation (AGENTS spec s.12) — deterministic,
// dependency-free comparison of EXPECTED vs CLAIMED/EVIDENCE. The result is
// always informational for the treasurer; this function's return type
// (PaymentPreliminaryCheckStatus) structurally cannot express "CONFIRMED" —
// there is no such value — so it is impossible for this module to
// accidentally finalize a payment (spec s.2's invariant enforced by types,
// not just discipline).
import type { PreliminaryMatchInput, PreliminaryMatchResult, TreasuryConfirmationResult } from "./types";
import { STALE_EVIDENCE_MS } from "./types";

export function evaluatePreliminaryMatch(input: PreliminaryMatchInput): PreliminaryMatchResult {
  const { expected, evidence, isDuplicateReference, now } = input;
  const flags: PreliminaryMatchResult["flags"] = [];
  const notes: string[] = [];

  if (isDuplicateReference) {
    flags.push("DUPLICATE_REFERENCE", "ALREADY_USED_TRANSACTION");
    notes.push("Транзакция уже привязана к другому платежу.");
  }

  const currencyMismatch = evidence.claimedCurrency != null && evidence.claimedCurrency !== expected.currency;
  if (currencyMismatch) {
    flags.push("CURRENCY_MISMATCH");
    notes.push(`Ожидалась валюта ${expected.currency}, указана ${evidence.claimedCurrency}.`);
  }

  const isStale =
    evidence.claimedPaymentTime != null && now.getTime() - evidence.claimedPaymentTime.getTime() > STALE_EVIDENCE_MS;
  if (isStale) {
    flags.push("STALE_EVIDENCE");
    notes.push("Квитанция датирована более 14 дней назад.");
  }

  if (evidence.claimedAmountSom == null) {
    flags.push("UNREADABLE_EVIDENCE");
    notes.push("Сумма платежа не распознана из предоставленных данных.");
    return { status: "NEEDS_REVIEW", flags, notes: notes.join(" ") };
  }

  if (isDuplicateReference || currencyMismatch) {
    return { status: "MISMATCH", flags, notes: notes.join(" ") };
  }

  const amountDiff = evidence.claimedAmountSom - expected.amountExpectedSom;
  if (amountDiff < 0) {
    flags.push("UNDERPAID");
    notes.push(`Недоплата: ожидалось ${expected.amountExpectedSom}, указано ${evidence.claimedAmountSom}.`);
    return { status: "MISMATCH", flags, notes: notes.join(" ") };
  }
  if (amountDiff > 0) {
    flags.push("OVERPAID");
    notes.push(`Переплата: ожидалось ${expected.amountExpectedSom}, указано ${evidence.claimedAmountSom}.`);
    return { status: "MISMATCH", flags, notes: notes.join(" ") };
  }

  // Amount and currency line up and the reference isn't a duplicate — still
  // only ever LIKELY_MATCH (or NEEDS_REVIEW if stale), never CONFIRMED.
  if (isStale) {
    return { status: "NEEDS_REVIEW", flags, notes: notes.join(" ") };
  }
  notes.push("Сумма и валюта совпадают с ожидаемыми. Требуется подтверждение казначея.");
  return { status: "LIKELY_MATCH", flags, notes: notes.join(" ") };
}

/** Pure decision function for the treasurer's ACTUAL received amount (spec
 * s.14) — distinct from evaluatePreliminaryMatch, which only ever looks at
 * unverified client-claimed evidence. Underpayment never reaches
 * PAYMENT_CONFIRMED; overpayment does (real money did arrive, and covers the
 * order) but is flagged so the excess is never silently kept/lost. */
export function evaluateTreasuryConfirmation(expectedAmountSom: number, actualAmountSom: number): TreasuryConfirmationResult {
  if (actualAmountSom === expectedAmountSom) {
    return { outcome: "EXACT", nextStatus: "PAYMENT_CONFIRMED", flag: null };
  }
  if (actualAmountSom < expectedAmountSom) {
    return { outcome: "UNDERPAID", nextStatus: "PAYMENT_MISMATCH", flag: "UNDERPAID" };
  }
  return { outcome: "OVERPAID", nextStatus: "PAYMENT_CONFIRMED", flag: "OVERPAID" };
}
