import { describe, expect, it } from "vitest";
import { buildWarningText, classifySeverity, decideClientSanction, decideExecutorSanction, evaluateFairness, isSeriousCase, requiresDocumentedReasoning } from "./policy";
import type { ConductSignal, EvidenceItem, FairnessAssessment, SeriousCaseSignal } from "./types";

const NO_SERIOUS_SIGNAL: SeriousCaseSignal = {
  safetyThreat: false,
  violenceThreat: false,
  confirmedFraud: false,
  dangerousDriving: false,
  bypassOfFinancialOrSafetyControls: false,
  repeatedFakePaymentEvidence: false,
  provenBadFaithDamageOrLoss: false,
  systematicAbuse: false,
};

function evidence(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return { type: "CUSTOMER_FEEDBACK", factStatus: "CLAIM", trust: "MEDIUM", source: "manager", occurredAt: new Date("2026-01-01"), description: "жалоба", ...overrides };
}

function fairness(overrides: Partial<FairnessAssessment> = {}): FairnessAssessment {
  return { sufficientEvidence: true, verifiedFacts: ["подтверждено"], disputedFacts: [], corroboratingItemCount: 1, ...overrides };
}

function conduct(overrides: Partial<ConductSignal> = {}): ConductSignal {
  return { priorWarningsCount: 0, rudenessSeverity: "ORDINARY_FRUSTRATION", continuedAfterWarning: false, ...overrides };
}

// Scenario A: no serious signal at all.
describe("isSeriousCase", () => {
  it("is false when every signal is false", () => {
    expect(isSeriousCase(NO_SERIOUS_SIGNAL)).toBe(false);
  });

  // Scenario B: any single serious signal is enough — a safety/fraud/abuse
  // flag is never diluted by the absence of the others.
  it("is true when any single signal is set", () => {
    for (const key of Object.keys(NO_SERIOUS_SIGNAL) as (keyof SeriousCaseSignal)[]) {
      expect(isSeriousCase({ ...NO_SERIOUS_SIGNAL, [key]: true })).toBe(true);
    }
  });
});

describe("classifySeverity", () => {
  it("is CRITICAL whenever a serious signal is present, regardless of case type", () => {
    expect(classifySeverity("OTHER", { ...NO_SERIOUS_SIGNAL, safetyThreat: true })).toBe("CRITICAL");
    expect(classifySeverity("PRICE_DISPUTE", { ...NO_SERIOUS_SIGNAL, systematicAbuse: true })).toBe("CRITICAL");
  });

  it("is HIGH for safety/damage case types with no serious signal", () => {
    expect(classifySeverity("SAFETY_COMPLAINT", NO_SERIOUS_SIGNAL)).toBe("HIGH");
    expect(classifySeverity("DAMAGE_OR_LOSS", NO_SERIOUS_SIGNAL)).toBe("HIGH");
  });

  it("is NORMAL for abuse/misconduct/payment-dispute case types", () => {
    expect(classifySeverity("CUSTOMER_ABUSE", NO_SERIOUS_SIGNAL)).toBe("NORMAL");
    expect(classifySeverity("EXECUTOR_MISCONDUCT", NO_SERIOUS_SIGNAL)).toBe("NORMAL");
    expect(classifySeverity("PAYMENT_DISPUTE", NO_SERIOUS_SIGNAL)).toBe("NORMAL");
  });

  it("is LOW for everything else", () => {
    expect(classifySeverity("OTHER", NO_SERIOUS_SIGNAL)).toBe("LOW");
    expect(classifySeverity("NO_SHOW", NO_SERIOUS_SIGNAL)).toBe("LOW");
  });
});

// Business invariant: "one complaint is not proof of guilt" (spec s.10).
describe("evaluateFairness", () => {
  it("is insufficient with no evidence at all", () => {
    expect(evaluateFairness([]).sufficientEvidence).toBe(false);
  });

  // Scenario C: a single unverified claim from a single source must never
  // clear the fairness bar on its own.
  it("is insufficient for a single unverified claim from a single source", () => {
    const result = evaluateFairness([evidence({ factStatus: "CLAIM", source: "passenger" })]);
    expect(result.sufficientEvidence).toBe(false);
  });

  it("is sufficient once at least one item is an already-verified fact", () => {
    const result = evaluateFairness([evidence({ factStatus: "VERIFIED_FACT", source: "passenger", description: "подтверждённый факт" })]);
    expect(result.sufficientEvidence).toBe(true);
    expect(result.verifiedFacts).toEqual(["подтверждённый факт"]);
  });

  // Scenario D: two independent unverified sources corroborating each other
  // is also enough, even with zero VERIFIED_FACT items.
  it("is sufficient for two unverified claims from two distinct sources", () => {
    const result = evaluateFairness([evidence({ factStatus: "CLAIM", source: "passenger" }), evidence({ factStatus: "CLAIM", source: "driver" })]);
    expect(result.sufficientEvidence).toBe(true);
  });

  it("does not count two claims from the same source as corroboration", () => {
    const result = evaluateFairness([evidence({ factStatus: "CLAIM", source: "passenger" }), evidence({ factStatus: "CLAIM", source: "passenger" })]);
    expect(result.sufficientEvidence).toBe(false);
  });

  it("excludes disputed items from both verifiedFacts and the source count", () => {
    const result = evaluateFairness([
      evidence({ factStatus: "DISPUTED", source: "passenger", description: "оспаривается 1" }),
      evidence({ factStatus: "DISPUTED", source: "driver", description: "оспаривается 2" }),
    ]);
    expect(result.sufficientEvidence).toBe(false);
    expect(result.disputedFacts).toEqual(["оспаривается 1", "оспаривается 2"]);
    expect(result.verifiedFacts).toEqual([]);
  });
});

