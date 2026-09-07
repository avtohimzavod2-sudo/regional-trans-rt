// ADILET's outward-facing views for other agents (AGENTS Adilet spec
// s.20-s.24/s.44/s.45). Pure mapping functions — every consumer gets only
// the shape it's entitled to, never a raw AdiletCase/Decision/Evidence row
// (spec s.44 data minimization). None of these grant write access: Sapar,
// Zholaman, and Akzhol all receive read-only outcomes and may never
// silently rewrite Adilet's decision (spec s.21/s.23/s.24).
import type { AdiletCaseType, AdiletDecisionOutcome, AdiletSanctionType } from "@prisma/client";
import type { ClientFacingCaseSummary, ExecutorCaseOutcome, ManagerCaseView } from "./types";

/** What Sapar (or any escalating agent) gets back once Adilet has decided
 * (spec s.21) — Sapar must no longer independently issue permanent
 * disciplinary sanctions; this is the one channel that tells it what
 * happened. */
export function executorOutcomeFor(params: { caseId: string; outcome: AdiletDecisionOutcome; sanctionType: AdiletSanctionType | null; reviewMode: "ADILET_REVIEW" | "DIRECTOR_REVIEW" }): ExecutorCaseOutcome {
  return {
    caseId: params.caseId,
    outcome: params.outcome,
    sanctionType: params.sanctionType,
    reliabilityImpactNote: params.sanctionType === "RELIABILITY_PENALTY" ? "reliability score impacted via recorded complaint outcome" : null,
    needsMoreEvidence: params.outcome === "INSUFFICIENT_EVIDENCE",
    escalatedToDirector: params.reviewMode === "DIRECTOR_REVIEW",
  };
}

/** Zholaman/Akzhol view (spec s.23/s.24) — outcome-level only, no
 * authority to override. */
export function managerCaseView(params: { caseId: string; caseType: AdiletCaseType; outcome: AdiletDecisionOutcome | null; sanctionType: AdiletSanctionType | null; status: string; repeatOffender: boolean }): ManagerCaseView {
  return {
    caseId: params.caseId,
    caseType: params.caseType,
    outcome: params.outcome,
    executorSanction: params.sanctionType,
    status: params.status,
    repeatOffender: params.repeatOffender,
  };
}

const NEUTRAL_STATUS_MESSAGE: Record<string, string> = {
  OPEN: "Ваше обращение зарегистрировано и рассматривается.",
  UNDER_REVIEW: "Ваше обращение находится на рассмотрении.",
  AWAITING_EVIDENCE: "Ваше обращение рассматривается, уточняются детали.",
  DECIDED: "По вашему обращению принято решение.",
  APPEAL_REQUESTED: "Ваш запрос на пересмотр принят и рассматривается.",
  UNDER_APPEAL_REVIEW: "Ваш запрос на пересмотр находится на рассмотрении.",
  CLOSED: "Ваше обращение закрыто.",
};

/** The only thing Mira may ever relay to a client (spec s.20/s.45) — calm,
 * neutral, no internal reasoning, no other party's personal details. */
export function clientFacingSummary(caseId: string, status: string): ClientFacingCaseSummary {
  return { caseId, status, neutralMessage: NEUTRAL_STATUS_MESSAGE[status] ?? "Ваше обращение обрабатывается." };
}
