import { describe, expect, it } from "vitest";
import { compareStable, formatRate, median, minutesBetween, percentile, rate, topCounts } from "./metrics";

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

describe("compareStable", () => {
  it("orders by code unit, so a Cyrillic/Latin tie sorts the same on every platform", () => {
    // This is the exact pair that turned a green local run into a red CI run:
    // under ICU collation "Ош → Бишкек" sorts before "s_deleted → Ош" on
    // Windows and after it on Linux. Code units have no such opinion — "s" is
    // U+0073, "О" is U+041E, so the Latin row is always first.
    expect(compareStable("Ош → Бишкек", "s_deleted → Ош")).toBeGreaterThan(0);
    expect(compareStable("s_deleted → Ош", "Ош → Бишкек")).toBeLessThan(0);
    expect(compareStable("Ош", "Ош")).toBe(0);
  });

  it("does not fold case the way a collator would", () => {
    // Locale-aware comparison treats "a" and "A" as near-equal and decides the
    // tie by a tertiary rule; here uppercase simply comes first, always.
    expect(compareStable("A", "a")).toBeLessThan(0);
  });

  it("disagrees with localeCompare on the mixed-script case, on purpose", () => {
    // Guards the fix itself: if someone reverts compareStable to a delegating
    // implementation, this fails on at least one of the two platforms rather
    // than silently reintroducing machine-dependent report ordering.
    const byCodeUnit = ["Ош → Бишкек", "s_deleted → Ош"].sort(compareStable);
    expect(byCodeUnit).toEqual(["s_deleted → Ош", "Ош → Бишкек"]);
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
  it("breaks ties by code unit so output is stable", () => {
    expect(topCounts(["zebra", "alpha", "mid"], 3).map((row) => row.value)).toEqual(["alpha", "mid", "zebra"]);
    // Decline reasons and cargo types are Russian, so the tie-break has to be
    // pinned across scripts too, not just within ASCII.
    expect(topCounts(["Дорого", "zebra", "Занят"], 3).map((row) => row.value)).toEqual(["zebra", "Дорого", "Занят"]);
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
