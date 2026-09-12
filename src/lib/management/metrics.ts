// Pure statistics shared by the two direction-manager modules (Akzhol —
// passenger, Zholaman — delivery/cargo). Kept in its own neutral module
// rather than in either manager's folder, so neither imports the other and
// neither owns the other's arithmetic.
//
// Nothing here touches a database, a clock or a language model, so every rule
// a manager report acts on is directly unit-testable.

/** Share of `part` in `total`, 0..1, or null when there is nothing to divide.
 *
 * Returning null rather than 0 is the whole point. "No matches were proposed"
 * and "0% of proposed matches were confirmed" read identically as a number and
 * mean completely different things — the first is an empty period, the second
 * is a broken funnel. A manager who cannot tell them apart will eventually act
 * on the wrong one. Same reasoning as the null percentageChange in
 * src/lib/artur/period.ts. */
export function rate(part: number, total: number): number | null {
  if (total <= 0) return null;
  return part / total;
}

/** Linear-interpolated percentile of a sample, or null for an empty sample.
 * `fraction` is 0..1 (0.5 = median). Sorts a copy; the caller's array is not
 * mutated. */
export function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  if (fraction <= 0) return Math.min(...values);
  if (fraction >= 1) return Math.max(...values);

  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function median(values: readonly number[]): number | null {
  return percentile(values, 0.5);
}

/** Whole minutes between two instants, or null if either is missing.
 *
 * Null propagates deliberately: a match with no recorded response timestamp
 * contributes nothing to a handling-time statistic. Substituting 0, or "now",
 * would invent a response that never happened. */
export function minutesBetween(from: Date | null | undefined, to: Date | null | undefined): number | null {
  if (!from || !to) return null;
  const ms = to.getTime() - from.getTime();
  // A negative interval means the timestamps are inconsistent (clock skew, or
  // a bug upstream). Reporting it as a duration would launder bad data into a
  // plausible number, so it is dropped and surfaced as a count instead.
  if (ms < 0) return null;
  return Math.round(ms / 60_000);
}

/** Tie-break comparator for report rows. Deliberately NOT `localeCompare`.
 *
 * `localeCompare` resolves through the platform's ICU data, so a tie between a
 * Cyrillic and a Latin string — "Ош → Бишкек" against "s_deleted → Ош" — sorts
 * one way on a developer's Windows machine and the other way on CI's Linux.
 * That is a real defect this cost a red build to find: a report whose row order
 * depends on where it ran cannot be diffed, and a test pinning that order is
 * only pinning one machine.
 *
 * Code-unit order is the same everywhere. It is not linguistically correct
 * ordering, and it does not need to be: this decides ties between rows that are
 * already equal on the thing the reader cares about. */
export function compareStable(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Counts occurrences and returns the `limit` most frequent, ties broken by
 * `compareStable` so the output is identical on every machine (a report whose
 * row order changes on identical data cannot be diffed). */
export function topCounts(values: readonly string[], limit: number): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || compareStable(a.value, b.value))
    .slice(0, limit);
}

/** Formats a 0..1 rate as a whole percentage for use inside anomaly text.
 * Null becomes "n/a" — never "0%". */
export function formatRate(value: number | null): string {
  return value === null ? "n/a" : `${Math.round(value * 100)}%`;
}
