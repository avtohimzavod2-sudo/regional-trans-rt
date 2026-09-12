import { describe, expect, it } from "vitest";
import { isPassengerDirectionManagerRole, requirePassengerDirectionManagerRole, NotPassengerDirectionManagerRoleError } from "./role";

describe("isPassengerDirectionManagerRole", () => {
  it("accepts the passenger-direction manager and the standing break-glass roles", () => {
    expect(isPassengerDirectionManagerRole("akzhol")).toBe(true);
    expect(isPassengerDirectionManagerRole("passenger_manager")).toBe(true);
    expect(isPassengerDirectionManagerRole("founder")).toBe(true);
    expect(isPassengerDirectionManagerRole("admin")).toBe(true);
  });

  it("normalizes case and surrounding whitespace", () => {
    expect(isPassengerDirectionManagerRole("AKZHOL")).toBe(true);
    expect(isPassengerDirectionManagerRole("  Akzhol  ")).toBe(true);
  });

  it("refuses the cargo manager — the two directions are separate posts", () => {
    expect(isPassengerDirectionManagerRole("zholaman")).toBe(false);
    expect(isPassengerDirectionManagerRole("cargo_manager")).toBe(false);
  });

  // Spec s.16: an unrecognized role is a refusal, never a default-allow.
  it("refuses dispatchers, financial roles, and anything unrecognized", () => {
    expect(isPassengerDirectionManagerRole("dispatcher")).toBe(false);
    expect(isPassengerDirectionManagerRole("treasurer")).toBe(false);
    expect(isPassengerDirectionManagerRole("accountant")).toBe(false);
    expect(isPassengerDirectionManagerRole("")).toBe(false);
    expect(isPassengerDirectionManagerRole("   ")).toBe(false);
    expect(isPassengerDirectionManagerRole("akzhol_readonly")).toBe(false);
  });
});

describe("requirePassengerDirectionManagerRole", () => {
  it("passes for an authorized role", () => {
    expect(() => requirePassengerDirectionManagerRole("akzhol")).not.toThrow();
    expect(() => requirePassengerDirectionManagerRole("founder")).not.toThrow();
  });

  it("throws for everyone else", () => {
    expect(() => requirePassengerDirectionManagerRole("dispatcher")).toThrow(NotPassengerDirectionManagerRoleError);
    expect(() => requirePassengerDirectionManagerRole("zholaman")).toThrow(NotPassengerDirectionManagerRoleError);
    expect(() => requirePassengerDirectionManagerRole("")).toThrow(NotPassengerDirectionManagerRoleError);
  });
});