describe("buildWarningText", () => {
  // Scenario E: warning wording is neutral and specific (spec s.8) — states
  // the behavior and consequence, no insults or vague language.
  it("states the behavior and the consequence of repetition without extra commentary", () => {
    const text = buildWarningText("грубое обращение с оператором", "временное ограничение доступа");
    expect(text).toContain("грубое обращение с оператором");
    expect(text).toContain("временное ограничение доступа");
    expect(text.toLowerCase()).not.toContain("вы виноваты");
  });
});

describe("decideClientSanction", () => {
  // Scenario F: insufficient evidence never produces a sanction.
  it("returns INSUFFICIENT_EVIDENCE with no sanction and no appeal when evidence is insufficient", () => {
    const result = decideClientSanction({ fairness: fairness({ sufficientEvidence: false }), conduct: conduct(), serious: NO_SERIOUS_SIGNAL, priorSanctionsCount: 0 });
    expect(result.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.sanctionType).toBeNull();
    expect(result.appealAllowed).toBe(false);
  });

  // Scenario G: ordinary frustration that never continued after a warning
  // is de-escalated, not punished — not every irritation is a violation.
  it("de-escalates ordinary frustration with no prior continuation into no sanction", () => {
    const result = decideClientSanction({ fairness: fairness(), conduct: conduct({ rudenessSeverity: "ORDINARY_FRUSTRATION", continuedAfterWarning: false }), serious: NO_SERIOUS_SIGNAL, priorSanctionsCount: 0 });
    expect(result.outcome).toBe("RESOLVED_NO_SANCTION");
    expect(result.sanctionType).toBeNull();
  });

  // Scenario H (spec s.6): a serious signal skips the ladder for an
  // immediate freeze that is TEMPORARY, never a permanent BLOCKED.
  it("applies an immediate TEMPORARY_SUSPENSION — never BLOCKED — for a serious signal", () => {
    const result = decideClientSanction({ fairness: fairness(), conduct: conduct(), serious: { ...NO_SERIOUS_SIGNAL, safetyThreat: true }, priorSanctionsCount: 0 });
    expect(result.sanctionType).toBe("TEMPORARY_SUSPENSION");
    expect(result.durationDays).toBe(3);
    expect(result.appealAllowed).toBe(true);
  });

  // Scenario I: the proportional client ladder climbs one rung per prior
  // sanction and eventually caps at BLOCKED, never skipping ahead on its own.
  it("climbs the client ladder proportionally to priorSanctionsCount", () => {
    expect(decideClientSanction({ fairness: fairness(), conduct: conduct({ rudenessSeverity: "EXCESSIVE_RUDENESS" }), serious: NO_SERIOUS_SIGNAL, priorSanctionsCount: 0 }).sanctionType).toBe("FORMAL_WARNING");
    expect(decideClientSanction({ fairness: fairness(), conduct: conduct({ rudenessSeverity: "EXCESSIVE_RUDENESS" }), serious: NO_SERIOUS_SIGNAL, priorSanctionsCount: 1 }).sanctionType).toBe("TEMPORARY_RESTRICTION");
    expect(decideClientSanction({ fairness: fairness(), conduct: conduct({ rudenessSeverity: "EXCESSIVE_RUDENESS" }), serious: NO_SERIOUS_SIGNAL, priorSanctionsCount: 2 }).sanctionType).toBe("TEMPORARY_SUSPENSION");
    expect(decideClientSanction({ fairness: fairness(), conduct: conduct({ rudenessSeverity: "EXCESSIVE_RUDENESS" }), serious: NO_SERIOUS_SIGNAL, priorSanctionsCount: 3 }).sanctionType).toBe("BLOCKED");
    expect(decideClientSanction({ fairness: fairness(), conduct: conduct({ rudenessSeverity: "EXCESSIVE_RUDENESS" }), serious: NO_SERIOUS_SIGNAL, priorSanctionsCount: 99 }).sanctionType).toBe("BLOCKED");
  });

  // Scenario J: severe/systematic rudeness never starts below rung 3
  // (TEMPORARY_SUSPENSION), even for a first-time offender.
  it("floors SEVERE_OR_SYSTEMATIC rudeness at TEMPORARY_SUSPENSION even with zero priors", () => {
    const result = decideClientSanction({ fairness: fairness(), conduct: conduct({ rudenessSeverity: "SEVERE_OR_SYSTEMATIC" }), serious: NO_SERIOUS_SIGNAL, priorSanctionsCount: 0 });
    expect(result.sanctionType).toBe("TEMPORARY_SUSPENSION");
  });

  it("moves past de-escalation into the ladder once ordinary frustration continues after a warning", () => {
    const result = decideClientSanction({ fairness: fairness(), conduct: conduct({ rudenessSeverity: "ORDINARY_FRUSTRATION", continuedAfterWarning: true }), serious: NO_SERIOUS_SIGNAL, priorSanctionsCount: 0 });
    expect(result.sanctionType).toBe("FORMAL_WARNING");
    expect(result.outcome).toBe("WARNING");
  });
});

