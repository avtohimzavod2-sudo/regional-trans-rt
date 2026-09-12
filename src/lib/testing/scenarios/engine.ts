// Runs many passenger journeys in a deliberately disordered mix, and reports
// what RT actually did with each one.
//
// The point of a batch is not volume. It is that the scenarios arrive in an
// order nobody designed for, against a database that already holds the debris
// of everything before them, and that RT's guarantees hold anyway. A suite
// where each test starts from an empty schema proves the first order of the
// day works.
//
// Three properties make a batch worth trusting:
//
//   1. Reproducible. The order comes from a seeded PRNG, and the seed is in the
//      report. A failure at scenario 173 of 300 is re-runnable.
//   2. Isolated by date, not by cleanup. Matching is keyed on an exact travel
//      date, so giving every slot its own date is what stops one scenario's
//      passenger being handed another scenario's driver. Nothing is truncated
//      between scenarios — the accumulating state is the test.
//   3. Judged, not observed. Every scenario declares its required outcome up
//      front (catalogue.ts) and the batch checks system-wide invariants at the
//      end. A batch that finished is not a batch that passed.
import { runPassengerJourney, type PassengerJourneyResult } from "../journeys/passenger-journey";
import { isSyntheticIdentifier } from "../synthetic";
import { ensureSyntheticGeography } from "../synthetic-fixtures";
import { SCENARIOS, type ScenarioCategory, type ScenarioDefinition } from "./catalogue";
import { checkGlobalInvariants, type InvariantViolation } from "./invariants";

/** mulberry32 — small, fast, and identical on every platform, which is the
 * only property that matters here: a seed has to mean the same batch on a
 * developer's machine and in CI. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface ScenarioRunResult {
  key: string;
  category: ScenarioCategory;
  ref: string;
  verdict: "PASS" | "FAIL";
  expected: string;
  /** The outcome RT reached, or "THREW" when the journey did not finish. */
  actual: string;
  /** Why it failed, in one line. Null on a pass. */
  reason: string | null;
  correlationId: string | null;
  tripRequestId: string | null;
  matchId: string | null;
  tripId: string | null;
  durationMs: number;
}

export interface BatchReport {
  seed: number;
  requested: number;
  ran: number;
  passed: number;
  failed: number;
  byCategory: Record<ScenarioCategory, { passed: number; failed: number }>;
  /** Failures only, so a report can be read without paging through passes. */
  failures: ScenarioRunResult[];
  results: ScenarioRunResult[];
  /** Violations of promises that span the whole batch rather than one
   * scenario — two trips for one request, a negative seat count. */
  invariantViolations: InvariantViolation[];
  durationMs: number;
}

export interface BatchOptions {
  /** How many scenarios to run. The catalogue is cycled through, reshuffled
   * each pass, until this many slots are filled. */
  count: number;
  seed: number;
  /** Scenarios in flight at once. Above 1 this also exercises concurrent
   * matching against the same tables, which is the realistic condition; the
   * per-scenario date isolation keeps the outcomes deterministic anyway. */
  concurrency?: number;
  /** Restrict the mix to certain categories. Omitted means all of them. */
  categories?: readonly ScenarioCategory[];
  /** Pushes the whole batch's travel dates further out. Two batches run
   * back-to-back against the same database need this: dates are the isolation,
   * so without it the second batch's passengers would be offered the first
   * batch's leftover seats. */
  dayOffset?: number;
  /** Called as each scenario finishes. Only for progress output — a batch of
   * 300 takes minutes and silence is indistinguishable from a hang. */
  onResult?: (result: ScenarioRunResult, index: number) => void;
}

export interface PlannedSlot {
  scenario: ScenarioDefinition;
  ref: string;
  daysAhead: number;
}

/** dd.mm.yyyy is written into both messages, so the year is explicit and two
 * slots can never collide on a date — but a batch long enough to wrap a whole
 * year would start reusing days, and with them supply. Well above any batch
 * size the Founder asked for, and cheap to refuse. */
const MAX_BATCH = 360;

/** Builds the batch's running order: the catalogue shuffled, cycled, and
 * reshuffled each time round, so a long batch is not the same sequence
 * repeated. Every slot gets its own travel date.
 *
 * Exported because determinism is a property worth testing on its own, without
 * paying for the journeys. */
export function planBatch(options: BatchOptions): PlannedSlot[] {
  return plan(options, mulberry32(options.seed));
}

function plan(options: BatchOptions, random: () => number): PlannedSlot[] {
  const pool = options.categories
    ? SCENARIOS.filter((s) => options.categories!.includes(s.category))
    : SCENARIOS;
  if (pool.length === 0) throw new Error("scenario batch has no scenarios to run");
  const dayOffset = options.dayOffset ?? 0;
  if (options.count + dayOffset > MAX_BATCH) {
    throw new Error(`a batch of ${options.count} at offset ${dayOffset} would reuse travel dates; ${MAX_BATCH} is the limit`);
  }

  const slots: PlannedSlot[] = [];
  let deck: ScenarioDefinition[] = [];
  for (let i = 0; i < options.count; i++) {
    if (deck.length === 0) deck = shuffled(pool, random);
    const scenario = deck.pop()!;
    slots.push({
      scenario,
      // The seed is in the ref so two batches with different seeds cannot
      // collide on a synthetic identifier if one is cleaned up mid-run.
      ref: `b${options.seed}-${i}-${scenario.key}`,
      // +2 rather than +1: "tomorrow" is close enough to midnight to be a
      // different day by the time a long batch reaches the end of itself.
      daysAhead: 2 + dayOffset + i,
    });
  }
  return slots;
}

