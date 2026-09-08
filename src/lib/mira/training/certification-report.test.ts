import { describe, expect, it } from "vitest";
import { buildCertificationReport } from "./certification-report";
import { computeKpiSummary } from "./kpi";
import type { CaseScoreResult } from "./scoring";

function perfectScore(code: string, overrides: Partial<CaseScoreResult> = {}): CaseScoreResult {
  return {
    code,
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

const ALL_CATEGORIES = [
  "LANGUAGE_UNDERSTANDING",
  "STRUCTURED_EXTRACTION",
  "CLARIFICATION_DISCIPLINE",
  "HALLUCINATION_PREVENTION",
  "CONVERSATION_CONTINUITY",
  "SAFE_ROUTING",
] as const;

describe("buildCertificationReport", () => {
  it("reports every one of the 6 certification categories", () => {
    const scores = Array.from({ length: 50 }, (_, i) => perfectScore(`case-${i}`));
    const report = buildCertificationReport(scores, computeKpiSummary(scores));
    const reported = report.categories.map((c) => c.category);
    for (const category of ALL_CATEGORIES) {
      expect(reported).toContain(category);
    }
  });

  it("reports CONVERSATION_CONTINUITY as NOT_EVALUATED when no CORRECTION_NEXT_MESSAGE case ran", () => {
    const scores = [perfectScore("KY-LIT-001")];
    const report = buildCertificationReport(scores, computeKpiSummary(scores));
    const continuity = report.categories.find((c) => c.category === "CONVERSATION_CONTINUITY")!;
    expect(continuity.status).toBe("NOT_EVALUATED");
    expect(continuity.score).toBeNull();
  });

  it("reports CONVERSATION_CONTINUITY as PASS when the real CORRECTION-001 case passes", () => {
    const scores = [perfectScore("CORRECTION-001")];
    const report = buildCertificationReport(scores, computeKpiSummary(scores));
    const continuity = report.categories.find((c) => c.category === "CONVERSATION_CONTINUITY")!;
    expect(continuity.status).toBe("PASS");
    expect(continuity.applicableCases).toBe(1);
  });

  it("reports CONVERSATION_CONTINUITY as FAIL with case detail when CORRECTION-001 fails", () => {
    const scores = [perfectScore("CORRECTION-001", { passed: false, failureCategories: ["DATE"] })];
    const report = buildCertificationReport(scores, computeKpiSummary(scores));
    const continuity = report.categories.find((c) => c.category === "CONVERSATION_CONTINUITY")!;
    expect(continuity.status).toBe("FAIL");
    expect(continuity.failedCases).toEqual([{ code: "CORRECTION-001", failureCategories: ["DATE"] }]);
  });

  it("marks HALLUCINATION_PREVENTION as FAIL and lists the offending case when any case hallucinates", () => {
    const scores = [perfectScore("a"), perfectScore("b", { hallucinated: true, failureCategories: ["HALLUCINATION"] })];
    const report = buildCertificationReport(scores, computeKpiSummary(scores));
    const hallucination = report.categories.find((c) => c.category === "HALLUCINATION_PREVENTION")!;
    expect(hallucination.status).toBe("FAIL");
    expect(hallucination.failedCases.map((f) => f.code)).toEqual(["b"]);
  });

  it("marks STRUCTURED_EXTRACTION as FAIL when only one sub-field (e.g. route) is wrong", () => {
    const scores = [perfectScore("a", { routeCorrect: false, failureCategories: ["ROUTE"] })];
    const report = buildCertificationReport(scores, computeKpiSummary(scores));
    const extraction = report.categories.find((c) => c.category === "STRUCTURED_EXTRACTION")!;
    expect(extraction.status).toBe("FAIL");
  });

  it("never returns CERTIFIED or PRODUCTION_APPROVED for a perfect run", () => {
    const scores = Array.from({ length: 50 }, (_, i) => perfectScore(`case-${i}`));
    const report = buildCertificationReport(scores, computeKpiSummary(scores));
    expect(["TRAINEE", "CERTIFICATION_PENDING"]).toContain(report.status);
  });

  it("downgrades a would-be CERTIFICATION_PENDING run to TRAINEE when a mandatory category (safe routing) fails", () => {
    const scores = Array.from({ length: 49 }, (_, i) => perfectScore(`case-${i}`));
    scores.push(perfectScore("case-49", { routingCorrect: false, failureCategories: ["ROUTING"] }));
    const summary = computeKpiSummary(scores);
    const report = buildCertificationReport(scores, summary);

    expect(report.status).toBe("TRAINEE");
    expect(report.reason).toContain("SAFE_ROUTING");
  });

  it("never upgrades TRAINEE to CERTIFICATION_PENDING even if all 6 categories individually pass", () => {
    // KPI thresholds themselves are unmet (phone below 99.9%), so the base
    // decision is TRAINEE — the report must not override that upward.
    const scores = Array.from({ length: 100 }, (_, i) => perfectScore(`case-${i}`));
    scores[0] = perfectScore("case-0", { phoneCorrect: false, failureCategories: ["PHONE"] });
    const summary = computeKpiSummary(scores);
    const report = buildCertificationReport(scores, summary);
    expect(report.status).toBe("TRAINEE");
  });

  it("returns TRAINEE with no categories evaluated for an empty run", () => {
    const summary = computeKpiSummary([]);
    const report = buildCertificationReport([], summary);
    expect(report.status).toBe("TRAINEE");
    expect(report.totalCases).toBe(0);
    for (const c of report.categories) {
      expect(c.status).toBe("NOT_EVALUATED");
    }
  });
});
