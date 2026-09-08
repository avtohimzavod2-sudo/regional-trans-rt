import { describe, expect, it } from "vitest";
import { decideCertificationStatus } from "./certification";
import { computeKpiSummary } from "./kpi";
import type { CaseScoreResult } from "./scoring";

function perfectScore(code: string): CaseScoreResult {
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
  };
}

describe("decideCertificationStatus", () => {
  it("returns TRAINEE when no cases were run", () => {
    const summary = computeKpiSummary([]);
    expect(decideCertificationStatus(summary).status).toBe("TRAINEE");
  });

  it("returns TRAINEE when thresholds are not met", () => {
    const summary = computeKpiSummary([{ ...perfectScore("a"), phoneCorrect: false }]);
    expect(decideCertificationStatus(summary).status).toBe("TRAINEE");
  });

  it("returns CERTIFICATION_PENDING — never CERTIFIED or PRODUCTION_APPROVED — for a perfect run", () => {
    const scores = Array.from({ length: 50 }, (_, i) => perfectScore(`case-${i}`));
    const summary = computeKpiSummary(scores);
    const decision = decideCertificationStatus(summary);
    expect(decision.status).toBe("CERTIFICATION_PENDING");
    expect(decision.status).not.toBe("CERTIFIED");
    expect(decision.status).not.toBe("PRODUCTION_APPROVED");
  });

  it("never returns a status outside {TRAINEE, CERTIFICATION_PENDING} for any input", () => {
    const allowedStatuses = new Set(["TRAINEE", "CERTIFICATION_PENDING"]);
    const scenarios = [
      computeKpiSummary([]),
      computeKpiSummary(Array.from({ length: 50 }, (_, i) => perfectScore(`case-${i}`))),
      computeKpiSummary(Array.from({ length: 50 }, (_, i) => ({ ...perfectScore(`case-${i}`), hallucinated: true }))),
    ];
    for (const summary of scenarios) {
      expect(allowedStatuses.has(decideCertificationStatus(summary).status)).toBe(true);
    }
  });
});
