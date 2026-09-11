// Prospecting Core's own additive persistence for the shared handoff
// lifecycle (docs/architecture/prospecting.md, master spec s.14/s.15). This
// is the ONLY place any of the five acquisition contragents may create or
// transition a ProspectHandoff row — never a second source of truth for the
// prospect itself (PassengerProspect/ScoutCandidate/BusinessProspect/
// DeliveryExecutorProspect/CargoCarrierProspect stay each contragent's own
// exclusive write surface; prospectRef here is only a loose correlation id
// into whichever of those actually owns the record).
//
// Creating a READY row never implies acceptance. Ownership of the
// operational relationship transfers to targetAgentOrDepartment ONLY once
// status becomes ACCEPTED — see acceptProspectHandoff below. Every mutation
// here is a CAS (compare-and-swap) via `updateMany` + a status-membership
// `where` clause so concurrent callers (duplicate webhook delivery,
// simultaneous accept/reject, a retried serverless invocation) can never
// race past each other: whichever transaction the database serializes first
// wins, and every other caller either gets back the same terminal state
// (idempotent no-op) or a clear conflict error — never a silently
// overwritten decision.
import { Prisma } from "@prisma/client";
import type { AcquisitionProspectType, AgentName, HandoffStatus, ProspectHandoff as ProspectHandoffRow } from "@prisma/client";
import { db } from "@/lib/db";
import { isDoNotContact, isDoNotContactFingerprint } from "@/lib/acquisition/outreach-log";
import { logAgentAction } from "@/lib/agents/trace";
import type { AgentContext } from "@/lib/agents/types";
import { HANDOFF_TARGETS } from "./types";
import type { ProspectType } from "./types";
import type { Known } from "@/lib/cargo-profile/types";

const PROSPECT_TYPE_TO_ACQUISITION: Record<ProspectType, AcquisitionProspectType> = {
  PASSENGER_DEMAND: "PASSENGER",
  DRIVER_SUPPLY: "DRIVER",
  DELIVERY_EXECUTOR_SUPPLY: "DELIVERY_EXECUTOR",
  CARGO_CARRIER_SUPPLY: "CARGO_CARRIER",
  BUSINESS_CUSTOMER: "BUSINESS",
};

const ACQUISITION_TO_PROSPECT_TYPE: Record<AcquisitionProspectType, ProspectType> = {
  PASSENGER: "PASSENGER_DEMAND",
  DRIVER: "DRIVER_SUPPLY",
  DELIVERY_EXECUTOR: "DELIVERY_EXECUTOR_SUPPLY",
  CARGO_CARRIER: "CARGO_CARRIER_SUPPLY",
  BUSINESS: "BUSINESS_CUSTOMER",
};

/** `ProspectType` (this module's 5-way vocabulary) and `AcquisitionProspectType`
 * (the Prisma enum outreach-log.ts already keys on) are not string-identical
 * today — this is the single explicit mapping point rather than a rename,
 * per spec s.15's "additive only, no renames" rule. */
export function toAcquisitionProspectType(prospectType: ProspectType): AcquisitionProspectType {
  return PROSPECT_TYPE_TO_ACQUISITION[prospectType];
}

export function fromAcquisitionProspectType(prospectType: AcquisitionProspectType): ProspectType {
  return ACQUISITION_TO_PROSPECT_TYPE[prospectType];
}

export class InvalidHandoffTargetError extends Error {
  constructor(prospectType: ProspectType, target: string) {
    super(`"${target}" is not an approved handoff target for ${prospectType}. Approved targets: ${HANDOFF_TARGETS[prospectType].join(", ")}`);
    this.name = "InvalidHandoffTargetError";
  }
}

export class HandoffOptedOutError extends Error {
  constructor(identity: string) {
    super(`Refusing to create a handoff for an opted-out identity (${identity})`);
    this.name = "HandoffOptedOutError";
  }
}

export class HandoffNotFoundError extends Error {
  constructor(handoffId: string) {
    super(`ProspectHandoff ${handoffId} not found`);
    this.name = "HandoffNotFoundError";
  }
}

