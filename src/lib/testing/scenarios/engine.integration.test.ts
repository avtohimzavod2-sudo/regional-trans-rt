// Phase 5 proof: many orders, in an order nobody designed for, against one
// database that is never reset between them.
//
// The passenger journey test proves one order works. This proves the system
// does — that the twentieth order does not inherit the nineteenth's seats, that
// two passengers cannot buy the same one, and that after a few hundred mixed
// runs the database still says only true things about what happened.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { isSyntheticIdentifier } from "../synthetic";
import { cleanupSyntheticData } from "../synthetic-fixtures";
import { SCENARIOS } from "./catalogue";
import { formatBatchReport, planBatch, runScenarioBatch, type BatchReport } from "./engine";
import { checkGlobalInvariants } from "./invariants";
import { runLastSeatRace } from "./last-seat-race";

// Every batch in this file gets its own slice of the calendar. Travel dates
// are what keeps one scenario's passenger away from another's driver, and that
// has to hold between batches too — otherwise the mixed batch's "nobody is
// driving that day" scenario would find a seat the deterministic batch left
// open, and fail for a reason that says nothing about RT.
const CATALOGUE_BATCH_OFFSET = 0;
const MIXED_BATCH_OFFSET = 60;
const RACE_FIRST_DAY = 320;

// Deliberately not beforeEach: a batch's value is that it accumulates. The
// database is cleaned once at each end so the suite leaves nothing behind and
// starts from a known floor.
beforeAll(async () => {
  await cleanupSyntheticData();
});

afterAll(async () => {
  await cleanupSyntheticData();
});

/** Vitest's diff on a failed array assertion is useless for a batch. Fail with
 * the report instead — it names the scenario, the ref and the reason. */
function reportOn(report: BatchReport): string {
  return `\n${formatBatchReport(report)}\n`;
}

describe("scenario engine — planning", () => {
  it("plans the same batch twice from the same seed", () => {
    const a = planBatch({ count: 40, seed: 20260912 });
    const b = planBatch({ count: 40, seed: 20260912 });
    expect(a.map((s) => s.scenario.key)).toEqual(b.map((s) => s.scenario.key));
    expect(a.map((s) => s.ref)).toEqual(b.map((s) => s.ref));
  });

  it("plans a different batch from a different seed", () => {
    const a = planBatch({ count: 40, seed: 1 });
    const b = planBatch({ count: 40, seed: 2 });
    expect(a.map((s) => s.scenario.key)).not.toEqual(b.map((s) => s.scenario.key));
  });

  it("gives every slot a travel date of its own", () => {
    const days = planBatch({ count: 120, seed: 7 }).map((s) => s.daysAhead);
    expect(new Set(days).size).toBe(days.length);
  });

  it("uses the whole catalogue before repeating any of it", () => {
    const keys = planBatch({ count: SCENARIOS.length, seed: 99 }).map((s) => s.scenario.key);
    expect(new Set(keys).size).toBe(SCENARIOS.length);
  });

  it("refuses a batch long enough to wrap the calendar back onto itself", () => {
    expect(() => planBatch({ count: 400, seed: 1 })).toThrow(/reuse travel dates/);
  });

  it("can be narrowed to one part of the business", () => {
    const keys = planBatch({ count: 6, seed: 3, categories: ["FINANCE"] }).map((s) => s.scenario.key);
    expect(keys.every((key) => SCENARIOS.find((s) => s.key === key)!.category === "FINANCE")).toBe(true);
  });
});

describe("scenario engine — the deterministic set", () => {
  it("runs every scenario in the catalogue and each one reaches its required outcome", async () => {
    const report = await runScenarioBatch({
      count: SCENARIOS.length,
      seed: 1001,
      dayOffset: CATALOGUE_BATCH_OFFSET,
    });

    expect(report.ran).toBe(SCENARIOS.length);
    expect(report.failures, reportOn(report)).toEqual([]);
    expect(report.invariantViolations, reportOn(report)).toEqual([]);
    expect(report.passed).toBe(SCENARIOS.length);

    // Every scenario really ran — not the same one nineteen times.
    expect(new Set(report.results.map((r) => r.key)).size).toBe(SCENARIOS.length);
  }, 300_000);
});

describe("scenario engine — a disordered mix", () => {
  it("survives 40 mixed scenarios run four at a time", async () => {
    const report = await runScenarioBatch({
      count: 40,
      seed: 20260912,
      concurrency: 4,
      dayOffset: MIXED_BATCH_OFFSET,
    });

    expect(report.ran).toBe(40);
    expect(report.failures, reportOn(report)).toEqual([]);
    expect(report.invariantViolations, reportOn(report)).toEqual([]);

    // All four parts of the business were exercised, not just the easy one.
    for (const category of ["PASSENGER", "DRIVER", "FINANCE", "INFRA"] as const) {
      const counts = report.byCategory[category];
      expect(counts.passed + counts.failed, `no ${category} scenario ran`).toBeGreaterThan(0);
    }
  }, 600_000);

  it("left nothing addressed to a real person anywhere in the batch", async () => {
    // Belt and braces over the whole accumulated contour rather than one run:
    // if any stored party is real, the isolation the batch relies on is gone.
    const [passengers, drivers] = await Promise.all([
      db.passenger.findMany({ select: { whatsappId: true } }),
      db.driver.findMany({ select: { telegramUserId: true } }),
    ]);
    expect(passengers.length).toBeGreaterThan(0);
    expect(passengers.every((p) => isSyntheticIdentifier(p.whatsappId))).toBe(true);
    expect(drivers.every((d) => isSyntheticIdentifier(d.telegramUserId))).toBe(true);
  });
});

