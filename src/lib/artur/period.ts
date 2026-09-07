// Pure Asia/Bishkek calendar-period helpers (AGENTS Master Architecture spec
// s.9/s.12/s.31). Bishkek has no DST and is always UTC+6, but we still route
// everything through date-fns-tz rather than hand-rolling a "+6h" offset, so
// a future timezone-policy change (or a DST-observing region reusing this
// module) is a one-line change, not a silent bug. No LLM/scheduler ever
// "remembers" the time here — every date used by the daily/weekly jobs comes
// from one of these deterministic functions.
import { addDays, format } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

export const RT_TIMEZONE = "Asia/Bishkek";

/** "YYYY-MM-DD" for the given instant, as a Bishkek-local calendar date. */
export function bishkekDateKey(instant: Date): string {
  return format(toZonedTime(instant, RT_TIMEZONE), "yyyy-MM-dd");
}

/** [from, to) UTC instants spanning one Bishkek-local calendar day. */
export function bishkekDayWindow(dateKey: string): { from: Date; to: Date } {
  const from = fromZonedTime(`${dateKey}T00:00:00`, RT_TIMEZONE);
  const to = fromZonedTime(`${dateKey}T00:00:00`, RT_TIMEZONE);
  return { from, to: addDays(to, 1) };
}

export function previousBishkekDateKey(dateKey: string): string {
  const { from } = bishkekDayWindow(dateKey);
  return bishkekDateKey(addDays(from, -1));
}

/** The Bishkek-local Monday date key of the week containing `instant`. */
export function bishkekWeekStartKey(instant: Date): string {
  const zoned = toZonedTime(instant, RT_TIMEZONE);
  const isoDow = zoned.getDay() === 0 ? 7 : zoned.getDay(); // Mon=1..Sun=7
  const monday = addDays(zoned, -(isoDow - 1));
  return format(monday, "yyyy-MM-dd");
}

/** [from, to) UTC instants spanning one Bishkek-local Mon-Sun week, plus the
 * Sunday date key for display. */
export function bishkekWeekWindow(weekStartKey: string): { from: Date; to: Date; weekEndKey: string } {
  const from = fromZonedTime(`${weekStartKey}T00:00:00`, RT_TIMEZONE);
  const to = addDays(from, 7);
  const weekEndKey = bishkekDateKey(addDays(to, -1));
  return { from, to, weekEndKey };
}

export function previousBishkekWeekStartKey(weekStartKey: string): string {
  const { from } = bishkekWeekWindow(weekStartKey);
  return bishkekDateKey(addDays(from, -7));
}

export type TrendStatus = "GROWTH" | "STABLE" | "DECLINE";

export interface WeekOverWeekChange {
  currentWeek: number;
  previousWeek: number;
  absoluteChange: number;
  /** null when previousWeek is 0 and currentWeek is also 0 (nothing to
   * compare — not 0%, not Infinity) or when previousWeek is 0 and
   * currentWeek > 0 (a genuine percentage is undefined, not "+Infinity%" —
   * spec s.12's "do not produce misleading infinity/percentage values"). */
  percentageChange: number | null;
  status: TrendStatus;
}

/** Stable band: a change within +/-1% (and no zero-baseline edge case) is
 * reported as STABLE rather than a misleadingly precise GROWTH/DECLINE. */
const STABLE_BAND_PERCENT = 1;

export function computeWeekOverWeekChange(currentWeek: number, previousWeek: number): WeekOverWeekChange {
  const absoluteChange = currentWeek - previousWeek;

  if (previousWeek === 0) {
    const status: TrendStatus = currentWeek === 0 ? "STABLE" : "GROWTH";
    return { currentWeek, previousWeek, absoluteChange, percentageChange: null, status };
  }

  const percentageChange = (absoluteChange / previousWeek) * 100;
  const status: TrendStatus = Math.abs(percentageChange) <= STABLE_BAND_PERCENT ? "STABLE" : percentageChange > 0 ? "GROWTH" : "DECLINE";
  return { currentWeek, previousWeek, absoluteChange, percentageChange, status };
}
