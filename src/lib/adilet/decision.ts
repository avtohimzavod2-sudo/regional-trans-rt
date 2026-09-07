// ADILET decision recording (AGENTS Adilet spec s.15/s.16/s.40). Bridges
// the pure policy.ts ladder decision to the DB: writes the AdiletDecision
// row (the explainable record a director can review), advances the case,
// and — only for an actual sanction — invokes enforcement.ts.
import type { ActorType, AdiletDecision, AdiletSanction } from "@prisma/client";
import { db } from "@/lib/db";
import type { AgentContext } from "@/lib/agents/types";
import { applySanction } from "./enforcement";
import { emitAdiletEvent, logAdiletAction } from "./events";
import { requiresDocumentedReasoning } from "./policy";
import type { LadderDecision } from "./types";

export class UndocumentedSeriousSanctionError extends Error {
  constructor(sanctionType: string) {
    super(`Sanction "${sanctionType}" requires documented findings, policy basis, and proportionality reasoning before it may be applied (spec s.16).`);
    this.name = "UndocumentedSeriousSanctionError";
  }
}

export async function recordDecision(
  ctx: AgentContext,
  params: {
    caseId: string;
    subjectType: "CLIENT" | "DRIVER" | "EXECUTOR";
    subjectId: string;
    ladder: LadderDecision;
    verifiedFacts: string[];
    disputedFacts: string[];
    findings: string;
    policyBasis: string;
    decidedByActorType: ActorType;
    decidedByActorId?: string;
  },
): Promise<{ decision: AdiletDecision; sanction: AdiletSanction | null }> {
  if (requiresDocumentedReasoning(params.ladder.sanctionType) && (!params.findings.trim() || !params.policyBasis.trim() || !params.ladder.proportionalityReason.trim())) {
    throw new UndocumentedSeriousSanctionError(params.ladder.sanctionType ?? "unknown");
  }

  const reviewAfter = params.ladder.durationDays != null ? new Date(Date.now() + params.ladder.durationDays * 24 * 60 * 60 * 1000) : null;

  const decision = await db.adiletDecision.create({
    data: {
      caseId: params.caseId,
      outcome: params.ladder.outcome,
      findings: params.findings,
      verifiedFacts: params.verifiedFacts,
      disputedFacts: params.disputedFacts,
      insufficientEvidence: params.ladder.outcome === "INSUFFICIENT_EVIDENCE",
      policyBasis: params.policyBasis,
      proportionalityReason: params.ladder.proportionalityReason,
      duration: params.ladder.durationDays != null ? `${params.ladder.durationDays}d` : null,
      appealAllowed: params.ladder.appealAllowed,
      reviewAfter,
      decidedByActorType: params.decidedByActorType,
      decidedByActorId: params.decidedByActorId,
    },
  });

  const isInsufficientEvidence = decision.outcome === "INSUFFICIENT_EVIDENCE";
  await db.adiletCase.update({
    where: { id: params.caseId },
    data: isInsufficientEvidence
      ? { status: "AWAITING_EVIDENCE" }
      : { status: "DECIDED", resolvedAt: new Date(), appealStatus: params.ladder.appealAllowed ? "APPEAL_AVAILABLE" : "NO_APPEAL" },
  });

  let sanction: AdiletSanction | null = null;
  if (params.ladder.sanctionType) {
    sanction = await applySanction(ctx, {
      caseId: params.caseId,
      decisionId: decision.id,
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      sanctionType: params.ladder.sanctionType,
      reason: params.findings,
      durationDays: params.ladder.durationDays,
    });
  }

  await logAdiletAction({ ctx, action: "adilet.decision_recorded", entityId: params.caseId, details: { decisionId: decision.id, outcome: decision.outcome } });
  return { decision, sanction };
}

/** Escalation path ADILET_REVIEW -> DIRECTOR_REVIEW (spec s.40): insufficient
 * policy coverage, cross-department conflict, a very serious sanction, a
 * disputed permanent block, or a system-wide issue. */
export async function escalateToDirector(ctx: AgentContext, caseId: string, reason: string) {
  const adiletCase = await db.adiletCase.update({ where: { id: caseId }, data: { reviewMode: "DIRECTOR_REVIEW", severity: "CRITICAL" } });
  await emitAdiletEvent(ctx, "CASE_ESCALATED_TO_DIRECTOR", caseId, { reason });
  return adiletCase;
}
