import { describe, expect, it } from "vitest";
import { isFounderRole, requireFounderRole, NotFounderRoleError } from "./role";

describe("isFounderRole", () => {
  it("is true for founder and admin (case-insensitive)", () => {
    expect(isFounderRole("founder")).toBe(true);
    expect(isFounderRole("admin")).toBe(true);
    expect(isFounderRole("FOUNDER")).toBe(true);
    expect(isFounderRole("Admin")).toBe(true);
  });

  it("is false for owner, treasurer, accountant, tyyin, and unknown roles", () => {
    expect(isFounderRole("owner")).toBe(false);
    expect(isFounderRole("treasurer")).toBe(false);
    expect(isFounderRole("accountant")).toBe(false);
    expect(isFounderRole("tyyin")).toBe(false);
    expect(isFounderRole("")).toBe(false);
  });
});

describe("requireFounderRole", () => {
  it("does not throw for founder or admin", () => {
    expect(() => requireFounderRole("founder")).not.toThrow();
    expect(() => requireFounderRole("admin")).not.toThrow();
  });

  it("throws NotFounderRoleError for any non-founder role", () => {
    expect(() => requireFounderRole("owner")).toThrow(NotFounderRoleError);
    expect(() => requireFounderRole("dispatcher")).toThrow(NotFounderRoleError);
  });
});
