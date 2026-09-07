// ADILET policy engine — pure, dependency-free, deterministic (AGENTS
// Adilet spec s.28/s.29). Classification / evidence / policy / decision are
// kept as separate pure functions here; enforcement (the only place that
// touches the DB) lives in enforcement.ts. Nothing in this file relies on
// opaque model judgment — every output traces back to a concrete input
// field, so a director reading a decision can always see the structured
// basis for it (spec s.28's explainability invariant).
import type { AdiletDecisionOutcome, AdiletSanctionType } from "@prisma/client";
import type { ConductSignal, EvidenceItem, FairnessAssessment, LadderDecision, SeriousCaseSignal } from "./types";

// Client ladder (spec s.5): DEESCALATION/EXPLANATION are non-punitive and
// never produce an AdiletSanction row — only these four rungs are actual
// sanctions.
const CLIENT_LADDER: AdiletSanctionType[] = ["FORMAL_WARNING", "TEMPORARY_RESTRICTION", "TEMPORARY_SUSPENSION", "BLOCKED"];

// Executor/driver ladder (spec s.5).
const EXECUTOR_LADDER: AdiletSanctionType[] = ["ADVISORY", "FORMAL_WARNING", "RELIABILITY_PENALTY", "LIMITED_ACCESS", "SUSPENDED", "BLOCKED"];

const CLIENT_SANCTION_DURATION_DAYS: Partial<Record<AdiletSanctionType, number>> = {
  TEMPORARY_RESTRICTION: 7,
  TEMPORARY_SUSPENSION: 14,
};

const EXECUTOR_SANCTION_DURATION_DAYS: Partial<Record<AdiletSanctionType, number>> = {
  RELIABILITY_PENALTY: 14,
  LIMITED_ACCESS: 14,
  SUSPENDED: 30,
};

/** Pure: whether any spec s.6 serious-case signal is present. A true result
 * permits an immediate TEMPORARY freeze — never, by itself, a permanent
 * BLOCKED (that still requires the full reasoning in recordDecision). */
export function isSeriousCase(signal: SeriousCaseSignal): boolean {
  return (
    signal.safetyThreat ||
    signal.violenceThreat ||
    signal.confirmedFraud ||
    signal.dangerousDriving ||
    signal.bypassOfFinancialOrSafetyControls ||
    signal.repeatedFakePaymentEvidence ||
    signal.provenBadFaithDamageOrLoss ||
    signal.systematicAbuse
  );
}

/** Pure: case severity/intake priority (spec s.11/s.39). Serious signals
 * always outrank ordinary rudeness, regardless of case type. */
export function classifySeverity(caseType: string, serious: SeriousCaseSignal): "LOW" | "NORMAL" | "HIGH" | "CRITICAL" {
  if (isSeriousCase(serious)) return "CRITICAL";
  if (caseType === "SAFETY_COMPLAINT" || caseType === "DAMAGE_OR_LOSS") return "HIGH";
  if (caseType === "CUSTOMER_ABUSE" || caseType === "EXECUTOR_MISCONDUCT" || caseType === "PAYMENT_DISPUTE") return "NORMAL";
  return "LOW";
}

/** Pure: cross-references a case's evidence into verified facts vs.
 * disputed/unverified claims (spec s.10/s.14). A single evidence item from
 * a single source is never enough on its own — one complaint is not proof
 * of guilt. At least one already-VERIFIED_FACT item, or at least two items
 * from independent sources corroborating each other, is required before
 * the ladder may impose any sanction. */
export function evaluateFairness(evidence: EvidenceItem[]): FairnessAssessment {
  const verifiedFacts = evidence.filter((e) => e.factStatus === "VERIFIED_FACT").map((e) => e.description);
  const disputedFacts = evidence.filter((e) => e.factStatus === "DISPUTED").map((e) => e.description);
  const distinctSources = new Set(evidence.filter((e) => e.factStatus !== "DISPUTED").map((e) => e.source));

  return {
    sufficientEvidence: verifiedFacts.length > 0 || distinctSources.size >= 2,
    verifiedFacts,
    disputedFacts,
    corroboratingItemCount: verifiedFacts.length,
  };
}

/** Pure: clear, specific, neutral, non-humiliating warning text (spec
 * s.8) — states the unacceptable behavior and the consequence of
 * repetition, nothing more. */
export function buildWarningText(unacceptableBehavior: string, consequenceOfRepetition: string): string {
  return `RT отмечает: ${unacceptableBehavior}. Просим впредь этого не допускать. При повторении: ${consequenceOfRepetition}.`;
}