/** A genuine invariant violation — e.g. accept racing reject, or trying to
 * reopen a terminal handoff — as opposed to a harmless retry of the exact
 * same transition, which resolves as a deduplicated no-op instead of this. */
export class HandoffTransitionError extends Error {
  constructor(handoffId: string, currentStatus: HandoffStatus, attemptedStatus: HandoffStatus) {
    super(`ProspectHandoff ${handoffId} is ${currentStatus}; cannot transition to ${attemptedStatus}`);
    this.name = "HandoffTransitionError";
  }
}

export class HandoffWrongTargetError extends Error {
  constructor(handoffId: string, expected: string, actual: string) {
    super(`ProspectHandoff ${handoffId} targets "${actual}", not "${expected}" — refusing to accept/reject on behalf of the wrong department`);
    this.name = "HandoffWrongTargetError";
  }
}

export interface CreateProspectHandoffParams {
  prospectType: ProspectType;
  prospectRef: string;
  sourceAgent: AgentName;
  targetAgentOrDepartment: string;
  expressedInterest?: Known<string>;
  summary?: Known<string>;
  contactData?: Known<string>;
  requestedService?: Known<string>;
  availableCapabilities?: string[];
  conversationReference?: Known<string>;
  sourceReferences?: string[];
  /** src/lib/prospecting/identity.ts's computeContactFingerprint output.
   * Optional — absent whenever the sighting had no resolvable phone/handle. */
  contactFingerprint?: string | null;
  /** Stable across retries of the same logical handoff attempt — the same
   * P2002-based dedup idiom as outreach-log.ts's writeOutreachEvent. */
  idempotencyKey: string;
}

export interface CreateProspectHandoffResult {
  handoff: ProspectHandoffRow;
  deduplicated: boolean;
}

/** The one entrypoint every contragent uses to hand off an interested
 * prospect. Validates the target against the approved HANDOFF_TARGETS list
 * (never guesses), refuses an opted-out identity (checked both by
 * prospectType+prospectRef and, when known, by cross-type contactFingerprint),
 * and is idempotent under retry/replay. */
export async function createProspectHandoff(ctx: AgentContext, params: CreateProspectHandoffParams): Promise<CreateProspectHandoffResult> {
  if (!HANDOFF_TARGETS[params.prospectType].includes(params.targetAgentOrDepartment)) {
    throw new InvalidHandoffTargetError(params.prospectType, params.targetAgentOrDepartment);
  }

  const acquisitionProspectType = toAcquisitionProspectType(params.prospectType);

  if (await isDoNotContact(acquisitionProspectType, params.prospectRef)) {
    throw new HandoffOptedOutError(params.prospectRef);
  }
  if (params.contactFingerprint && (await isDoNotContactFingerprint(params.contactFingerprint))) {
    throw new HandoffOptedOutError(params.contactFingerprint);
  }

  try {
    const handoff = await db.prospectHandoff.create({
      data: {
        prospectType: acquisitionProspectType,
        prospectRef: params.prospectRef,
        sourceAgent: params.sourceAgent,
        targetAgentOrDepartment: params.targetAgentOrDepartment,
        expressedInterest: params.expressedInterest ?? "UNKNOWN",
        summary: params.summary ?? "UNKNOWN",
        contactData: params.contactData ?? "UNKNOWN",
        requestedService: params.requestedService ?? "UNKNOWN",
        availableCapabilities: params.availableCapabilities ?? [],
        conversationReference: params.conversationReference ?? "UNKNOWN",
        sourceReferences: params.sourceReferences ?? [],
        contactFingerprint: params.contactFingerprint ?? null,
        idempotencyKey: params.idempotencyKey,
      },
    });
    await logAgentAction({
      ctx,
      agent: params.sourceAgent,
      action: "prospecting.handoff_created",
      entityType: "ProspectHandoff",
      entityId: handoff.id,
      details: { prospectType: acquisitionProspectType, prospectRef: params.prospectRef, targetAgentOrDepartment: params.targetAgentOrDepartment },
    });
    return { handoff, deduplicated: false };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await db.prospectHandoff.findUniqueOrThrow({ where: { idempotencyKey: params.idempotencyKey } });
      return { handoff: existing, deduplicated: true };
    }
    throw err;
  }
}

