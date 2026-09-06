import { describe, expect, it } from "vitest";
import { computeJolchuKpiSummary, runJolchuBenchmark, type JolchuCaseScoreResult } from "./benchmark";
import { BENCHMARK_CASES } from "./benchmark-cases";

describe("computeJolchuKpiSummary (pure)", () => {
  function score(overrides: Partial<JolchuCaseScoreResult>): JolchuCaseScoreResult {
    return { code: "X", category: "ROUTING_DECISION", passed: true, failureCategories: [], hallucinationDetected: false, ...overrides };
  }

  it("computes overallScore as passed/total", () => {
    const summary = computeJolchuKpiSummary([score({ passed: true }), score({ passed: true }), score({ passed: false })]);
    expect(summary.totalCases).toBe(3);
    expect(summary.passedCases).toBe(2);
    expect(summary.overallScore).toBeCloseTo(2 / 3, 9);
  });

  it("returns null accuracy for a category with no cases", () => {
    const summary = computeJolchuKpiSummary([score({ category: "ROUTING_DECISION" })]);
    expect(summary.routeCalculationAccuracy).toBeNull();
  });

  it("counts hallucinations independently of pass/fail", () => {
    const summary = computeJolchuKpiSummary([score({ passed: false, hallucinationDetected: true })]);
    expect(summary.hallucinationCount).toBe(1);
  });

  it("returns overallScore 0 for an empty case set rather than throwing", () => {
    expect(computeJolchuKpiSummary([]).overallScore).toBe(0);
  });
});

// ROUTING_DECISION-kind cases never call resolveRouteIntelligence() and never
// touch the database (decideJolchuRouting() is pure) — safe to exercise the
// real runJolchuBenchmark pipeline end to end in CI. FULL_RESOLUTION cases
// always write one AuditLogEntry per request (see benchmark.ts's doc
// comment), so they are exercised separately via a live DB-backed check, not
// unit tests.
describe("runJolchuBenchmark — ROUTING_DECISION cases (persist: false, no DB)", () => {
  const routingCases = BENCHMARK_CASES.filter((c) => c.kind === "ROUTING_DECISION");

  it("passes every mandatory routing-decision scenario against the real decision logic", async () => {
    const outcome = await runJolchuBenchmark({ cases: routingCases, persist: false });
    expect(outcome.runId).toBeNull();
    expect(outcome.summary.totalCases).toBe(routingCases.length);
    expect(outcome.summary.hallucinationCount).toBe(0);
    const failed = outcome.scores.filter((s) => !s.passed);
    expect(failed).toEqual([]);
  });
});
