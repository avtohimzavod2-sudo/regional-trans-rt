import { describe, expect, it } from "vitest";
import { canTransitionPayment, isBookingAllowed } from "./payment-lifecycle";

describe("canTransitionPayment", () => {
  it("allows the normal happy path from request through confirmation", () => {
    expect(canTransitionPayment("PAYMENT_REQUIRED", "PAYMENT_INSTRUCTIONS_READY")).toBe(true);
    expect(canTransitionPayment("PAYMENT_INSTRUCTIONS_READY", "AWAITING_PAYMENT")).toBe(true);
    expect(canTransitionPayment("AWAITING_PAYMENT", "PAYMENT_EVIDENCE_RECEIVED")).toBe(true);
    expect(canTransitionPayment("PAYMENT_EVIDENCE_RECEIVED", "PAYMENT_REVIEW")).toBe(true);
    expect(canTransitionPayment("PAYMENT_REVIEW", "AWAITING_TREASURER_CONFIRMATION")).toBe(true);
    expect(canTransitionPayment("AWAITING_TREASURER_CONFIRMATION", "PAYMENT_CONFIRMED")).toBe(true);
  });

  // The central financial invariant (AGENTS Sapargul spec s.2/s.43): a
  // receipt/evidence submission can never itself reach PAYMENT_CONFIRMED —
  // only AWAITING_TREASURER_CONFIRMATION or PAYMENT_MISMATCH may.
  it("never allows PAYMENT_CONFIRMED to be reached except from AWAITING_TREASURER_CONFIRMATION or PAYMENT_MISMATCH", () => {
    expect(canTransitionPayment("PAYMENT_EVIDENCE_RECEIVED", "PAYMENT_CONFIRMED")).toBe(false);
    expect(canTransitionPayment("PAYMENT_REVIEW", "PAYMENT_CONFIRMED")).toBe(false);
    expect(canTransitionPayment("AWAITING_PAYMENT", "PAYMENT_CONFIRMED")).toBe(false);
    expect(canTransitionPayment("PAYMENT_REQUIRED", "PAYMENT_CONFIRMED")).toBe(false);
    expect(canTransitionPayment("PAYMENT_INSTRUCTIONS_READY", "PAYMENT_CONFIRMED")).toBe(false);
    expect(canTransitionPayment("AWAITING_TREASURER_CONFIRMATION", "PAYMENT_CONFIRMED")).toBe(true);
    expect(canTransitionPayment("PAYMENT_MISMATCH", "PAYMENT_CONFIRMED")).toBe(true);
  });

  it("allows a mismatch to be resubmitted for another round of evidence via AWAITING_PAYMENT", () => {
    expect(canTransitionPayment("PAYMENT_MISMATCH", "AWAITING_PAYMENT")).toBe(true);
  });

  it("allows rejection to be retried", () => {
    expect(canTransitionPayment("PAYMENT_REJECTED", "AWAITING_PAYMENT")).toBe(true);
  });

  it("allows a refund to start only after confirmation, mismatch, or rejection... only after confirmation or mismatch", () => {
    expect(canTransitionPayment("PAYMENT_CONFIRMED", "REFUND_REQUIRED")).toBe(true);
    expect(canTransitionPayment("PAYMENT_MISMATCH", "REFUND_REQUIRED")).toBe(true);
    expect(canTransitionPayment("REFUND_REQUIRED", "REFUND_PENDING")).toBe(true);
    expect(canTransitionPayment("REFUND_PENDING", "REFUND_CONFIRMED")).toBe(true);
  });

  it("treats REFUND_CONFIRMED and CANCELLED as terminal", () => {
    expect(canTransitionPayment("REFUND_CONFIRMED", "PAYMENT_REQUIRED")).toBe(false);
    expect(canTransitionPayment("CANCELLED", "PAYMENT_REQUIRED")).toBe(false);
  });

  it("rejects skipping states", () => {
    expect(canTransitionPayment("PAYMENT_REQUIRED", "AWAITING_PAYMENT")).toBe(false);
    expect(canTransitionPayment("AWAITING_PAYMENT", "AWAITING_TREASURER_CONFIRMATION")).toBe(false);
  });
});

describe("isBookingAllowed", () => {
  it("is true only for PAYMENT_CONFIRMED", () => {
    expect(isBookingAllowed("PAYMENT_CONFIRMED")).toBe(true);
    expect(isBookingAllowed("AWAITING_TREASURER_CONFIRMATION")).toBe(false);
    expect(isBookingAllowed("PAYMENT_EVIDENCE_RECEIVED")).toBe(false);
    expect(isBookingAllowed("PAYMENT_REVIEW")).toBe(false);
    expect(isBookingAllowed("AWAITING_PAYMENT")).toBe(false);
  });
});
