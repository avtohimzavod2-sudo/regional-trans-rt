import { describe, expect, it } from "vitest";
import { isTreasuryRole, NotTreasurerError, requireTreasuryRole } from "./role";

describe("isTreasuryRole", () => {
  it("is true for treasurer and admin (case-insensitive)", () => {
    expect(isTreasuryRole("treasurer")).toBe(true);
    expect(isTreasuryRole("admin")).toBe(true);
    expect(isTreasuryRole("Treasurer")).toBe(true);
    expect(isTreasuryRole("ADMIN")).toBe(true);
  });

  // Scenario I: unauthorized confirmation must be blocked — dispatcher/sapar/sapargul roles are not treasury.
  it("is false for dispatcher, sapar, sapargul, and unknown roles", () => {
    expect(isTreasuryRole("dispatcher")).toBe(false);
    expect(isTreasuryRole("sapar")).toBe(false);
    expect(isTreasuryRole("sapargul")).toBe(false);
    expect(isTreasuryRole("")).toBe(false);
    expect(isTreasuryRole("random")).toBe(false);
  });
});

describe("requireTreasuryRole", () => {
  it("does not throw for treasurer or admin", () => {
    expect(() => requireTreasuryRole("treasurer")).not.toThrow();
    expect(() => requireTreasuryRole("admin")).not.toThrow();
  });

  // Scenario I: this is the actual gate confirmActualPaymentReceipt relies on.
  it("throws NotTreasurerError for any non-treasury role", () => {
    expect(() => requireTreasuryRole("dispatcher")).toThrow(NotTreasurerError);
    expect(() => requireTreasuryRole("sapar")).toThrow(NotTreasurerError);
    expect(() => requireTreasuryRole("sapargul")).toThrow(NotTreasurerError);
  });
});