function insufficientEvidenceDecision(): LadderDecision {
  return {
    outcome: "INSUFFICIENT_EVIDENCE",
    sanctionType: null,
    proportionalityReason: "недостаточно подтверждающих фактов — единичная непроверенная жалоба не считается доказательством вины (spec s.10)",
    durationDays: null,
    appealAllowed: false,
  };
}

function seriousFreezeDecision(subjectLabel: string, sanctionType: AdiletSanctionType): LadderDecision {
  return {
    outcome: "SANCTION_APPLIED",
    sanctionType,
    proportionalityReason: `подтверждён серьёзный сигнал (угроза безопасности/мошенничество/системное злоупотребление) — немедленная ВРЕМЕННАЯ заморозка ${subjectLabel} до полного разбора, не постоянная блокировка (spec s.6)`,
    durationDays: 3,
    appealAllowed: true,
  };
}

/** Pure: client-side decision (spec s.5/s.7). Ordinary frustration that
 * hasn't continued after a prior warning is de-escalated with no sanction
 * at all — not every irritation is a violation. */
export function decideClientSanction(input: { fairness: FairnessAssessment; conduct: ConductSignal; serious: SeriousCaseSignal; priorSanctionsCount: number }): LadderDecision {
  if (!input.fairness.sufficientEvidence) return insufficientEvidenceDecision();
  if (isSeriousCase(input.serious)) return seriousFreezeDecision("клиента", "TEMPORARY_SUSPENSION");

  if (input.conduct.rudenessSeverity === "ORDINARY_FRUSTRATION" && !input.conduct.continuedAfterWarning) {
    return {
      outcome: "RESOLVED_NO_SANCTION",
      sanctionType: null,
      proportionalityReason: "обычное раздражение клиента, не нарушение поведения (spec s.7) — деэскалация без санкции",
      durationDays: null,
      appealAllowed: false,
    };
  }

  let rungIndex = Math.min(input.priorSanctionsCount, CLIENT_LADDER.length - 1);
  if (input.conduct.rudenessSeverity === "SEVERE_OR_SYSTEMATIC") rungIndex = Math.min(Math.max(rungIndex, 2), CLIENT_LADDER.length - 1);
  const sanctionType = CLIENT_LADDER[rungIndex];

  return {
    outcome: sanctionType === "FORMAL_WARNING" ? "WARNING" : "SANCTION_APPLIED",
    sanctionType,
    proportionalityReason: `ступень ${rungIndex + 1}/${CLIENT_LADDER.length} пропорциональной шкалы клиента при ${input.priorSanctionsCount} предыдущих санкциях (spec s.5)`,
    durationDays: CLIENT_SANCTION_DURATION_DAYS[sanctionType] ?? null,
    appealAllowed: true,
  };
}

/** Pure: driver/executor-side decision (spec s.5/s.9). */
export function decideExecutorSanction(input: { fairness: FairnessAssessment; serious: SeriousCaseSignal; priorSanctionsCount: number }): LadderDecision {
  if (!input.fairness.sufficientEvidence) return insufficientEvidenceDecision();
  if (isSeriousCase(input.serious)) return seriousFreezeDecision("исполнителя", "SUSPENDED");

  const rungIndex = Math.min(input.priorSanctionsCount, EXECUTOR_LADDER.length - 1);
  const sanctionType = EXECUTOR_LADDER[rungIndex];
  const outcome: AdiletDecisionOutcome = sanctionType === "ADVISORY" || sanctionType === "FORMAL_WARNING" ? "WARNING" : "SANCTION_APPLIED";

  return {
    outcome,
    sanctionType,
    proportionalityReason: `ступень ${rungIndex + 1}/${EXECUTOR_LADDER.length} пропорциональной шкалы исполнителя при ${input.priorSanctionsCount} предыдущих санкциях (spec s.5)`,
    durationDays: EXECUTOR_SANCTION_DURATION_DAYS[sanctionType] ?? null,
    appealAllowed: true,
  };
}

/** Pure: whether a sanction is severe enough to require documented
 * reasoning before it may be applied (spec s.16) — permanent block, any
 * suspension, or a reliability penalty. Without this, a serious sanction
 * is invalid. */
export function requiresDocumentedReasoning(sanctionType: AdiletSanctionType | null): boolean {
  if (!sanctionType) return false;
  return sanctionType === "BLOCKED" || sanctionType === "SUSPENDED" || sanctionType === "TEMPORARY_SUSPENSION" || sanctionType === "RELIABILITY_PENALTY" || sanctionType === "LIMITED_ACCESS";
}