async function runOne(
  scenario: ScenarioDefinition,
  ref: string,
  daysAhead: number,
): Promise<ScenarioRunResult> {
  const startedAt = Date.now();
  const base = {
    key: scenario.key,
    category: scenario.category,
    ref,
    expected: scenario.expect,
  };

  let result: PassengerJourneyResult;
  try {
    result = await runPassengerJourney(scenario.spec({ ref, daysAhead }));
  } catch (err) {
    // A journey that throws is always a failure. A business outcome is
    // returned, never raised, so an exception here is RT breaking rather than
    // RT saying no.
    return {
      ...base,
      verdict: "FAIL",
      actual: "THREW",
      reason: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      correlationId: null,
      tripRequestId: null,
      matchId: null,
      tripId: null,
      durationMs: Date.now() - startedAt,
    };
  }

  const identifiers = {
    correlationId: result.correlationId,
    tripRequestId: result.tripRequestId,
    matchId: result.matchId,
    tripId: result.tripId,
  };

  const reason = await judge(scenario, result);
  return {
    ...base,
    ...identifiers,
    verdict: reason === null ? "PASS" : "FAIL",
    actual: result.outcome,
    reason,
    durationMs: Date.now() - startedAt,
  };
}

/** The required outcome first, then the scenario's own promises, then the one
 * promise every scenario makes: nothing left this run for a real person. */
async function judge(scenario: ScenarioDefinition, result: PassengerJourneyResult): Promise<string | null> {
  if (result.outcome !== scenario.expect) {
    return `expected ${scenario.expect}, RT reached ${result.outcome}`;
  }

  const leaked = result.outbound.find((record) => !isSyntheticIdentifier(record.recipient));
  if (leaked) return `a message was addressed to a non-synthetic recipient (${leaked.channel})`;

  if (scenario.verify) {
    try {
      return await scenario.verify(result);
    } catch (err) {
      return `verification failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return null;
}

/** Runs `count` scenarios in a seeded random order and reports on all of them.
 *
 * Never throws for a failing scenario — a batch's job is to tell you about
 * every failure, not to stop at the first one. It does throw if the contour is
 * wrong, which runPassengerJourney checks before touching anything. */
export async function runScenarioBatch(options: BatchOptions): Promise<BatchReport> {
  const startedAt = Date.now();
  const random = mulberry32(options.seed);
  const slots = plan(options, random);

  // Once, up front. Every journey calls this too, but concurrent upserts of the
  // same corridor row race each other; warming it means they all take the
  // read path.
  await ensureSyntheticGeography();

  const concurrency = Math.max(1, options.concurrency ?? 1);
  const results: ScenarioRunResult[] = new Array(slots.length);
  let next = 0;

  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= slots.length) return;
      const slot = slots[index];
      const result = await runOne(slot.scenario, slot.ref, slot.daysAhead);
      results[index] = result;
      options.onResult?.(result, index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, slots.length) }, worker));

  const byCategory = {
    PASSENGER: { passed: 0, failed: 0 },
    DRIVER: { passed: 0, failed: 0 },
    FINANCE: { passed: 0, failed: 0 },
    INFRA: { passed: 0, failed: 0 },
  } satisfies Record<ScenarioCategory, { passed: number; failed: number }>;

  for (const result of results) {
    const bucket = byCategory[result.category];
    if (result.verdict === "PASS") bucket.passed++;
    else bucket.failed++;
  }

  const failures = results.filter((r) => r.verdict === "FAIL");
  return {
    seed: options.seed,
    requested: options.count,
    ran: results.length,
    passed: results.length - failures.length,
    failed: failures.length,
    byCategory,
    failures,
    results,
    invariantViolations: await checkGlobalInvariants(),
    durationMs: Date.now() - startedAt,
  };
}

/** A batch report as a few lines of text. Used by the CLI and by a failing
 * test's message — a bare "expected 0 to be 3" tells you nothing about which
 * three of three hundred. */
export function formatBatchReport(report: BatchReport): string {
  const lines = [
    `seed ${report.seed} · ${report.ran} scenarios · ${report.passed} passed · ${report.failed} failed · ${(report.durationMs / 1000).toFixed(1)}s`,
  ];
  for (const [category, counts] of Object.entries(report.byCategory)) {
    if (counts.passed + counts.failed === 0) continue;
    lines.push(`  ${category.padEnd(9)} ${counts.passed} passed, ${counts.failed} failed`);
  }
  for (const failure of report.failures) {
    lines.push(`  FAIL ${failure.key} [${failure.ref}] — ${failure.reason}`);
  }
  for (const violation of report.invariantViolations) {
    lines.push(`  INVARIANT ${violation.name} — ${violation.detail}`);
  }
  return lines.join("\n");
}
