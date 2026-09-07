import { describe, expect, it } from "vitest";
import { isDirectorReviewRole, NotDirectorReviewRoleError, requireDirectorReviewRole } from "./role";

describe("isDirectorReviewRole", () => {
  it("is true for director and admin (case-insensitive)", () => {
    expect(isDirectorReviewRole("director")).toBe(true);
    expect(isDirectorReviewRole("admin")).toBe(true);
    expect(isDirectorReviewRole("Director")).toBe(true);
    expect(isDirectorReviewRole("ADMIN")).toBe(true);
  });

  // Business invariant: a manager must never be able to rewrite Adilet's
  // independent decision (spec s.23/s.24) — dispatcher/zholaman/akzhol/sapar
  // roles are all rejected, same as any unknown role.
  it("is false for dispatcher, manager, and unknown roles", () => {
    expect(isDirectorReviewRole("dispatcher")).toBe(false);
    expect(isDirectorReviewRole("zholaman")).toBe(false);
    expect(isDirectorReviewRole("akzhol")).toBe(false);
    expect(isDirectorReviewRole("sapar")).toBe(false);
    expect(isDirectorReviewRole("")).toBe(false);
  });
});

describe("requireDirectorReviewRole", () => {
  it("does not throw for director or admin", () => {
    expect(() => requireDirectorReviewRole("director")).not.toThrow();
    expect(() => requireDirectorReviewRole("admin")).not.toThrow();
  });

  it("throws NotDirectorReviewRoleError for any non-director-review role", () => {
    expect(() => requireDirectorReviewRole("dispatcher")).toThrow(NotDirectorReviewRoleError);
    expect(() => requireDirectorReviewRole("zholaman")).toThrow(NotDirectorReviewRoleError);
    expect(() => requireDirectorReviewRole("akzhol")).toThrow(NotDirectorReviewRoleError);
  });
});
