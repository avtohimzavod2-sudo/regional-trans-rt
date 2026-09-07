// ADILET appeal/review flow (AGENTS Adilet spec s.17-s.19). The original
// decision is never edited or deleted — a review decision is created
// alongside it via AdiletDecision.supersedesDecisionId, so both
// ORIGINAL_DECISION and REVIEW_DECISION stay in the audit trail forever
// (spec s.19).
import type { ActorType, AdiletAppeal, AdiletDecisionOutcome, AdiletSanctionType } from "@prisma/client";
import { db } from "@/lib/db";
import type { AgentContext } from "@/lib/agents/types";
import { applySanction, reverseSanction } from "./enforcement";
import { emitAdiletEvent } from "./events";
import { requireDirectorReviewRole } from "./role";

export class AppealNotAllowedError extends Error {
  constructor(decisionId: string) {
    super(`Decision ${decisionId} does not allow an appeal.`);
    this.name = "AppealNotAllowedError";
  }
}

export async function requestAppeal(ctx: AgentContext, params: { caseId: string; decisionId: string; requestedByActorType: ActorType; requestedById?: string; requestReason: string }): Promise<AdiletAppeal> {
  const decision = await db.adiletDecision.findUniqueOrThrow({ where: { id: params.decisionId } });
  if (!decision.appealAllowed) throw new AppealNotAllowedError(params.decisionId);

  const appeal = await db.adiletAppeal.create({
    data: {
      caseId: params.caseId,
      decisionId: params.decisionId,
      requestedByActorType: params.requestedByActorType,
      requestedById: params.requestedById,
      requestReason: params.requestReason,
    },
  });

  await db.adiletCase.update({ where: { id: params.caseId }, data: { status: "APPEAL_REQUESTED", appealStatus: "APPEAL_REQUESTED" } });
  await emitAdiletEvent(ctx, "APPEAL_REQUESTED", params.caseId, { appealId: appeal.id, decisionId: params.decisionId });
  return appeal;
}

export type AppealResolution = "UPHELD" | "MODIFIED" | "OVERTURNED";

/** Director-level review (spec s.18): uphold / soften-or-strengthen
 * (MODIFIED, with a new sanctionType) / cancel (OVERTURNED). Manager-level
 * actors (Zholaman/Akzhol) are never a valid `reviewedByActorType` for this
 * — that authorization check belongs to the caller (spec s.23/s.24: they
 * see outcomes, they don't get to rewrite them). */
export async function resolveAppeal(
  ctx: AgentContext,
  reviewerRole: string,
  params: { appealId: string; resolution: AppealResolution; reviewedByActorId: string; reviewNotes: string; modifiedSanctionType?: AdiletSanctionType; modifiedDurationDays?: number | null },
): Promise<AdiletAppeal> {
  requireDirectorReviewRole(reviewerRole);
  const appeal = await db.adiletAppeal.findUniqueOrThrow({ where: { id: params.appealId }, include: { decision: true } });
  const original = appeal.decision;
  const existingSanction = await db.adiletSanction.findUnique({ where: { decisionId: original.id } });

  let reviewOutcome: AdiletDecisionOutcome = original.outcome;
  if (params.resolution === "OVERTURNED") reviewOutcome = "NO_VIOLATION";
  else if (params.resolution === "MODIFIED") reviewOutcome = params.modifiedSanctionType ? "SANCTION_APPLIED" : "RESOLVED_NO_SANCTION";

  const reviewDecision = await db.adiletDecision.create({
    data: {
      caseId: appeal.caseId,
      outcome: reviewOutcome,
      findings: params.reviewNotes,
      verifiedFacts: original.verifiedFacts,
      disputedFacts: original.disputedFacts,
      policyBasis: original.policyBasis,
      proportionalityReason: `пересмотр апелляции (${params.resolution}) директором RT: ${params.reviewNotes}`,
      appealAllowed: false,
      decidedByActorType: "DISPATCHER",
      decidedByActorId: params.reviewedByActorId,
      supersedesDecisionId: original.id,
    },
  });

  if (existingSanction && existingSanction.status === "ACTIVE" && (params.resolution === "OVERTURNED" || params.resolution === "MODIFIED")) {
    await reverseSanction(ctx, existingSanction.id, `пересмотрено апелляцией: ${params.resolution}`);
  }

  if (params.resolution === "MODIFIED" && params.modifiedSanctionType && existingSanction) {
    await applySanction(ctx, {
      caseId: appeal.caseId,
      decisionId: reviewDecision.id,
      subjectType: existingSanction.subjectType,
      subjectId: existingSanction.subjectId,
      sanctionType: params.modifiedSanctionType,
      reason: params.reviewNotes,
      durationDays: params.modifiedDurationDays ?? null,
    });
  }

  const updatedAppeal = await db.adiletAppeal.update({
    where: { id: params.appealId },
    data: {
      status: params.resolution,
      reviewedAt: new Date(),
      reviewedByActorId: params.reviewedByActorId,
      reviewNotes: params.reviewNotes,
      reviewDecisionId: reviewDecision.id,
    },
  });

  await db.adiletCase.update({ where: { id: appeal.caseId }, data: { status: "DECIDED", appealStatus: params.resolution } });
  await emitAdiletEvent(ctx, "APPEAL_RESOLVED", appeal.caseId, { appealId: params.appealId, resolution: params.resolution, reviewDecisionId: reviewDecision.id });

  return updatedAppeal;
}
