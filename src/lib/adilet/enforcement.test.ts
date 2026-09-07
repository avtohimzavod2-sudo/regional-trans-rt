import { describe, expect, it } from "vitest";
import { statusEffectFor } from "./enforcement";

describe("statusEffectFor", () => {
  it("maps BLOCKED to BLOCKED", () => {
    expect(statusEffectFor("BLOCKED")).toBe("BLOCKED");
  });

  // Both the executor-specific SUSPENDED rung and the client-side
  // TEMPORARY_SUSPENSION rung land on the same DriverStatus/
  // DeliveryExecutorStatus "SUSPENDED" effect.
  it("maps SUSPENDED and TEMPORARY_SUSPENSION to SUSPENDED", () => {
    expect(statusEffectFor("SUSPENDED")).toBe("SUSPENDED");
    expect(statusEffectFor("TEMPORARY_SUSPENSION")).toBe("SUSPENDED");
  });

  it("maps LIMITED_ACCESS to LIMITED", () => {
    expect(statusEffectFor("LIMITED_ACCESS")).toBe("LIMITED");
  });

  // Business invariant (spec s.33): advisory-level rungs are recorded on
  // the AdiletSanction row but never force a status write — no invented
  // status value for a rung that has none.
  it("has no status effect for advisory-level rungs", () => {
    expect(statusEffectFor("DEESCALATION")).toBeNull();
    expect(statusEffectFor("EXPLANATION")).toBeNull();
    expect(statusEffectFor("FORMAL_WARNING")).toBeNull();
    expect(statusEffectFor("ADVISORY")).toBeNull();
    expect(statusEffectFor("RELIABILITY_PENALTY")).toBeNull();
    expect(statusEffectFor("TEMPORARY_RESTRICTION")).toBeNull();
  });
});
