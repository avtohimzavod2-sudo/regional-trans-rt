import { describe, expect, it } from "vitest";
import { KPI_THRESHOLDS, computeKpiSummary, meetsThresholds } from "./kpi";
import type { CaseScoreResult } from "./scoring";

function makeScore(overrides: Partial<CaseScoreResult> = {}): CaseScoreResult {
  return {
    code: "X",
    passed: true,
    roleApplicable: true,
    roleCorrect: true,
    languageApplicable: true,
    languageCorrect: true,
    routeApplicable: true,
    routeCorrect: true,
    dateTimeApplicable: true,
    dateTimeCorrect: true,
    seatsApplicable: true,
    seatsCorrect: true,
    phoneApplicable: true,
    phoneCorrect: true,
    clarificationApplicable: true,
    clarificationCorrect: true,
    routingApplicable: true,
    routingCorrect: true,
    hallucinated: false,
    failureCategories: [],
    ...overrides,
  };
}

describe("computeKpiSummary", () => {
  it("computes 100% accuracy for an all-correct batch", () => {
    const summary = computeKpiSummary([makeScore(), makeScore(), makeScore()]);
    expect(summary.roleAccuracy).toBe(1);
    expect(summary.routeAccuracy).toBe(1);
    expect(summary.hallucinationCount).toBe(0);
    expect(summary.overallScore).toBe(1);
  });

  it("only counts applicable cases toward each field's accuracy", () => {
    const summary = computeKpiSummary([
      makeScore({ phoneApplicable: false, phoneCorrect: true }),
      makeScore({ phoneApplicable: true, phoneCorrect: false }),
    ]);
    expect(summary.phoneAccuracy).toBe(0); // 0 correct / 1 applicable
  });

  it("reports null (not 0 or 1) for a field with zero applicable cases", () => {
    const summary = computeKpiSummary([makeScore({ phoneApplicable: false })]);
    expect(summary.phoneAccuracy).toBeNull();
  });

  it("tracks hallucination rate across the batch", () => {
    const summary = computeKpiSummary([makeScore({ hallucinated: true }), makeScore(), makeScore(), makeScore()]);
    expect(summary.hallucinationCount).toBe(1);
    expect(summary.hallucinationRate).toBe(0.25);
  });

  it("returns an empty-safe summary for zero cases", () => {
    const summary = computeKpiSummary([]);
    expect(summary.totalCases).toBe(0);
    expect(summary.overallScore).toBeNull();
    expect(summary.hallucinationRate).toBe(0);
  });
});

describe("meetsThresholds", () => {
  it("passes a batch that clears every threshold with zero hallucinations", () => {
    const summary = computeKpiSummary(Array.from({ length: 20 }, () => makeScore()));
    expect(meetsThresholds(summary)).toBe(true);
  });

  it("fails when phone accuracy is below the 99.9% threshold", () => {
    const scores = Array.from({ length: 100 }, () => makeScore());
    scores[0] = makeScore({ phoneCorrect: false });
    const summary = computeKpiSummary(scores);
    expect(summary.phoneAccuracy).toBeLessThan(KPI_THRESHOLDS.phone);
    expect(meetsThresholds(summary)).toBe(false);
  });

  it("fails on any hallucination at all (zero tolerance)", () => {
    const scores = Array.from({ length: 100 }, () => makeScore());
    scores[0] = makeScore({ hallucinated: true });
    const summary = computeKpiSummary(scores);
    expect(meetsThresholds(summary)).toBe(false);
  });

  it("fails when a metric has no applicable cases at all", () => {
    const summary = computeKpiSummary([makeScore({ phoneApplicable: false })]);
    expect(meetsThresholds(summary)).toBe(false);
  });
});
