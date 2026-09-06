import { describe, expect, it } from "vitest";
import { computeCommissionSom, computePayEffect } from "./pay";

describe("computeCommissionSom", () => {
  it("charges 100 som per seat", () => {
    expect(computeCommissionSom(1)).toBe(100);
    expect(computeCommissionSom(3)).toBe(300);
  });
});

describe("computePayEffect", () => {
  it("debits the driver's RT Balance for DRIVER_DIRECT_RT_BALANCE", () => {
    const effect = computePayEffect({ mode: "DRIVER_DIRECT_RT_BALANCE", seats: 2 });
    expect(effect.commissionSom).toBe(200);
    expect(effect.entries).toEqual([{ type: "COMMISSION_CHARGE", amountSom: -200, affectsBalance: true }]);
  });

  it("records collection + payout for THROUGH_RT without touching the balance", () => {
    const effect = computePayEffect({ mode: "THROUGH_RT", seats: 2, totalFareSom: 1000 });
    expect(effect.commissionSom).toBe(200);
    expect(effect.entries).toEqual([
      { type: "PAYMENT_COLLECTED", amountSom: 1000, affectsBalance: false },
      { type: "PAYOUT", amountSom: 800, affectsBalance: false },
    ]);
  });

  it("throws for THROUGH_RT without a totalFareSom", () => {
    expect(() => computePayEffect({ mode: "THROUGH_RT", seats: 1 })).toThrow(/totalFareSom is required/);
  });

  it("throws when the fare is less than the commission owed", () => {
    expect(() => computePayEffect({ mode: "THROUGH_RT", seats: 2, totalFareSom: 50 })).toThrow(/cannot be less than/);
  });
});
