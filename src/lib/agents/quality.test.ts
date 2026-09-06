import { describe, expect, it } from "vitest";
import { validateCommissionAmount, validateMatchProposal } from "./quality";

describe("validateMatchProposal", () => {
  const base = {
    requestSeats: 2,
    offerSeatsAvailable: 3,
    requestOriginCorridorId: "c1",
    offerOriginCorridorId: "c1",
    requestTravelDate: "2026-09-10",
    offerTravelDate: "2026-09-10",
  };

  it("passes a well-formed proposal", () => {
    expect(validateMatchProposal(base)).toEqual({ valid: true, violations: [] });
  });

  it("flags insufficient seats", () => {
    const r = validateMatchProposal({ ...base, requestSeats: 5 });
    expect(r.valid).toBe(false);
    expect(r.violations[0]).toMatch(/insufficient_seats/);
  });

  it("flags a corridor mismatch", () => {
    const r = validateMatchProposal({ ...base, offerOriginCorridorId: "c2" });
    expect(r.valid).toBe(false);
    expect(r.violations[0]).toMatch(/corridor_mismatch/);
  });

  it("flags a date mismatch", () => {
    const r = validateMatchProposal({ ...base, offerTravelDate: "2026-09-11" });
    expect(r.valid).toBe(false);
    expect(r.violations[0]).toMatch(/date_mismatch/);
  });

  it("can report multiple violations at once", () => {
    const r = validateMatchProposal({ ...base, requestSeats: 10, offerOriginCorridorId: "c2" });
    expect(r.violations).toHaveLength(2);
  });
});

describe("validateCommissionAmount", () => {
  it("passes when the commission matches 100 som per seat", () => {
    expect(validateCommissionAmount(2, 200)).toEqual({ valid: true, violations: [] });
  });

  it("flags a commission that doesn't match the rule", () => {
    const r = validateCommissionAmount(2, 150);
    expect(r.valid).toBe(false);
    expect(r.violations[0]).toMatch(/commission_mismatch/);
  });
});
