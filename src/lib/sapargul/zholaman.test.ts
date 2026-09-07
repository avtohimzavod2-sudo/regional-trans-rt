import { describe, expect, it } from "vitest";
import { paymentStatusForJolaman } from "./zholaman";

describe("paymentStatusForJolaman", () => {
  it("collapses PAYMENT_CONFIRMED and all REFUND_* statuses to PAID", () => {
    expect(paymentStatusForJolaman("PAYMENT_CONFIRMED")).toBe("PAID");
    expect(paymentStatusForJolaman("REFUND_REQUIRED")).toBe("PAID");
    expect(paymentStatusForJolaman("REFUND_PENDING")).toBe("PAID");
    expect(paymentStatusForJolaman("REFUND_CONFIRMED")).toBe("PAID");
  });

  it("collapses PAYMENT_MISMATCH, PAYMENT_REJECTED, and CANCELLED to PAYMENT_PROBLEM", () => {
    expect(paymentStatusForJolaman("PAYMENT_MISMATCH")).toBe("PAYMENT_PROBLEM");
    expect(paymentStatusForJolaman("PAYMENT_REJECTED")).toBe("PAYMENT_PROBLEM");
    expect(paymentStatusForJolaman("CANCELLED")).toBe("PAYMENT_PROBLEM");
  });

  it("defaults every other (in-progress) status to PAYMENT_PENDING", () => {
    expect(paymentStatusForJolaman("PAYMENT_REQUIRED")).toBe("PAYMENT_PENDING");
    expect(paymentStatusForJolaman("PAYMENT_INSTRUCTIONS_READY")).toBe("PAYMENT_PENDING");
    expect(paymentStatusForJolaman("AWAITING_PAYMENT")).toBe("PAYMENT_PENDING");
    expect(paymentStatusForJolaman("PAYMENT_EVIDENCE_RECEIVED")).toBe("PAYMENT_PENDING");
    expect(paymentStatusForJolaman("PAYMENT_REVIEW")).toBe("PAYMENT_PENDING");
    expect(paymentStatusForJolaman("AWAITING_TREASURER_CONFIRMATION")).toBe("PAYMENT_PENDING");
  });
});
