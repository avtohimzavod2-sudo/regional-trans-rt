// ADILET case lifecycle (AGENTS Adilet spec s.11/s.34/s.36). Only the
// DB-touching plumbing lives here — classification/fairness/ladder logic
// stays in policy.ts so it can be unit-tested without a database.
import type { AdiletCase } from "@prisma/client";
import { db } from "@/lib/db";
import type { AgentContext } from "@/lib/agents/types";
import { classifySeverity, isSeriousCase } from "./policy";
import { emitAdiletEvent, logAdiletAction } from "./events";
import type { EvidenceItem, OpenCaseInput, SeriousCaseSignal } from "./types";

/** Opens a case, or returns the existing one untouched if `sourceEventKey`
 * was already used (spec s.34: a retried escalation event can never open a
 * second case). The upsert's `update: {}` no-op makes this atomic under
 * concurrent callers (spec s.35) rather than a check-then-create race. */
export async function openCase(ctx: AgentContext, input: OpenCaseInput, serious?: SeriousCaseSignal): Promise<AdiletCase> {
  const severity = input.severity ?? classifySeverity(input.caseType, serious ?? emptySeriousSignal());
  const reviewMode = serious && isSeriousCase(serious) ? "DIRECTOR_REVIEW" : "ADILET_REVIEW";

  const data = {
    caseType: input.caseType,
    severity,
    reviewMode,
    sourceAgent: input.sourceAgent,
    openedByType: input.openedByType,
    openedById: input.openedById,
    relatedUserId: input.relatedUserId,
    relatedExecutorId: input.relatedExecutorId,
    shipmentId: input.shipmentId,
    tripId: input.tripId,
    paymentId: input.paymentId,
    managerContext: input.managerContext,
    summary: input.summary,
    allegation: input.allegation,
    sourceEventKey: input.sourceEventKey,
  } as const;

  const adiletCase = input.sourceEventKey
    ? await db.adiletCase.upsert({ where: { sourceEventKey: input.sourceEventKey }, create: data, update: {} })
    : await db.adiletCase.create({ data });

  await emitAdiletEvent(ctx, "CASE_OPENED", adiletCase.id, { caseType: input.caseType, severity, sourceAgent: input.sourceAgent ?? null });
  return adiletCase;
}

function emptySeriousSignal(): SeriousCaseSignal {
  return {
    safetyThreat: false,
    violenceThreat: false,
    confirmedFraud: false,
    dangerousDriving: false,
    bypassOfFinancialOrSafetyControls: false,
    repeatedFakePaymentEvidence: false,
    provenBadFaithDamageOrLoss: false,
    systematicAbuse: false,
  };
}

export async function attachEvidence(ctx: AgentContext, caseId: string, item: EvidenceItem) {
  const evidence = await db.adiletEvidence.create({
    data: {
      caseId,
      type: item.type,
      factStatus: item.factStatus,
      trust: item.trust,
      source: item.source,
      occurredAt: item.occurredAt,
      description: item.description,
    },
  });
  await emitAdiletEvent(ctx, "EVIDENCE_ATTACHED", caseId, { evidenceId: evidence.id, type: item.type, factStatus: item.factStatus });
  return evidence;
}

export async function listCaseEvidence(caseId: string): Promise<EvidenceItem[]> {
  const rows = await db.adiletEvidence.findMany({ where: { caseId }, orderBy: { occurredAt: "asc" } });
  return rows.map((r) => ({ type: r.type, factStatus: r.factStatus, trust: r.trust, source: r.source, occurredAt: r.occurredAt, description: r.description }));
}

export async function moveCaseToUnderReview(ctx: AgentContext, caseId: string) {
  const adiletCase = await db.adiletCase.update({ where: { id: caseId }, data: { status: "UNDER_REVIEW" } });
  await logAdiletAction({ ctx, action: "adilet.case_status_changed", entityId: caseId, details: { status: "UNDER_REVIEW" } });
  return adiletCase;
}

export async function closeCase(ctx: AgentContext, caseId: string) {
  const adiletCase = await db.adiletCase.update({ where: { id: caseId }, data: { status: "CLOSED", resolvedAt: new Date() } });
  await emitAdiletEvent(ctx, "CASE_CLOSED", caseId, {});
  return adiletCase;
}

/** Count of this subject's prior sanctions — the ladder's rung index (spec
 * s.5). Reads only the indexed [subjectType, subjectId, status] slice, no
 * full-table scan (spec s.37). */
export async function priorSanctionsCountFor(subjectType: "CLIENT" | "DRIVER" | "EXECUTOR", subjectId: string): Promise<number> {
  return db.adiletSanction.count({ where: { subjectType, subjectId } });
}