/** Legal handoff transitions (master spec s.14): READY and NEEDS_MORE_INFO
 * are the only non-terminal states; ACCEPTED/REJECTED/DUPLICATE never reopen. */
const LEGAL_FROM_STATUSES: Record<Exclude<HandoffStatus, "READY">, HandoffStatus[]> = {
  ACCEPTED: ["READY", "NEEDS_MORE_INFO"],
  REJECTED: ["READY", "NEEDS_MORE_INFO"],
  DUPLICATE: ["READY", "NEEDS_MORE_INFO"],
  NEEDS_MORE_INFO: ["READY"],
};

async function transitionHandoff(
  handoffId: string,
  toStatus: HandoffStatus,
  extraData: Prisma.ProspectHandoffUpdateManyMutationInput,
  extraWhere?: Prisma.ProspectHandoffWhereInput,
): Promise<{ handoff: ProspectHandoffRow; deduplicated: boolean }> {
  const fromStatuses: HandoffStatus[] = toStatus === "READY" ? ["NEEDS_MORE_INFO"] : LEGAL_FROM_STATUSES[toStatus as Exclude<HandoffStatus, "READY">];
  const result = await db.prospectHandoff.updateMany({
    where: { id: handoffId, status: { in: fromStatuses }, ...extraWhere },
    data: { status: toStatus, ...extraData },
  });

  if (result.count === 1) {
    const handoff = await db.prospectHandoff.findUniqueOrThrow({ where: { id: handoffId } });
    return { handoff, deduplicated: false };
  }

  const current = await db.prospectHandoff.findUnique({ where: { id: handoffId } });
  if (!current) throw new HandoffNotFoundError(handoffId);
  if (extraWhere?.targetAgentOrDepartment && current.targetAgentOrDepartment !== extraWhere.targetAgentOrDepartment) {
    throw new HandoffWrongTargetError(handoffId, String(extraWhere.targetAgentOrDepartment), current.targetAgentOrDepartment);
  }
  if (current.status === toStatus) {
    // Genuine retry/replay of the same logical transition — deterministic no-op.
    return { handoff: current, deduplicated: true };
  }
  throw new HandoffTransitionError(handoffId, current.status, toStatus);
}

export interface HandoffDecisionParams {
  handoffId: string;
  targetAgentOrDepartment: string;
  decidedBy?: string;
  decisionNote?: string;
  /** AgentName to attribute this decision to in the audit trail. Defaults to
   * the handoff's own sourceAgent when the accepting/rejecting side has no
   * AgentName of its own (spec s.6: "a namespace/department string is
   * sufficient" for a target like CARGO_OPERATIONS). */
  actingAgent?: AgentName;
}

/** Ownership-transfer moment (spec s.14). Only the handoff's own
 * targetAgentOrDepartment may accept it — passing a mismatched target throws
 * rather than silently accepting on behalf of the wrong department. */
export async function acceptProspectHandoff(ctx: AgentContext, params: HandoffDecisionParams): Promise<CreateProspectHandoffResult> {
  const { handoff, deduplicated } = await transitionHandoff(
    params.handoffId,
    "ACCEPTED",
    { acceptedAt: new Date(), decidedBy: params.decidedBy, decisionNote: params.decisionNote },
    { targetAgentOrDepartment: params.targetAgentOrDepartment },
  );
  if (!deduplicated) {
    await logAgentAction({
      ctx,
      agent: params.actingAgent ?? handoff.sourceAgent,
      action: "prospecting.handoff_accepted",
      entityType: "ProspectHandoff",
      entityId: handoff.id,
      details: { prospectType: handoff.prospectType, prospectRef: handoff.prospectRef, decidedBy: params.decidedBy ?? null },
    });
  }
  return { handoff, deduplicated };
}

