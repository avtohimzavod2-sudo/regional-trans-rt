import { describe, expect, it } from "vitest";
import { clientFacingSummary, executorOutcomeFor, managerCaseView } from "./bridge";

describe("executorOutcomeFor", () => {
  it("flags a reliability impact note only for a RELIABILITY_PENALTY sanction", () => {
    const withPenalty = executorOutcomeFor({ caseId: "c1", outcome: "SANCTION_APPLIED", sanctionType: "RELIABILITY_PENALTY", reviewMode: "ADILET_REVIEW" });
    expect(withPenalty.reliabilityImpactNote).not.toBeNull();

    const withoutPenalty = executorOutcomeFor({ caseId: "c1", outcome: "SANCTION_APPLIED", sanctionType: "SUSPENDED", reviewMode: "ADILET_REVIEW" });
    expect(withoutPenalty.reliabilityImpactNote).toBeNull();
  });

  it("marks needsMoreEvidence only for INSUFFICIENT_EVIDENCE", () => {
    expect(executorOutcomeFor({ caseId: "c1", outcome: "INSUFFICIENT_EVIDENCE", sanctionType: null, reviewMode: "ADILET_REVIEW" }).needsMoreEvidence).toBe(true);
    expect(executorOutcomeFor({ caseId: "c1", outcome: "NO_VIOLATION", sanctionType: null, reviewMode: "ADILET_REVIEW" }).needsMoreEvidence).toBe(false);
  });

  it("marks escalatedToDirector only in DIRECTOR_REVIEW mode", () => {
    expect(executorOutcomeFor({ caseId: "c1", outcome: "WARNING", sanctionType: "ADVISORY", reviewMode: "DIRECTOR_REVIEW" }).escalatedToDirector).toBe(true);
    expect(executorOutcomeFor({ caseId: "c1", outcome: "WARNING", sanctionType: "ADVISORY", reviewMode: "ADILET_REVIEW" }).escalatedToDirector).toBe(false);
  });
});

// Business invariant (spec s.23/s.24/s.44): a manager view is outcome-level
// only — this test locks the shape down to exactly those fields so a future
// edit can't accidentally start leaking raw evidence/personal detail through it.
describe("managerCaseView", () => {
  it("carries only outcome-level fields, never raw evidence", () => {
    const view = managerCaseView({ caseId: "c1", caseType: "EXECUTOR_MISCONDUCT", outcome: "SANCTION_APPLIED", sanctionType: "SUSPENDED", status: "DECIDED", repeatOffender: true });
    expect(Object.keys(view).sort()).toEqual(["caseId", "caseType", "executorSanction", "outcome", "repeatOffender", "status"].sort());
    expect(view.executorSanction).toBe("SUSPENDED");
  });
});

// Business invariant (spec s.20/s.45): the only thing Mira may ever relay
// to a client — calm and neutral, never internal reasoning.
describe("clientFacingSummary", () => {
  it("returns a neutral message for a known status", () => {
    const summary = clientFacingSummary("c1", "DECIDED");
    expect(summary.neutralMessage).toBe("По вашему обращению принято решение.");
  });

  it("falls back to a generic neutral message for an unknown status", () => {
    const summary = clientFacingSummary("c1", "SOME_UNKNOWN_STATUS");
    expect(summary.neutralMessage).toBe("Ваше обращение обрабатывается.");
  });
});
