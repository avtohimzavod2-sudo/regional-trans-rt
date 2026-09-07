"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { AdiletCaseType, AdiletEvidenceTrust, AdiletEvidenceType, AdiletFactStatus, AdiletSanctionType, AdiletSubjectType } from "@prisma/client";
import { logAction } from "@/lib/audit";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { rootContext } from "@/lib/agents/trace";
import { attachEvidence, closeCase, listCaseEvidence, openCase, priorSanctionsCountFor } from "@/lib/adilet/case";
import { recordDecision } from "@/lib/adilet/decision";
import { requestAppeal, resolveAppeal, type AppealResolution } from "@/lib/adilet/appeal";
import { decideClientSanction, decideExecutorSanction, evaluateFairness } from "@/lib/adilet/policy";
import type { ConductSignal, SeriousCaseSignal } from "@/lib/adilet/types";

async function currentDispatcher() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);
  if (!session) throw new Error("Not authenticated");
  return session;
}

function readSeriousSignal(formData: FormData): SeriousCaseSignal {
  const on = (key: string) => formData.get(key) === "on";
  return {
    safetyThreat: on("safetyThreat"),
    violenceThreat: on("violenceThreat"),
    confirmedFraud: on("confirmedFraud"),
    dangerousDriving: on("dangerousDriving"),
    bypassOfFinancialOrSafetyControls: on("bypassOfFinancialOrSafetyControls"),
    repeatedFakePaymentEvidence: on("repeatedFakePaymentEvidence"),
    provenBadFaithDamageOrLoss: on("provenBadFaithDamageOrLoss"),
    systematicAbuse: on("systematicAbuse"),
  };
}

// Manual case open (spec s.2) — a dispatcher relaying an escalation from
// Mira/Sapar/Sapargul/Zholaman/Akzhol that hasn't come through an
// agent-to-agent call yet.
export async function openCaseAction(formData: FormData) {
  const dispatcher = await currentDispatcher();
  const caseType = String(formData.get("caseType") ?? "") as AdiletCaseType;
  const summary = String(formData.get("summary") ?? "").trim();
  const allegation = String(formData.get("allegation") ?? "").trim();
  if (!caseType || !summary || !allegation) throw new Error("caseType, summary, and allegation are required");

  const relatedUserId = String(formData.get("relatedUserId") ?? "").trim() || undefined;
  const relatedExecutorId = String(formData.get("relatedExecutorId") ?? "").trim() || undefined;
  const shipmentId = String(formData.get("shipmentId") ?? "").trim() || undefined;
  const serious = readSeriousSignal(formData);

  const adiletCase = await openCase(
    rootContext(),
    { caseType, openedByType: "DISPATCHER", openedById: dispatcher.username, relatedUserId, relatedExecutorId, shipmentId, summary, allegation },
    serious,
  );

  await logAction({ actorType: "DISPATCHER", actorId: dispatcher.username, action: "dispatcher.adilet_case_opened", entityType: "AdiletCase", entityId: adiletCase.id, details: { caseType } });
  revalidatePath("/dispatcher/adilet");
}