export async function rejectProspectHandoff(ctx: AgentContext, params: HandoffDecisionParams): Promise<CreateProspectHandoffResult> {
  const { handoff, deduplicated } = await transitionHandoff(
    params.handoffId,
    "REJECTED",
    { rejectedAt: new Date(), decidedBy: params.decidedBy, decisionNote: params.decisionNote },
    { targetAgentOrDepartment: params.targetAgentOrDepartment },
  );
  if (!deduplicated) {
    await logAgentAction({
      ctx,
      agent: params.actingAgent ?? handoff.sourceAgent,
      action: "prospecting.handoff_rejected",
      entityType: "ProspectHandoff",
      entityId: handoff.id,
      details: { prospectType: handoff.prospectType, prospectRef: handoff.prospectRef, decidedBy: params.decidedBy ?? null },
    });
  }
  return { handoff, deduplicated };
}

/** READY -> NEEDS_MORE_INFO: the receiving contour needs more before it can
 * decide. This is the only non-terminal detour in the lifecycle. */
export async function requestMoreInfoOnHandoff(ctx: AgentContext, params: HandoffDecisionParams): Promise<CreateProspectHandoffResult> {
  const outcome = await transitionHandoff(
    params.handoffId,
    "NEEDS_MORE_INFO",
    { decisionNote: params.decisionNote },
    { targetAgentOrDepartment: params.targetAgentOrDepartment },
  );
  if (!outcome.deduplicated) {
    await logAgentAction({
      ctx,
      agent: params.actingAgent ?? outcome.handoff.sourceAgent,
      action: "prospecting.handoff_needs_more_info",
      entityType: "ProspectHandoff",
      entityId: outcome.handoff.id,
      details: { decisionNote: params.decisionNote ?? null },
    });
  }
  return outcome;
}

/** NEEDS_MORE_INFO -> READY: the only legal way back out of that state
 * (spec s.14: "NEEDS_MORE_INFO may return to READY"). */
export async function returnHandoffToReady(ctx: AgentContext, handoffId: string, actingAgent?: AgentName): Promise<CreateProspectHandoffResult> {
  const outcome = await transitionHandoff(handoffId, "READY", {});
  if (!outcome.deduplicated) {
    await logAgentAction({
      ctx,
      agent: actingAgent ?? outcome.handoff.sourceAgent,
      action: "prospecting.handoff_returned_to_ready",
      entityType: "ProspectHandoff",
      entityId: outcome.handoff.id,
    });
  }
  return outcome;
}

export async function markHandoffDuplicate(ctx: AgentContext, handoffId: string, decisionNote?: string, actingAgent?: AgentName): Promise<CreateProspectHandoffResult> {
  const outcome = await transitionHandoff(handoffId, "DUPLICATE", { decisionNote });
  if (!outcome.deduplicated) {
    await logAgentAction({
      ctx,
      agent: actingAgent ?? outcome.handoff.sourceAgent,
      action: "prospecting.handoff_marked_duplicate",
      entityType: "ProspectHandoff",
      entityId: outcome.handoff.id,
      details: { decisionNote: decisionNote ?? null },
    });
  }
  return outcome;
}

/** Read-only lookup for a specific handoff (dispatcher UI / a contour
 * deciding what to do with a READY handoff it owns). */
export async function getProspectHandoff(handoffId: string): Promise<ProspectHandoffRow | null> {
  return db.prospectHandoff.findUnique({ where: { id: handoffId } });
}

/** Read-only history for one prospect across every handoff attempt ever made
 * for it (dispatcher UI / audit reconstruction). */
export async function handoffsForProspect(prospectType: ProspectType, prospectRef: string): Promise<ProspectHandoffRow[]> {
  return db.prospectHandoff.findMany({
    where: { prospectType: toAcquisitionProspectType(prospectType), prospectRef },
    orderBy: { createdAt: "desc" },
  });
}

/** Read-only cross-prospect feed for the dispatcher screen (spec s.12). */
export async function recentProspectHandoffs(limit = 100): Promise<ProspectHandoffRow[]> {
  return db.prospectHandoff.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
