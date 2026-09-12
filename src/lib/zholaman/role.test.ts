import { describe, expect, it } from "vitest";
import { isCargoDirectionManagerRole, requireCargoDirectionManagerRole, NotCargoDirectionManagerRoleError } from "./role";

describe("isCargoDirectionManagerRole", () => {
  it("accepts the cargo-direction manager and the standing break-glass roles", () => {
    expect(isCargoDirectionManagerRole("zholaman")).toBe(true);
    expect(isCargoDirectionManagerRole("cargo_manager")).toBe(true);
    expect(isCargoDirectionManagerRole("delivery_manager")).toBe(true);
    expect(isCargoDirectionManagerRole("founder")).toBe(true);
    expect(isCargoDirectionManagerRole("admin")).toBe(true);
  });

  it("normalizes case and surrounding whitespace", () => {
    expect(isCargoDirectionManagerRole("ZHOLAMAN")).toBe(true);
    expect(isCargoDirectionManagerRole(" Zholaman ")).toBe(true);
  });

  it("refuses the passenger manager — the two directions are separate posts", () => {
    expect(isCargoDirectionManagerRole("akzhol")).toBe(false);
    expect(isCargoDirectionManagerRole("passenger_manager")).toBe(false);
  });

  // A cargo manager is not a cargo cashier: confirming a payment stays behind
  // the treasurer gate in src/lib/sapargul/role.ts, and this gate must not
  // become a second door to it.
  it("refuses the financial roles and anything unrecognized", () => {
    expect(isCargoDirectionManagerRole("treasurer")).toBe(false);
    expect(isCargoDirectionManagerRole("accountant")).toBe(false);
    expect(isCargoDirectionManagerRole("dispatcher")).toBe(false);
    expect(isCargoDirectionManagerRole("")).toBe(false);
    expect(isCargoDirectionManagerRole("   ")).toBe(false);
    expect(isCargoDirectionManagerRole("zholaman_bot")).toBe(false);
  });
});

describe("requireCargoDirectionManagerRole", () => {
  it("passes for an authorized role", () => {
    expect(() => requireCargoDirectionManagerRole("zholaman")).not.toThrow();
    expect(() => requireCargoDirectionManagerRole("admin")).not.toThrow();
  });

  it("throws for everyone else", () => {
    expect(() => requireCargoDirectionManagerRole("treasurer")).toThrow(NotCargoDirectionManagerRoleError);
    expect(() => requireCargoDirectionManagerRole("akzhol")).toThrow(NotCargoDirectionManagerRoleError);
    expect(() => requireCargoDirectionManagerRole("")).toThrow(NotCargoDirectionManagerRoleError);
  });
});
