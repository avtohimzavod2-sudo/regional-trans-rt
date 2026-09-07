import { describe, expect, it } from "vitest";
import { bishkekDateKey, bishkekDayWindow, previousBishkekDateKey, bishkekWeekStartKey, bishkekWeekWindow, previousBishkekWeekStartKey, computeWeekOverWeekChange } from "./period";

describe("bishkekDateKey / bishkekDayWindow", () => {
  it("converts a UTC instant just after Bishkek midnight to the correct local date key", () => {
    // 2026-03-05T00:30:00 Bishkek (UTC+6) = 2026-03-04T18:30:00Z
    expect(bishkekDateKey(new Date("2026-03-04T18:30:00Z"))).toBe("2026-03-05");
  });

  it("converts a UTC instant just before Bishkek midnight to the previous local date key", () => {
    // 2026-03-04T23:30:00 Bishkek (UTC+6) = 2026-03-04T17:30:00Z
    expect(bishkekDateKey(new Date("2026-03-04T17:30:00Z"))).toBe("2026-03-04");
  });

  it("bishkekDayWindow spans exactly 24 hours starting at Bishkek-local midnight", () => {
    const { from, to } = bishkekDayWindow("2026-03-05");
    expect(from.toISOString()).toBe("2026-03-04T18:00:00.000Z");
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe("previousBishkekDateKey", () => {
  it("returns the calendar day before the given key", () => {
    expect(previousBishkekDateKey("2026-03-05")).toBe("2026-03-04");
  });

  it("correctly crosses a month boundary", () => {
    expect(previousBishkekDateKey("2026-03-01")).toBe("2026-02-28");
  });
});

describe("bishkekWeekStartKey", () => {
  it("returns the same Monday for every day within that Mon-Sun week", () => {
    // 2026-03-02 is a Monday.
    expect(bishkekWeekStartKey(bishkekDayWindow("2026-03-02").from)).toBe("2026-03-02");
    expect(bishkekWeekStartKey(bishkekDayWindow("2026-03-05").from)).toBe("2026-03-02"); // Thursday
    expect(bishkekWeekStartKey(bishkekDayWindow("2026-03-08").from)).toBe("2026-03-02"); // Sunday
  });

  it("rolls over to the next Monday once the week is over", () => {
    expect(bishkekWeekStartKey(bishkekDayWindow("2026-03-09").from)).toBe("2026-03-09");
  });
});

describe("bishkekWeekWindow / previousBishkekWeekStartKey", () => {
  it("spans exactly 7 days and reports the correct Sunday end key", () => {
    const { from, to, weekEndKey } = bishkekWeekWindow("2026-03-02");
    expect(to.getTime() - from.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(weekEndKey).toBe("2026-03-08");
  });

  it("previousBishkekWeekStartKey steps back exactly one week", () => {
    expect(previousBishkekWeekStartKey("2026-03-09")).toBe("2026-03-02");
  });
});

describe("computeWeekOverWeekChange", () => {
  it("returns STABLE with null percentageChange when both weeks are zero (spec s.12 zero-baseline)", () => {
    const change = computeWeekOverWeekChange(0, 0);
    expect(change.status).toBe("STABLE");
    expect(change.percentageChange).toBeNull();
    expect(change.absoluteChange).toBe(0);
  });

  it("returns GROWTH with null percentageChange (never Infinity) when previousWeek is 0 and currentWeek is positive", () => {
    const change = computeWeekOverWeekChange(50, 0);
    expect(change.status).toBe("GROWTH");
    expect(change.percentageChange).toBeNull();
    expect(change.absoluteChange).toBe(50);
    expect(Number.isFinite(change.percentageChange as number)).toBe(false); // null, not a finite/Infinity number
  });

  it("computes a real percentage and GROWTH status for a normal increase", () => {
    const change = computeWeekOverWeekChange(120, 100);
    expect(change.percentageChange).toBe(20);
    expect(change.status).toBe("GROWTH");
  });

  it("computes a real percentage and DECLINE status for a normal decrease", () => {
    const change = computeWeekOverWeekChange(80, 100);
    expect(change.percentageChange).toBe(-20);
    expect(change.status).toBe("DECLINE");
  });

  it("treats a change within +/-1% as STABLE rather than GROWTH/DECLINE", () => {
    const change = computeWeekOverWeekChange(100.5, 100);
    expect(change.status).toBe("STABLE");
  });
});
