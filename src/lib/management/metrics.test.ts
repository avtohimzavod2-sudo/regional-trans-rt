import { describe, expect, it } from "vitest";
import { formatRate, median, minutesBetween, percentile, rate, topCounts } from "./metrics";

describe("rate", () => {
  it("computes a share", () => {
    expect(rate(1, 4)).toBe(0.25);
    expect(rate(4, 4)).toBe(1);
    expect(rate(0, 4)).toBe(0);
  });

  // The distinction this module exists for: "nothing happened" and "everything
  // failed" must not both arrive at the manager as the number 0.
  it("returns null, never 0, when there is nothing to divide", () => {
    expect(rate(0, 0)).toBeNull();
    expect(rate(5, 0)).toBeNull();
    expect(rate(0, -1)).toBeNull();
  });
});

describe("percentile", () => {
  it("returns null for an empty sample rather than 0", () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(median([])).toBeNull();
  });

  it("interpolates between neighbours", () => {
    // position = (4 - 1) * 0.5 = 1.5 -> halfway between 20 and 30
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(percentile([10, 20, 30, 40], 0.9)).toBeCloseTo(37, 10);
  });

  it("returns the exact value when the position lands on an element", () => {
    expect(percentile([10, 20, 30], 0.5)).toBe(20);
    expect(median([7])).toBe(7);
  });

  it("clamps the fraction to the sample bounds", () => {
    expect(percentile([5, 1, 9], 0)).toBe(1);
    expect(percentile([5, 1, 9], 1)).toBe(9);
  });

  it("sorts numerically and does not mutate the caller's array", () => {
    const values = [100, 9, 80];
    expect(median(values)).toBe(80);
    expect(values).toEqual([100, 9, 80]);
  });
});

describe("minutesBetween", () => {
  const at = (iso: string) => new Date(iso);

  it("rounds to whole minutes", () => {
    expect(minutesBetween(at("2026-09-01T10:00:00Z"), at("2026-09-01T10:30:00Z"))).toBe(30);
    expect(minutesBetween(at("2026-09-01T10:00:00Z"), at("2026-09-01T10:00:40Z"))).toBe(1);
  });

  it("returns null when either instant is missing, rather than substituting now or 0", () => {
    expect(minutesBetween(null, at("2026-09-01T10:00:00Z"))).toBeNull();
    expect(minutesBetween(at("2026-09-01T10:00:00Z"), undefined)).toBeNull();
    expect(minutesBetween(null, null)).toBeNull();
  });

  // A response recorded before the proposal it answers is bad data. Reporting
  // it as a negative or absolute duration would launder it into a plausible
  // service-speed number.
  it("returns null for an inconsistent (negative) interval", () => {
    expect(minutesBetween(at("2026-09-01T10:30:00Z"), at("2026-09-01T10:00:00Z"))).toBeNull();
  });

  it("treats a zero interval as 0, not as missing", () => {
    const instant = at("2026-09-01T10:00:00Z");
    expect(minutesBetween(instant, instant)).toBe(0);
  });
});

describe("topCounts", () => {
  it("orders by frequency and truncates to the limit", () => {
    expect(topCounts(["a", "b", "a", "c", "a", "b"], 2)).toEqual([
      { value: "a", count: 3 },
      { value: "b", count: 2 },
    ]);
  });

  // A report whose row order changes on identical data cannot be diffed
  // between periods, which is most of what a manager does with it.
  it("breaks ties alphabetically so output is stable", () => {
    expect(topCounts(["zebra", "alpha", "mid"], 3).map((row) => row.value)).toEqual(["alpha", "mid", "zebra"]);
  });

  it("returns an empty list for no input", () => {
    expect(topCounts([], 5)).toEqual([]);
  });
});

describe("formatRate", () => {
  it("renders a whole percentage", () => {
    expect(formatRate(0.427)).toBe("43%");
    expect(formatRate(0)).toBe("0%");
    expect(formatRate(1)).toBe("100%");
  });

  it("renders null as n/a and never as 0%", () => {
    expect(formatRate(null)).toBe("n/a");
  });
});