export async function attachEvidenceAction(caseId: string, formData: FormData) {
  const dispatcher = await currentDispatcher();
  const type = String(formData.get("type") ?? "") as AdiletEvidenceType;
  const factStatus = String(formData.get("factStatus") ?? "") as AdiletFactStatus;
  const trust = String(formData.get("trust") ?? "MEDIUM") as AdiletEvidenceTrust;
  const source = String(formData.get("source") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  if (!type || !factStatus || !source || !description) throw new Error("type, factStatus, source, and description are required");

  await attachEvidence(rootContext(), caseId, { type, factStatus, trust, source, description, occurredAt: occurredAtRaw ? new Date(occurredAtRaw) : new Date() });

  await logAction({ actorType: "DISPATCHER", actorId: dispatcher.username, action: "dispatcher.adilet_evidence_attached", entityType: "AdiletCase", entityId: caseId, details: { type, factStatus } });
  revalidatePath(`/dispatcher/adilet/${caseId}`);
}

// Runs the deterministic policy engine over the case's own evidence and
// records the resulting decision — the dispatcher supplies only the
// conduct/seriousness signals a human/agent observed, never the outcome
// itself (spec s.28/s.29: no opaque judgment call from the UI).
export async function recordDecisionAction(caseId: string, formData: FormData) {
  const dispatcher = await currentDispatcher();
  const subjectType = String(formData.get("subjectType") ?? "") as AdiletSubjectType;
  const subjectId = String(formData.get("subjectId") ?? "").trim();
  const findings = String(formData.get("findings") ?? "").trim();
  const policyBasis = String(formData.get("policyBasis") ?? "").trim();
  if (!subjectType || !subjectId || !findings || !policyBasis) throw new Error("subjectType, subjectId, findings, and policyBasis are required");

  const evidence = await listCaseEvidence(caseId);
  const fairness = evaluateFairness(evidence);
  const serious = readSeriousSignal(formData);
  const priorSanctionsCount = await priorSanctionsCountFor(subjectType, subjectId);

  const ladder =
    subjectType === "CLIENT"
      ? decideClientSanction({
          fairness,
          serious,
          priorSanctionsCount,
          conduct: readConductSignal(formData),
        })
      : decideExecutorSanction({ fairness, serious, priorSanctionsCount });

  const { decision } = await recordDecision(rootContext(), {
    caseId,
    subjectType,
    subjectId,
    ladder,
    verifiedFacts: fairness.verifiedFacts,
    disputedFacts: fairness.disputedFacts,
    findings,
    policyBasis,
    decidedByActorType: "DISPATCHER",
    decidedByActorId: dispatcher.username,
  });

  await logAction({ actorType: "DISPATCHER", actorId: dispatcher.username, action: "dispatcher.adilet_decision_recorded", entityType: "AdiletCase", entityId: caseId, details: { decisionId: decision.id, outcome: decision.outcome } });
  revalidatePath(`/dispatcher/adilet/${caseId}`);
  revalidatePath("/dispatcher/adilet");
}

function readConductSignal(formData: FormData): ConductSignal {
  return {
    priorWarningsCount: Number(formData.get("priorWarningsCount") ?? 0) || 0,
    rudenessSeverity: (String(formData.get("rudenessSeverity") ?? "ORDINARY_FRUSTRATION") as ConductSignal["rudenessSeverity"]),
    continuedAfterWarning: formData.get("continuedAfterWarning") === "on",
  };
}

export async function requestAppealAction(caseId: string, decisionId: string, formData: FormData) {
  const dispatcher = await currentDispatcher();
  const requestReason = String(formData.get("requestReason") ?? "").trim();
  if (!requestReason) throw new Error("a reason is required to request an appeal");

  await requestAppeal(rootContext(), { caseId, decisionId, requestedByActorType: "DISPATCHER", requestedById: dispatcher.username, requestReason });

  await logAction({ actorType: "DISPATCHER", actorId: dispatcher.username, action: "dispatcher.adilet_appeal_requested", entityType: "AdiletCase", entityId: caseId, details: { decisionId } });
  revalidatePath(`/dispatcher/adilet/${caseId}`);
}

// Director-review-only (spec s.18) — resolveAppeal re-checks the role
// itself server-side; the UI is not the security boundary (spec s.54).
export async function resolveAppealAction(caseId: string, appealId: string, formData: FormData) {
  const dispatcher = await currentDispatcher();
  const resolution = String(formData.get("resolution") ?? "") as AppealResolution;
  const reviewNotes = String(formData.get("reviewNotes") ?? "").trim();
  const modifiedSanctionTypeRaw = String(formData.get("modifiedSanctionType") ?? "").trim();
  if (!resolution || !reviewNotes) throw new Error("resolution and reviewNotes are required");

  await resolveAppeal(rootContext(), dispatcher.role, {
    appealId,
    resolution,
    reviewedByActorId: dispatcher.username,
    reviewNotes,
    modifiedSanctionType: modifiedSanctionTypeRaw ? (modifiedSanctionTypeRaw as AdiletSanctionType) : undefined,
  });

  await logAction({ actorType: "DISPATCHER", actorId: dispatcher.username, action: "dispatcher.adilet_appeal_resolved", entityType: "AdiletCase", entityId: caseId, details: { appealId, resolution } });
  revalidatePath(`/dispatcher/adilet/${caseId}`);
}

export async function closeCaseAction(caseId: string) {
  const dispatcher = await currentDispatcher();
  await closeCase(rootContext(), caseId);
  await logAction({ actorType: "DISPATCHER", actorId: dispatcher.username, action: "dispatcher.adilet_case_closed", entityType: "AdiletCase", entityId: caseId });
  revalidatePath(`/dispatcher/adilet/${caseId}`);
  revalidatePath("/dispatcher/adilet");
}
