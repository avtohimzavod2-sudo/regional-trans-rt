// Shared, bounded follow-up machinery for the RT Prospecting Core (Task D
// spec F): every acquisition contractor's FOLLOW_UP_PENDING retry step
// funnels through this one module, so "stop after response/rejection/
// handoff", "no duplicate sends", and "no unbounded messaging loop" are
// enforced once here rather than reimplemented per contractor. Reuses
// sendAcquisitionOutreach (./outreach-log.ts) for the actual send and its own
// safety gate (do-not-contact, rate limit, outreach mode) — this module only
// adds the attempt-count bound and the ProspectFollowUpAttempt audit trail on
// top. Lives in acquisition/ (not prospecting/) because prospecting/ is a
// dependency-free contract layer that must never import sendAcquisitionOutreach
// directly (src/lib/prospecting/boundary.test.ts) — only outreach-log.ts's
// domain may call its own safety gate.
import { Prisma } from "@prisma/client";
import type { AcquisitionProspectType, AcquisitionSourceType, AgentName, Channel, OutreachStatus, ProspectFollowUpAttempt } from "@prisma/client";
import { db } from "@/lib/db";
import { sendAcquisitionOutreach } from "@/lib/acquisition/outreach-log";
import { logAgentAction } from "@/lib/agents/trace";
import type { AgentContext } from "@/lib/agents/types";

/** Bounded — never an unbounded messaging loop (spec F). */
export const MAX_FOLLOW_UP_ATTEMPTS = 3;

export type FollowUpSkipReason = "ALREADY_RESPONDED" | "TERMINAL_STAGE" | "LIMIT_REACHED";

export interface SendProspectFollowUpParams {
  contractorAgent: AgentName;
  prospectType: AcquisitionProspectType;
  prospectRef: string;
  channel: Channel;
  sourceType: AcquisitionSourceType;
  sourceRef?: string | null;
  to: string;
  text: string;
  contactFingerprint?: string | null;
  /** Stable across retries of the same logical follow-up attempt — the same
   * P2002-based dedup idiom as outreach-log.ts's writeOutreachEvent and
   * handoff.ts's createProspectHandoff. */
  idempotencyKey: string;
  /** Caller already knows whether the prospect has responded/rejected/
   * closed/handed off — those are stop conditions this module enforces but
   * never re-derives from a different source of truth than the contractor's
   * own lifecycleStage. */
  hasResponded: boolean;
  isTerminal: boolean;
}

export interface FollowUpOutcome {
  sent: boolean;
  skippedReason?: FollowUpSkipReason;
  outreachStatus?: OutreachStatus;
  attemptNumber: number;
  deduplicated: boolean;
  eventId?: string;
}

function toOutcome(attempt: ProspectFollowUpAttempt, deduplicated: boolean): FollowUpOutcome {
  return {
    sent: attempt.outreachStatus === "SENT" || attempt.outreachStatus === "SANDBOX" || attempt.outreachStatus === "DRY_RUN",
    outreachStatus: attempt.outreachStatus,
    attemptNumber: attempt.attemptNumber,
    deduplicated,
  };
}

/** The one entrypoint every contractor uses to send a bounded follow-up.
 * Retry of the exact same logical attempt (same idempotencyKey) is resolved
 * first and deterministically, before any stop-condition or count check —
 * a replayed call must never look like a fresh attempt against the bound. */
export async function sendProspectFollowUp(ctx: AgentContext, params: SendProspectFollowUpParams): Promise<FollowUpOutcome> {
  const existing = await db.prospectFollowUpAttempt.findUnique({ where: { idempotencyKey: params.idempotencyKey } });
  if (existing) {
    return toOutcome(existing, true);
  }

  const attemptsSoFar = await db.prospectFollowUpAttempt.count({ where: { prospectType: params.prospectType, prospectRef: params.prospectRef } });

  if (params.hasResponded) {
    return { sent: false, skippedReason: "ALREADY_RESPONDED", attemptNumber: attemptsSoFar, deduplicated: false };
  }
  if (params.isTerminal) {
    return { sent: false, skippedReason: "TERMINAL_STAGE", attemptNumber: attemptsSoFar, deduplicated: false };
  }
  if (attemptsSoFar >= MAX_FOLLOW_UP_ATTEMPTS) {
    return { sent: false, skippedReason: "LIMIT_REACHED", attemptNumber: attemptsSoFar, deduplicated: false };
  }

  const attemptNumber = attemptsSoFar + 1;

  const outreachOutcome = await sendAcquisitionOutreach({
    contractorAgent: params.contractorAgent,
    prospectType: params.prospectType,
    prospectRef: params.prospectRef,
    channel: params.channel,
    sourceType: params.sourceType,
    sourceRef: params.sourceRef,
    to: params.to,
    text: params.text,
    idempotencyKey: params.idempotencyKey,
    contactFingerprint: params.contactFingerprint,
  });

  let attempt: ProspectFollowUpAttempt;
  let deduplicated = false;
  try {
    attempt = await db.prospectFollowUpAttempt.create({
      data: {
        prospectType: params.prospectType,
        prospectRef: params.prospectRef,
        contractorAgent: params.contractorAgent,
        attemptNumber,
        outreachStatus: outreachOutcome.status,
        idempotencyKey: params.idempotencyKey,
      },
    });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) {
      throw err;
    }
    attempt = await db.prospectFollowUpAttempt.findUniqueOrThrow({ where: { idempotencyKey: params.idempotencyKey } });
    deduplicated = true;
  }

  await logAgentAction({
    ctx,
    agent: params.contractorAgent,
    action: "prospecting.follow_up_sent",
    entityType: params.prospectType,
    entityId: params.prospectRef,
    details: { attemptNumber: attempt.attemptNumber, outreachStatus: outreachOutcome.status, deduplicated },
  });

  return { ...toOutcome(attempt, deduplicated), eventId: outreachOutcome.eventId };
}

/** Read-only follow-up history for one prospect (dispatcher UI / audit). */
export async function followUpHistoryForProspect(prospectType: AcquisitionProspectType, prospectRef: string): Promise<ProspectFollowUpAttempt[]> {
  return db.prospectFollowUpAttempt.findMany({
    where: { prospectType, prospectRef },
    orderBy: { attemptNumber: "asc" },
  });
}