describe("scenario engine — several passengers, one seat", () => {
  it("will not offer the same seat to a second passenger while the first is deciding", async () => {
    // The deterministic defence, and the one that does the work in practice:
    // an offer already mid-negotiation is not usable supply for anybody else.
    const race = await runLastSeatRace({
      ref: "race-sequential",
      daysAhead: RACE_FIRST_DAY,
      contenders: 3,
      arrival: "SEQUENTIAL",
    });

    expect(race.tripRequestIds).toHaveLength(3);
    expect(race.proposedMatchIds).toHaveLength(1);
    expect(race.confirmedMatchIds).toHaveLength(1);
    expect(race.tripIds).toHaveLength(1);
    expect(race.seatsAvailable).toBe(0);
    expect(race.errors).toEqual([]);
  }, 120_000);

  it("sells the last seat exactly once when the demands arrive together", async () => {
    // Whether the seat is genuinely contested is up to the scheduler, so this
    // does not assert that it was. What it asserts is the part that must hold
    // either way: one seat, one winner, no crash, nothing oversold.
    let contestedRounds = 0;

    for (let round = 0; round < 5; round++) {
      const race = await runLastSeatRace({
        ref: `race-concurrent-${round}`,
        daysAhead: RACE_FIRST_DAY + 5 + round * 3,
        contenders: 4,
      });
      if (race.contested) contestedRounds++;

      const where = `round ${round} (${race.racedMatchIds.length} confirmations in flight)`;
      expect(race.confirmedMatchIds, where).toHaveLength(1);
      expect(race.tripIds, where).toHaveLength(1);
      expect(race.seatsAvailable, where).toBe(0);
      expect(race.seatsAvailable, where).toBeLessThanOrEqual(race.seatsTotal);
      // A loser's confirmation is a business outcome — "that seat has gone" —
      // not a crash. It must not throw out of the webhook handler.
      expect(race.errors, where).toEqual([]);
    }

    // Not an assertion, a record: the concurrent path is only exercised when
    // the scheduler actually interleaves two proposals, and a run where it
    // never did has proven less than it looks like it has.
    console.log(`  last-seat race: ${contestedRounds}/5 rounds genuinely contested the seat`);
  }, 300_000);

  it("leaves the passengers who missed out still waiting, not silently lost", async () => {
    const race = await runLastSeatRace({
      ref: "race-losers",
      daysAhead: RACE_FIRST_DAY + 25,
      contenders: 3,
      arrival: "SEQUENTIAL",
    });

    const requests = await db.tripRequest.findMany({
      where: { id: { in: race.tripRequestIds } },
      select: { id: true, status: true },
    });
    expect(requests.filter((r) => r.status === "CONFIRMED")).toHaveLength(1);
    // Everyone else is back in the pool, waiting for the next car — not
    // cancelled, and not still holding a seat they never got.
    expect(requests.filter((r) => r.status === "PENDING")).toHaveLength(requests.length - 1);
  }, 120_000);

  it("keeps every batch-wide promise afterwards", async () => {
    expect(await checkGlobalInvariants()).toEqual([]);
  });
});

// The 100-300 run the Founder asked for. Off by default: it takes minutes and
// would make every unrelated CI run wait on it. Turned on by
// RT_SCENARIO_SOAK=<count>, which is how the recorded evidence was produced.
const soakCount = Number(process.env.RT_SCENARIO_SOAK ?? 0);
describe.skipIf(!soakCount)("scenario engine — soak", () => {
  // A soak wants the whole calendar to itself, so it starts from a clean floor
  // at offset 0 rather than trying to fit around the batches above.
  beforeAll(async () => {
    await cleanupSyntheticData();
  });

  it(`survives ${soakCount} mixed scenarios`, async () => {
    const report = await runScenarioBatch({
      count: soakCount,
      seed: Number(process.env.RT_SCENARIO_SEED ?? 20260912),
      concurrency: Number(process.env.RT_SCENARIO_CONCURRENCY ?? 6),
      onResult: (result, index) => {
        if (result.verdict === "FAIL") console.error(`  [${index}] FAIL ${result.key}: ${result.reason}`);
        else if ((index + 1) % 25 === 0) console.log(`  ${index + 1}/${soakCount}`);
      },
    });

    console.log(formatBatchReport(report));
    expect(report.failures, reportOn(report)).toEqual([]);
    expect(report.invariantViolations, reportOn(report)).toEqual([]);
  }, 3_600_000);
});
