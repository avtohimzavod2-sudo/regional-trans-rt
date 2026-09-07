import { describe, expect, it } from "vitest";
import {
  isAccountantRole,
  isOwnerRole,
  isTreasuryOpsRole,
  NotAccountantRoleError,
  NotOwnerRoleError,
  NotTreasuryOpsRoleError,
  requireAccountantRole,
  requireOwnerRole,
  requireTreasuryOpsRole,
} from "./role";

describe("isTreasuryOpsRole", () => {
  it("is true for treasurer, admin, and tyyin (case-insensitive)", () => {
    expect(isTreasuryOpsRole("treasurer")).toBe(true);
    expect(isTreasuryOpsRole("admin")).toBe(true);
    expect(isTreasuryOpsRole("tyyin")).toBe(true);
    expect(isTreasuryOpsRole("TREASURER")).toBe(true);
  });

  it("is false for accountant, owner, dispatcher, and unknown roles", () => {
    expect(isTreasuryOpsRole("accountant")).toBe(false);
    expect(isTreasuryOpsRole("owner")).toBe(false);
    expect(isTreasuryOpsRole("dispatcher")).toBe(false);
    expect(isTreasuryOpsRole("")).toBe(false);
  });
});

describe("isAccountantRole", () => {
  it("is true for accountant and admin (case-insensitive)", () => {
    expect(isAccountantRole("accountant")).toBe(true);
    expect(isAccountantRole("admin")).toBe(true);
    expect(isAccountantRole("Accountant")).toBe(true);
  });

  // Business invariant: Tyyin never records its own accountant resolution
  // (spec s.24) — "tyyin" itself must be rejected here, same as any
  // ordinary dispatcher/treasurer role.
  it("is false for tyyin, treasurer, owner, and unknown roles", () => {
    expect(isAccountantRole("tyyin")).toBe(false);
    expect(isAccountantRole("treasurer")).toBe(false);
    expect(isAccountantRole("owner")).toBe(false);
    expect(isAccountantRole("")).toBe(false);
  });
});

describe("isOwnerRole", () => {
  it("is true for owner, founder, and admin (case-insensitive)", () => {
    expect(isOwnerRole("owner")).toBe(true);
    expect(isOwnerRole("founder")).toBe(true);
    expect(isOwnerRole("admin")).toBe(true);
    expect(isOwnerRole("OWNER")).toBe(true);
  });

  it("is false for treasurer, accountant, tyyin, and unknown roles", () => {
    expect(isOwnerRole("treasurer")).toBe(false);
    expect(isOwnerRole("accountant")).toBe(false);
    expect(isOwnerRole("tyyin")).toBe(false);
    expect(isOwnerRole("")).toBe(false);
  });
});

describe("requireTreasuryOpsRole", () => {
  it("does not throw for treasurer, admin, or tyyin", () => {
    expect(() => requireTreasuryOpsRole("treasurer")).not.toThrow();
    expect(() => requireTreasuryOpsRole("admin")).not.toThrow();
    expect(() => requireTreasuryOpsRole("tyyin")).not.toThrow();
  });

  it("throws NotTreasuryOpsRoleError for any non-treasury-ops role", () => {
    expect(() => requireTreasuryOpsRole("accountant")).toThrow(NotTreasuryOpsRoleError);
    expect(() => requireTreasuryOpsRole("owner")).toThrow(NotTreasuryOpsRoleError);
  });
});

describe("requireAccountantRole", () => {
  it("does not throw for accountant or admin", () => {
    expect(() => requireAccountantRole("accountant")).not.toThrow();
    expect(() => requireAccountantRole("admin")).not.toThrow();
  });

  it("throws NotAccountantRoleError for tyyin or any other non-accountant role", () => {
    expect(() => requireAccountantRole("tyyin")).toThrow(NotAccountantRoleError);
    expect(() => requireAccountantRole("treasurer")).toThrow(NotAccountantRoleError);
  });
});

describe("requireOwnerRole", () => {
  it("does not throw for owner, founder, or admin", () => {
    expect(() => requireOwnerRole("owner")).not.toThrow();
    expect(() => requireOwnerRole("founder")).not.toThrow();
    expect(() => requireOwnerRole("admin")).not.toThrow();
  });

  it("throws NotOwnerRoleError for any non-owner role", () => {
    expect(() => requireOwnerRole("treasurer")).toThrow(NotOwnerRoleError);
    expect(() => requireOwnerRole("tyyin")).toThrow(NotOwnerRoleError);
  });
});