describe("decideExecutorSanction", () => {
  it("returns INSUFFICIENT_EVIDENCE with no sanction when evidence is insufficient", () => {
    const result = decideExecutorSanction({ fairness: fairness({ sufficientEvidence: false }), serious: NO_SERIOUS_SIGNAL, priorSanctionsCount: 0 });
    expect(result.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.sanctionType).toBeNull();
  });

  // Scenario K (spec s.6): serious signal freezes an executor with
  // SUSPENDED, still temporary (durationDays set), never a silent
  // permanent BLOCKED.
  it("applies an immediate temporary SUSPENDED — never BLOCKED — for a serious signal", () => {
    const result = decideExecutorSanction({ fairness: fairness(), serious: { ...NO_SERIOUS_SIGNAL, dangerousDriving: true }, priorSanctionsCount: 0 });
    expect(result.sanctionType).toBe("SUSPENDED");
    expect(result.durationDays).toBe(3);
  });

  // Scenario L: the executor ladder climbs one rung per prior sanction and
  // caps at BLOCKED.
  it("climbs the executor ladder proportionally to priorSanctionsCount", () => {
    const ladder = ["ADVISORY", "FORMAL_WARNING", "RELIABILITY_PENALTY", "LIMITED_ACCESS", "SUSPENDED", "BLOCKED", "BLOCKED"];
    ladder.forEach((expected, priorSanctionsCount) => {
      const result = decideExecutorSanction({ fairness: fairness(), serious: NO_SERIOUS_SIGNAL, priorSanctionsCount });
      expect(result.sanctionType).toBe(expected);
    });
  });

  it("classifies ADVISORY and FORMAL_WARNING as WARNING outcomes, not SANCTION_APPLIED", () => {
    expect(decideExecutorSanction({ fairness: fairness(), serious: NO_SERIOUS_SIGNAL, priorSanctionsCount: 0 }).outcome).toBe("WARNING");
    expect(decideExecutorSanction({ fairness: fairness(), serious: NO_SERIOUS_SIGNAL, priorSanctionsCount: 1 }).outcome).toBe("WARNING");
    expect(decideExecutorSanction({ fairness: fairness(), serious: NO_SERIOUS_SIGNAL, priorSanctionsCount: 2 }).outcome).toBe("SANCTION_APPLIED");
  });
});

// Business invariant (spec s.16): a serious sanction is invalid without
// documented reasoning — requiresDocumentedReasoning() is the gate
// recordDecision() enforces before ever calling applySanction().
describe("requiresDocumentedReasoning", () => {
  it("is false for no sanction and for the lightest rungs", () => {
    expect(requiresDocumentedReasoning(null)).toBe(false);
    expect(requiresDocumentedReasoning("DEESCALATION")).toBe(false);
    expect(requiresDocumentedReasoning("EXPLANATION")).toBe(false);
    expect(requiresDocumentedReasoning("ADVISORY")).toBe(false);
    expect(requiresDocumentedReasoning("FORMAL_WARNING")).toBe(false);
  });

  it("is true for every sanction that actually restricts access", () => {
    expect(requiresDocumentedReasoning("BLOCKED")).toBe(true);
    expect(requiresDocumentedReasoning("SUSPENDED")).toBe(true);
    expect(requiresDocumentedReasoning("TEMPORARY_SUSPENSION")).toBe(true);
    expect(requiresDocumentedReasoning("RELIABILITY_PENALTY")).toBe(true);
    expect(requiresDocumentedReasoning("LIMITED_ACCESS")).toBe(true);
  });
});
