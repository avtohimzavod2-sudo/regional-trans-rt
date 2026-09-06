import { describe, expect, it } from "vitest";
import { CURRICULUM, MAX_LEVEL, getLevel, isValidLevel } from "./levels";

describe("CURRICULUM", () => {
  it("has exactly 30 levels, numbered 1..30 with no gaps or duplicates", () => {
    expect(CURRICULUM.length).toBe(30);
    expect(MAX_LEVEL).toBe(30);
    const levels = CURRICULUM.map((l) => l.level);
    expect(levels).toEqual([...Array(30)].map((_, i) => i + 1));
  });

  it("gives every level a non-empty code, title, and at least one skill", () => {
    for (const level of CURRICULUM) {
      expect(level.code.length).toBeGreaterThan(0);
      expect(level.title.length).toBeGreaterThan(0);
      expect(level.skills.length).toBeGreaterThan(0);
    }
  });

  it("has unique level codes", () => {
    const codes = CURRICULUM.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("getLevel / isValidLevel", () => {
  it("finds a level by number", () => {
    expect(getLevel(1)?.code).toBe("KY-LIT-BASIC");
    expect(getLevel(30)?.code).toBe("FULL-INTEGRATION");
  });

  it("returns undefined for an out-of-range level", () => {
    expect(getLevel(31)).toBeUndefined();
    expect(getLevel(0)).toBeUndefined();
  });

  it("validates level numbers", () => {
    expect(isValidLevel(1)).toBe(true);
    expect(isValidLevel(30)).toBe(true);
    expect(isValidLevel(31)).toBe(false);
    expect(isValidLevel(0)).toBe(false);
    expect(isValidLevel(1.5)).toBe(false);
  });
});
