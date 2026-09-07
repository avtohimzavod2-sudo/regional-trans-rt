// Weekly strategic initiatives: exactly-3 enforcement + the Founder Approval
// Workflow state machine (AGENTS Master Architecture spec s.15/s.16/s.23/
// s.35). Artur never auto-implements an initiative — every state past
// PROPOSED requires an explicit Founder-authorized call through this file.
import { db } from "@/lib/db";
import type { DirectorInitiative, FounderInitiativeStatus } from "@prisma/client";
import type { AgentContext } from "@/lib/agents/types";
import { requireFounderRole } from "./role";
import { weeklyInitiativesSchema, type WeeklyInitiative, type FounderDecision } from "./types";
import { emitArturEvent } from "./events";

/** Throws rather than padding/truncating — spec s.35 treats a wrong count
 * as a defect to surface, never something to silently "fix" by fabricating
 * a plausible-looking 4th initiative or dropping a real one. */
export function assertExactlyThreeInitiatives(initiatives: WeeklyInitiative[]): WeeklyInitiative[] {
  return weeklyInitiativesSchema.parse(initiatives);
}

const TRANSITIONS: Record<FounderInitiativeStatus, FounderInitiativeStatus[]> = {
  PROPOSED: ["APPROVED", "REJECTED", "DEFERRED", "NEEDS_REVISION"],
  NEEDS_REVISION: ["APPROVED", "REJECTED", "DEFERRED", "NEEDS_REVISION"],
  DEFERRED: ["APPROVED", "REJECTED"],
  APPROVED: ["IN_PROGRESS"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: ["MEASURED"],
  REJECTED: [],
  MEASURED: [],
};

/** Pure state-machine check (spec s.23: "never let an LLM directly assign
 * arbitrary state strings") — exported so the transition table itself is
 * unit-testable without a database. */
export function isValidInitiativeTransition(from: FounderInitiativeStatus, to: FounderInitiativeStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class InvalidInitiativeTransitionError extends Error {
  constructor(from: FounderInitiativeStatus, to: FounderInitiativeStatus) {
    super(`Cannot transition DirectorInitiative from ${from} to ${to}.`);
    this.name = "InvalidInitiativeTransitionError";
  }
}

/** The Founder's (or admin break-glass) decision on one initiative — the
 * only way PROPOSED/NEEDS_REVISION ever moves forward. Never silently
 * interprets a lack of response as approval (spec s.16): if this function
 * is never called, the initiative just stays PROPOSED. */
export async function recordFounderInitiativeDecision(
  ctx: AgentContext,
  dispatcherRole: string,
  requesterId: string,
  initiativeId: string,
  decision: FounderDecision,
): Promise<DirectorInitiative> {
  requireFounderRole(dispatcherRole);

  const initiative = await db.directorInitiative.findUniqueOrThrow({ where: { id: initiativeId } });
  if (!isValidInitiativeTransition(initiative.status, decision.status)) throw new InvalidInitiativeTransitionError(initiative.status, decision.status);

  const updated = await db.directorInitiative.update({
    where: { id: initiativeId },
    data: {
      status: decision.status,
      decisionAt: new Date(),
      decisionByActorId: requesterId,
      decisionNote: decision.note,
    },
  });

  await emitArturEvent(ctx, "FOUNDER_INITIATIVE_DECISION", initiativeId, "DirectorInitiative", {
    requesterId,
    from: initiative.status,
    to: decision.status,
    note: decision.note,
  });

  return updated;
}

export async function recordInitiativeImplementationResult(
  ctx: AgentContext,
  dispatcherRole: string,
  requesterId: string,
  initiativeId: string,
  implementationResult: string,
): Promise<DirectorInitiative> {
  requireFounderRole(dispatcherRole);
  const initiative = await db.directorInitiative.findUniqueOrThrow({ where: { id: initiativeId } });

  let nextStatus: FounderInitiativeStatus;
  if (initiative.status === "APPROVED") nextStatus = "IN_PROGRESS";
  else if (initiative.status === "IN_PROGRESS") nextStatus = "COMPLETED";
  else throw new InvalidInitiativeTransitionError(initiative.status, "IN_PROGRESS");

  const updated = await db.directorInitiative.update({
    where: { id: initiativeId },
    data: { status: nextStatus, implementationResult },
  });

  await emitArturEvent(ctx, "FOUNDER_INITIATIVE_DECISION", initiativeId, "DirectorInitiative", {
    requesterId,
    from: initiative.status,
    to: nextStatus,
    implementationResult,
  });

  return updated;
}

export async function recordInitiativeMeasuredEffect(
  ctx: AgentContext,
  dispatcherRole: string,
  requesterId: string,
  initiativeId: string,
  measuredEffect: string,
): Promise<DirectorInitiative> {
  requireFounderRole(dispatcherRole);
  const initiative = await db.directorInitiative.findUniqueOrThrow({ where: { id: initiativeId } });
  if (initiative.status !== "COMPLETED") throw new InvalidInitiativeTransitionError(initiative.status, "MEASURED");

  const updated = await db.directorInitiative.update({
    where: { id: initiativeId },
    data: { status: "MEASURED", measuredEffect, measuredAt: new Date() },
  });

  await emitArturEvent(ctx, "FOUNDER_INITIATIVE_DECISION", initiativeId, "DirectorInitiative", {
    requesterId,
    from: "COMPLETED",
    to: "MEASURED",
    measuredEffect,
  });

  return updated;
}
