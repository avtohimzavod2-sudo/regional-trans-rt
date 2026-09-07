import { describe, expect, it } from "vitest";
import { isActionableMatch, reconcileTransaction } from "./reconciliation";
import type { ReconciliationCandidatePayment } from "./types";

const candidate = (overrides: Partial<ReconciliationCandidatePayment> = {}): ReconciliationCandidatePayment => ({
  paymentId: "pay_1",
  orderReference: "RT-1001",
  amountExpectedSom: 1000,
  currency: "KGS",
  ...overrides,
});

describe("reconcileTransaction", () => {
  it("returns NO_REFERENCE_MATCH when the transaction has no paymentReference", () => {
    const outcome = reconcileTransaction({ transaction: { amountSom: 1000, currency: "KGS", paymentReference: null }, candidates: [candidate()] });
    expect(outcome).toEqual({ kind: "NO_REFERENCE_MATCH" });
  });

  it("returns NO_REFERENCE_MATCH when no candidate's orderReference matches", () => {
    const outcome = reconcileTransaction({ transaction: { amountSom: 1000, currency: "KGS", paymentReference: "RT-9999" }, candidates: [candidate()] });
    expect(outcome).toEqual({ kind: "NO_REFERENCE_MATCH" });
  });

  it("returns AMBIGUOUS_MATCH when more than one candidate shares the same orderReference", () => {
    const outcome = reconcileTransaction({
      transaction: { amountSom: 1000, currency: "KGS", paymentReference: "RT-1001" },
      candidates: [candidate({ paymentId: "pay_1" }), candidate({ paymentId: "pay_2" })],
    });
    expect(outcome).toEqual({ kind: "AMBIGUOUS_MATCH", paymentIds: ["pay_1", "pay_2"] });
  });

  it("returns CURRENCY_MISMATCH when the single matching candidate has a different currency", () => {
    const outcome = reconcileTransaction({
      transaction: { amountSom: 1000, currency: "USD", paymentReference: "RT-1001" },
      candidates: [candidate({ currency: "KGS" })],
    });
    expect(outcome).toEqual({ kind: "CURRENCY_MISMATCH", paymentId: "pay_1" });
  });

  it("returns MATCHED_EXACT when the amount equals the expected amount exactly", () => {
    const outcome = reconcileTransaction({
      transaction: { amountSom: 1000, currency: "KGS", paymentReference: "RT-1001" },
      candidates: [candidate({ amountExpectedSom: 1000 })],
    });
    expect(outcome).toEqual({ kind: "MATCHED_EXACT", paymentId: "pay_1" });
  });

  it("returns MATCHED_OVERPAID with the excess amount when the transaction exceeds what was expected", () => {
    const outcome = reconcileTransaction({
      transaction: { amountSom: 1200, currency: "KGS", paymentReference: "RT-1001" },
      candidates: [candidate({ amountExpectedSom: 1000 })],
    });
    expect(outcome).toEqual({ kind: "MATCHED_OVERPAID", paymentId: "pay_1", overpaidSom: 200 });
  });

  it("returns MATCHED_UNDERPAID with the shortfall amount when the transaction is less than expected", () => {
    const outcome = reconcileTransaction({
      transaction: { amountSom: 800, currency: "KGS", paymentReference: "RT-1001" },
      candidates: [candidate({ amountExpectedSom: 1000 })],
    });
    expect(outcome).toEqual({ kind: "MATCHED_UNDERPAID", paymentId: "pay_1", underpaidSom: 200 });
  });
});

describe("isActionableMatch", () => {
  it("is true for MATCHED_EXACT, MATCHED_OVERPAID, and MATCHED_UNDERPAID", () => {
    expect(isActionableMatch({ kind: "MATCHED_EXACT", paymentId: "p" })).toBe(true);
    expect(isActionableMatch({ kind: "MATCHED_OVERPAID", paymentId: "p", overpaidSom: 1 })).toBe(true);
    expect(isActionableMatch({ kind: "MATCHED_UNDERPAID", paymentId: "p", underpaidSom: 1 })).toBe(true);
  });

  it("is false for NO_REFERENCE_MATCH, AMBIGUOUS_MATCH, and CURRENCY_MISMATCH", () => {
    expect(isActionableMatch({ kind: "NO_REFERENCE_MATCH" })).toBe(false);
    expect(isActionableMatch({ kind: "AMBIGUOUS_MATCH", paymentIds: ["p"] })).toBe(false);
    expect(isActionableMatch({ kind: "CURRENCY_MISMATCH", paymentId: "p" })).toBe(false);
  });
});
