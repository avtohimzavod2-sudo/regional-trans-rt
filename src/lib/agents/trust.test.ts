import { describe, expect, it } from "vitest";
import { evaluateAfterComplaint, evaluateRevealSafety } from "./trust";

describe("evaluateRevealSafety", () => {
  const base = {
    driverStatus: "ACTIVE" as const,
    driverIsFemale: null,
    passengerIsBlocked: false,
    femaleOnlyDriverRequested: false,
  };

  it("allows reveal when everything checks out", () => {
    expect(evaluateRevealSafety(base)).toEqual({ allowed: true });
  });

  it("denies when driver isn't ACTIVE", () => {
    const d = evaluateRevealSafety({ ...base, driverStatus: "SUSPENDED" });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/SUSPENDED/);
  });

  it("denies when the passenger is blocked", () => {
    const d = evaluateRevealSafety({ ...base, passengerIsBlocked: true });
    expect(d.allowed).toBe(false);
  });

  it("denies a female-only request when the driver hasn't declared isFemale", () => {
    const d = evaluateRevealSafety({ ...base, femaleOnlyDriverRequested: true, driverIsFemale: null });
    expect(d.allowed).toBe(false);
  });

  it("denies a female-only request when the driver explicitly declared isFemale=false", () => {
    const d = evaluateRevealSafety({ ...base, femaleOnlyDriverRequested: true, driverIsFemale: false });
    expect(d.allowed).toBe(false);
  });

  it("allows a female-only request when the driver declared isFemale=true", () => {
    const d = evaluateRevealSafety({ ...base, femaleOnlyDriverRequested: true, driverIsFemale: true });
    expect(d.allowed).toBe(true);
  });
});

describe("evaluateAfterComplaint", () => {
  it("does not suggest suspension below the threshold", () => {
    expect(evaluateAfterComplaint(1).suggestSuspend).toBe(false);
    expect(evaluateAfterComplaint(2).suggestSuspend).toBe(false);
  });

  it("suggests suspension at the threshold and beyond", () => {
    expect(evaluateAfterComplaint(3).suggestSuspend).toBe(true);
    expect(evaluateAfterComplaint(5).suggestSuspend).toBe(true);
  });
});
