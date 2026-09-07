import { describe, expect, it } from "vitest";
import { evaluatePreliminaryMatch, evaluateTreasuryConfirmation } from "./matching";
import type { PreliminaryMatchInput } from "./types";

const NOW = new Date("2026-09-07T12:00:00Z");

function baseInput(overrides: Partial<PreliminaryMatchInput> = {}): PreliminaryMatchInput {
  return {
    expected: { amountExpectedSom: 1000, currency: "KGS", destinationId: "dest-1", orderReference: "RT-1-PAY" },
    evidence: { evidenceType: "RECEIPT_IMAGE", evidenceReference: "ref-1", claimedAmountSom: 1000, claimedCurrency: "KGS", claimedPaymentTime: NOW },
    isDuplicateReference: false,
    now: NOW,
    ...overrides,
  };
}

describe("evaluatePreliminaryMatch", () => {
  // Scenario H: exact amount/currency match — still only LIKELY_MATCH, never CONFIRMED.
  it("returns LIKELY_MATCH for an exact amount/currency match (never CONFIRMED)", () => {
    const result = evaluatePreliminaryMatch(baseInput());
    expect(result.status).toBe("LIKELY_MATCH");
    expect(result.status).not.toBe("CONFIRMED");
  });

  // Scenario F: underpayment must never look like a full match.
  it("flags underpayment as MISMATCH with an UNDERPAID flag (scenario F)", () => {
    const result = evaluatePreliminaryMatch(baseInput({ evidence: { evidenceType: "RECEIPT_IMAGE", evidenceReference: "ref-1", claimedAmountSom: 900, claimedCurrency: "KGS", claimedPaymentTime: NOW } }));
    expect(result.status).toBe("MISMATCH");
    expect(result.flags).toContain("UNDERPAID");
  });

  // Scenario G: overpayment is a discrepancy to review, not silently absorbed.
  it("flags overpayment as MISMATCH with an OVERPAID flag (scenario G)", () => {
    const result = evaluatePreliminaryMatch(baseInput({ evidence: { evidenceType: "RECEIPT_IMAGE", evidenceReference: "ref-1", claimedAmountSom: 1100, claimedCurrency: "KGS", claimedPaymentTime: NOW } }));
    expect(result.status).toBe("MISMATCH");
    expect(result.flags).toContain("OVERPAID");
  });

  // Scenario D: currency/recipient-style mismatch must not be treated as a match.
  it("flags a currency mismatch as MISMATCH", () => {
    const result = evaluatePreliminaryMatch(baseInput({ evidence: { evidenceType: "RECEIPT_IMAGE", evidenceReference: "ref-1", claimedAmountSom: 1000, claimedCurrency: "USD", claimedPaymentTime: NOW } }));
    expect(result.status).toBe("MISMATCH");
    expect(result.flags).toContain("CURRENCY_MISMATCH");
  });

  // Scenario E: duplicate transaction reference can never confirm two orders.
  it("flags a duplicate transaction reference as MISMATCH with DUPLICATE_REFERENCE/ALREADY_USED_TRANSACTION", () => {
    const result = evaluatePreliminaryMatch(baseInput({ isDuplicateReference: true }));
    expect(result.status).toBe("MISMATCH");
    expect(result.flags).toContain("DUPLICATE_REFERENCE");
    expect(result.flags).toContain("ALREADY_USED_TRANSACTION");
  });

  // Scenario C: unreadable/fake evidence must not be treated as a match either.
  it("flags unreadable evidence (no claimed amount) as NEEDS_REVIEW, never a match", () => {
    const result = evaluatePreliminaryMatch(baseInput({ evidence: { evidenceType: "RECEIPT_IMAGE", evidenceReference: "ref-1", claimedAmountSom: null, claimedCurrency: "KGS", claimedPaymentTime: NOW } }));
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.flags).toContain("UNREADABLE_EVIDENCE");
  });

  it("flags stale evidence older than 14 days as NEEDS_REVIEW even if amounts match", () => {
    const oldTime = new Date(NOW.getTime() - 20 * 24 * 60 * 60 * 1000);
    const result = evaluatePreliminaryMatch(baseInput({ evidence: { evidenceType: "RECEIPT_IMAGE", evidenceReference: "ref-1", claimedAmountSom: 1000, claimedCurrency: "KGS", claimedPaymentTime: oldTime } }));
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.flags).toContain("STALE_EVIDENCE");
  });

  it("never returns a status other than LIKELY_MATCH/MISMATCH/NEEDS_REVIEW", () => {
    const statuses = new Set([
      evaluatePreliminaryMatch(baseInput()).status,
      evaluatePreliminaryMatch(baseInput({ isDuplicateReference: true })).status,
      evaluatePreliminaryMatch(baseInput({ evidence: { evidenceType: "RECEIPT_IMAGE", evidenceReference: "r", claimedAmountSom: null } })).status,
    ]);
    for (const s of statuses) {
      expect(["LIKELY_MATCH", "MISMATCH", "NEEDS_REVIEW"]).toContain(s);
    }
  });
});

describe("evaluateTreasuryConfirmation", () => {
  // Scenario H: exact match — the only case that reaches PAYMENT_CONFIRMED cleanly.
  it("returns EXACT/PAYMENT_CONFIRMED/no flag when actual equals expected", () => {
    const result = evaluateTreasuryConfirmation(1000, 1000);
    expect(result).toEqual({ outcome: "EXACT", nextStatus: "PAYMENT_CONFIRMED", flag: null });
  });

  // Scenario F: underpayment never reaches PAYMENT_CONFIRMED.
  it("returns UNDERPAID/PAYMENT_MISMATCH/UNDERPAID flag when actual is less than expected", () => {
    const result = evaluateTreasuryConfirmation(1000, 900);
    expect(result).toEqual({ outcome: "UNDERPAID", nextStatus: "PAYMENT_MISMATCH", flag: "UNDERPAID" });
    expect(result.nextStatus).not.toBe("PAYMENT_CONFIRMED");
  });

  // Scenario G: overpayment still confirms (money did arrive and covers the order) but flags the excess.
  it("returns OVERPAID/PAYMENT_CONFIRMED/OVERPAID flag when actual exceeds expected, never losing the excess", () => {
    const result = evaluateTreasuryConfirmation(1000, 1100);
    expect(result).toEqual({ outcome: "OVERPAID", nextStatus: "PAYMENT_CONFIRMED", flag: "OVERPAID" });
  });
});
