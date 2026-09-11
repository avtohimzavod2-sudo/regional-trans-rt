// RT OFFICE — Passenger<->Driver Loop (observability/orchestration layer).
//
// This is NOT a second matching engine. Every status transition here is
// driven by, and only by, a real event already happening in the existing
// engine (src/lib/matching/orchestrate.ts, src/lib/matching/expiry.ts) or by
// RT OFFICE's own read-only fact resolution (facts.ts). PassengerLoopRun/
// PassengerLoopOffer own no seat/driver/trip fact of their own — they only
// observe and expose, as a typed state machine, what the real engine already
// decided. Mirrors src/lib/prospecting/handoff.ts's CAS-transition-table
// idiom (LEGAL_FROM_STATUSES + updateMany + count-based dedup/conflict).
import { Prisma } from "@prisma/client";
import type {
  NoSupplyReason,
  PassengerLoopOffer as PassengerLoopOfferRow,
  PassengerLoopOfferStatus,
  PassengerLoopRun as PassengerLoopRunRow,
  PassengerLoopStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import { logAgentAction } from "@/lib/agents/trace";
import type { AgentContext } from "@/lib/agents/types";

export class LoopNotFoundError extends Error {
  constructor(id: string) {
    super(`PassengerLoopRun/Offer ${id} not found`);
    this.name = "LoopNotFoundError";
  }
}

/** A genuine invariant violation (spec: "не допускай невозможных переходов
 * статусов") — as opposed to a harmless retry of the exact same transition,
 * which resolves as a deduplicated no-op instead of this. */
export class LoopTransitionError extends Error {
  constructor(id: string, kind: "run" | "offer", currentStatus: string, attemptedStatus: string) {
    super(`PassengerLoop${kind === "run" ? "Run" : "Offer"} ${id} is ${currentStatus}; cannot transition to ${attemptedStatus}`);
    this.name = "LoopTransitionError";
  }
}

// Legal run transitions: PASSENGER_DECLINED/EXPIRED/NO_SUPPLY are allowed
// back into MATCHING because the real engine actually performs self-healing
// rematching after a decline/expiry/no-candidate outcome (see
// handlePassengerResponse's decline branch and expiry.ts) — freezing the loop
// status at a stale terminal-looking value while the real engine has already
// moved on would misrepresent what is actually happening, which is its own
// kind of "invented" status. PASSENGER_ACCEPTED and CANCELLED are the only
// true terminals: once a real Trip exists, or the demand is withdrawn, this
// run's job is over.
const LEGAL_RUN_TRANSITIONS: Record<Exclude<PassengerLoopStatus, "NEW">, PassengerLoopStatus[]> = {
  NORMALIZED: ["NEW"],
  SUPPLY_REQUESTED: ["NORMALIZED"],
  MATCHING: ["SUPPLY_REQUESTED", "NO_SUPPLY", "OFFER_READY", "PASSENGER_DECLINED", "EXPIRED"],
  OFFER_READY: ["MATCHING"],
  NO_SUPPLY: ["MATCHING", "SUPPLY_REQUESTED", "OFFER_READY"],
  OFFER_SENT: ["OFFER_READY"],
  PASSENGER_ACCEPTED: ["OFFER_SENT"],
  PASSENGER_DECLINED: ["OFFER_SENT"],
  EXPIRED: ["OFFER_READY", "OFFER_SENT"],
  CANCELLED: ["NEW", "NORMALIZED", "SUPPLY_REQUESTED", "MATCHING", "OFFER_READY", "NO_SUPPLY", "OFFER_SENT", "PASSENGER_DECLINED", "EXPIRED"],
};

const LEGAL_OFFER_TRANSITIONS: Record<Exclude<PassengerLoopOfferStatus, "CANDIDATE">, PassengerLoopOfferStatus[]> = {
  VALIDATED: ["CANDIDATE"],
  RESERVED_PENDING: ["VALIDATED"],
  ACCEPTED: ["RESERVED_PENDING"],
  REJECTED: ["CANDIDATE", "RESERVED_PENDING"],
  EXPIRED: ["CANDIDATE", "RESERVED_PENDING"],
  INVALIDATED: ["CANDIDATE", "VALIDATED", "RESERVED_PENDING"],
};

interface TransitionOutcome<T> {
  row: T;
  deduplicated: boolean;
}

async function transitionLoop(
  ctx: AgentContext,
  loopRunId: string,
  toStatus: PassengerLoopStatus,
  extraData: Prisma.PassengerLoopRunUpdateManyMutationInput = {},
): Promise<TransitionOutcome<PassengerLoopRunRow>> {
  const fromStatuses = LEGAL_RUN_TRANSITIONS[toStatus as Exclude<PassengerLoopStatus, "NEW">];
  const result = await db.passengerLoopRun.updateMany({
    where: { id: loopRunId, status: { in: fromStatuses } },
    data: { status: toStatus, ...extraData },
  });

  if (result.count === 1) {
    const row = await db.passengerLoopRun.findUniqueOrThrow({ where: { id: loopRunId } });
    await logAgentAction({
      ctx,
      agent: "RT_OFFICE",
      action: "rt_office.passenger_loop_transition",
      entityType: "PassengerLoopRun",
      entityId: loopRunId,
      details: { toStatus, correlationId: row.correlationId, causationId: ctx.traceId },
    });
    return { row, deduplicated: false };
  }

  const current = await db.passengerLoopRun.findUnique({ where: { id: loopRunId } });
  if (!current) throw new LoopNotFoundError(loopRunId);
  if (current.status === toStatus) return { row: current, deduplicated: true };
  throw new LoopTransitionError(loopRunId, "run", current.status, toStatus);
}

async function transitionLoopOffer(
  ctx: AgentContext,
  loopOfferId: string,
  toStatus: PassengerLoopOfferStatus,
): Promise<TransitionOutcome<PassengerLoopOfferRow>> {
  const fromStatuses = LEGAL_OFFER_TRANSITIONS[toStatus as Exclude<PassengerLoopOfferStatus, "CANDIDATE">];
  const result = await db.passengerLoopOffer.updateMany({
    where: { id: loopOfferId, status: { in: fromStatuses } },
    data: { status: toStatus },
  });

  if (result.count === 1) {
    const row = await db.passengerLoopOffer.findUniqueOrThrow({ where: { id: loopOfferId } });
    await logAgentAction({
      ctx,
      agent: "RT_OFFICE",
      action: "rt_office.passenger_loop_offer_transition",
      entityType: "PassengerLoopOffer",
      entityId: loopOfferId,
      details: { toStatus, matchId: row.matchId, causationId: ctx.traceId },
    });
    return { row, deduplicated: false };
  }

  const current = await db.passengerLoopOffer.findUnique({ where: { id: loopOfferId } });
  if (!current) throw new LoopNotFoundError(loopOfferId);
  if (current.status === toStatus) return { row: current, deduplicated: true };
  throw new LoopTransitionError(loopOfferId, "offer", current.status, toStatus);
}

/** Idempotent create-or-fetch keyed on TripRequest (1:1) — a redelivered
 * inbound event that already produced this TripRequest (see ingest.ts's own
 * P2002 idempotency on rawMessageId) must never spawn a second loop run. */
async function getOrCreateLoopRun(ctx: AgentContext, tripRequestId: string): Promise<TransitionOutcome<PassengerLoopRunRow>> {
  try {
    const row = await db.passengerLoopRun.create({
      data: { tripRequestId, correlationId: ctx.traceId },
    });
    return { row, deduplicated: false };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const row = await db.passengerLoopRun.findUniqueOrThrow({ where: { tripRequestId } });
      return { row, deduplicated: true };
    }
    throw err;
  }
}

/** Entry point: called once a passenger's TripRequest has been created (real
 * extraction already succeeded — this is exactly the "NORMALIZED" moment).
 * On a genuine duplicate (retry/replay), returns the existing run untouched
 * — never re-runs the NEW->NORMALIZED->SUPPLY_REQUESTED transitions a second
 * time (item G/P: repeat of the same demand must not create a duplicate or
 * a spurious transition history). */
export async function startPassengerDemandLoop(ctx: AgentContext, tripRequestId: string): Promise<PassengerLoopRunRow> {
  const { row, deduplicated } = await getOrCreateLoopRun(ctx, tripRequestId);
  if (deduplicated) return row;

  const normalized = await transitionLoop(ctx, row.id, "NORMALIZED");
  const requested = await transitionLoop(ctx, normalized.row.id, "SUPPLY_REQUESTED");
  return requested.row;
}

/** SUPPLY_REQUESTED/NO_SUPPLY/PASSENGER_DECLINED/EXPIRED -> MATCHING: about
 * to call (or re-call) the real matching engine. */
export async function advanceLoopToMatching(ctx: AgentContext, loopRunId: string): Promise<PassengerLoopRunRow> {
  const { row } = await transitionLoop(ctx, loopRunId, "MATCHING");
  return row;
}

/** Fail-closed outcome — chosen by the actual situation, never defaulted.
 * NO_SUPPLY (genuinely no candidate exists) / TEMPORARILY_UNAVAILABLE (a
 * dependency — Drive CRM, Jolchu — is down or timed out) /
 * NEEDS_CLARIFICATION (route/seat count ambiguous). `detail` is a free-text
 * diagnostic for the audit trail (e.g. "JOLCHU_TIMEOUT"), never a second enum. */
export async function recordNoSupply(
  ctx: AgentContext,
  loopRunId: string,
  reason: NoSupplyReason,
  detail?: string,
): Promise<PassengerLoopRunRow> {
  const { row } = await transitionLoop(ctx, loopRunId, "NO_SUPPLY", { noSupplyReason: reason, noSupplyDetail: detail ?? null });
  return row;
}

/** MATCHING -> OFFER_READY: a real Match now exists (AWAITING_DRIVER) — a
 * genuine candidate was found by the real engine, never invented. Creates
 * (idempotently, keyed on matchId) the PassengerLoopOffer row tracking it. */
export async function recordOfferReady(
  ctx: AgentContext,
  loopRunId: string,
  matchId: string,
  driverOfferId: string,
): Promise<{ run: PassengerLoopRunRow; offer: PassengerLoopOfferRow }> {
  const { row: run } = await transitionLoop(ctx, loopRunId, "OFFER_READY");
  let offer: PassengerLoopOfferRow;
  try {
    offer = await db.passengerLoopOffer.create({ data: { loopRunId, matchId, driverOfferId } });
    await logAgentAction({
      ctx,
      agent: "RT_OFFICE",
      action: "rt_office.passenger_loop_offer_candidate",
      entityType: "PassengerLoopOffer",
      entityId: offer.id,
      details: { loopRunId, matchId, driverOfferId },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      offer = await db.passengerLoopOffer.findUniqueOrThrow({ where: { matchId } });
    } else {
      throw err;
    }
  }
  return { run, offer };
}

/** OFFER_READY -> OFFER_SENT: the driver accepted and the passenger has now
 * actually been sent the real confirm/decline prompt. The offer moves
 * CANDIDATE -> VALIDATED (driver confirmed) -> RESERVED_PENDING (a seat is
 * now provisionally held, pending the passenger's decision) — both legal,
 * consecutive real-world facts as of this one event. */
export async function recordOfferSent(ctx: AgentContext, loopRunId: string, matchId: string): Promise<PassengerLoopRunRow> {
  const offer = await db.passengerLoopOffer.findUnique({ where: { matchId } });
  if (!offer) throw new LoopNotFoundError(matchId);
  await transitionLoopOffer(ctx, offer.id, "VALIDATED");
  await transitionLoopOffer(ctx, offer.id, "RESERVED_PENDING");
  const { row } = await transitionLoop(ctx, loopRunId, "OFFER_SENT");
  return row;
}

/** Driver declined while still a CANDIDATE (never reached the passenger).
 * `rematched` reflects whether the real engine (proposeMatchesForRequest,
 * called by handleDriverResponse's own decline branch) found a next
 * candidate — the loop run follows that real outcome, never guesses. */
export async function recordDriverDeclined(ctx: AgentContext, loopRunId: string, matchId: string, rematched: boolean): Promise<PassengerLoopRunRow> {
  const offer = await db.passengerLoopOffer.findUnique({ where: { matchId } });
  if (offer) await transitionLoopOffer(ctx, offer.id, "REJECTED");
  if (rematched) {
    const { row } = await transitionLoop(ctx, loopRunId, "MATCHING");
    return row;
  }
  return recordNoSupply(ctx, loopRunId, "NO_SUPPLY", "NO_CANDIDATES_AFTER_DRIVER_DECLINE");
}

/** OFFER_SENT -> PASSENGER_ACCEPTED: seat decrement + Trip creation already
 * succeeded in the real engine by the time this is called — terminal, the
 * loop's job (arranging real supply) is done. */
export async function recordPassengerAccepted(ctx: AgentContext, loopRunId: string, matchId: string): Promise<PassengerLoopRunRow> {
  const offer = await db.passengerLoopOffer.findUnique({ where: { matchId } });
  if (offer) await transitionLoopOffer(ctx, offer.id, "ACCEPTED");
  const { row } = await transitionLoop(ctx, loopRunId, "PASSENGER_ACCEPTED");
  return row;
}

/** OFFER_SENT -> PASSENGER_DECLINED, then immediately on to MATCHING/NO_SUPPLY
 * depending on whether the real engine's own rematch attempt (already
 * triggered inside handlePassengerResponse's decline branch) found a next
 * candidate. */
export async function recordPassengerDeclined(ctx: AgentContext, loopRunId: string, matchId: string, rematched: boolean): Promise<PassengerLoopRunRow> {
  const offer = await db.passengerLoopOffer.findUnique({ where: { matchId } });
  if (offer) await transitionLoopOffer(ctx, offer.id, "REJECTED");
  await transitionLoop(ctx, loopRunId, "PASSENGER_DECLINED");
  if (rematched) {
    const { row } = await transitionLoop(ctx, loopRunId, "MATCHING");
    return row;
  }
  return recordNoSupply(ctx, loopRunId, "NO_SUPPLY", "NO_CANDIDATES_AFTER_PASSENGER_DECLINE");
}

/** The passenger's confirmation CAS won, but the seat-decrement CAS then
 * lost a race to a concurrent confirmation on the same offer (spec item F:
 * two passengers racing for the last seat) — the real engine already
 * unwound the Match to CANCELLED and re-searched. This never fabricates a
 * successful match; it reflects exactly that real outcome. */
export async function recordOfferInvalidatedBySeatRace(ctx: AgentContext, loopRunId: string, matchId: string, rematched: boolean): Promise<PassengerLoopRunRow> {
  const offer = await db.passengerLoopOffer.findUnique({ where: { matchId } });
  if (offer) await transitionLoopOffer(ctx, offer.id, "INVALIDATED");
  if (rematched) {
    const { row } = await transitionLoop(ctx, loopRunId, "MATCHING");
    return row;
  }
  return recordNoSupply(ctx, loopRunId, "NO_SUPPLY", "SEAT_LOST_TO_CONCURRENT_PASSENGER");
}

/** A proposed Match expired unanswered (driver or passenger side) — the real
 * engine's expiry.ts already moved the Match to EXPIRED and attempted a
 * rematch; the loop follows suit. */
export async function recordOfferExpired(ctx: AgentContext, loopRunId: string, matchId: string, rematched: boolean): Promise<PassengerLoopRunRow> {
  const offer = await db.passengerLoopOffer.findUnique({ where: { matchId } });
  if (offer) await transitionLoopOffer(ctx, offer.id, "EXPIRED");
  await transitionLoop(ctx, loopRunId, "EXPIRED");
  if (rematched) {
    const { row } = await transitionLoop(ctx, loopRunId, "MATCHING");
    return row;
  }
  return recordNoSupply(ctx, loopRunId, "NO_SUPPLY", "NO_CANDIDATES_AFTER_EXPIRY");
}

/** The passenger demand itself was withdrawn/cancelled (pre-Trip). Any
 * in-flight PassengerLoopOffer is invalidated; the run is marked CANCELLED —
 * a true terminal, never reopened. A no-op (not an error) if the run is
 * already terminal or does not exist, since cancellation can race a
 * concurrent acceptance/expiry. */
export async function cancelPassengerLoop(ctx: AgentContext, tripRequestId: string): Promise<PassengerLoopRunRow | null> {
  const run = await db.passengerLoopRun.findUnique({ where: { tripRequestId } });
  if (!run) return null;

  const openOffer = await db.passengerLoopOffer.findFirst({
    where: { loopRunId: run.id, status: { in: ["CANDIDATE", "VALIDATED", "RESERVED_PENDING"] } },
  });
  if (openOffer) {
    try {
      await transitionLoopOffer(ctx, openOffer.id, "INVALIDATED");
    } catch {
      // Lost a race to a concurrent real-engine transition — the run-level
      // CANCELLED transition below still applies; never mask that outcome.
    }
  }

  try {
    const { row } = await transitionLoop(ctx, run.id, "CANCELLED");
    return row;
  } catch (err) {
    if (err instanceof LoopTransitionError) return db.passengerLoopRun.findUniqueOrThrow({ where: { id: run.id } });
    throw err;
  }
}

export async function getLoopRunByTripRequestId(tripRequestId: string): Promise<PassengerLoopRunRow | null> {
  return db.passengerLoopRun.findUnique({ where: { tripRequestId } });
}

export async function getLoopOfferByMatchId(matchId: string): Promise<PassengerLoopOfferRow | null> {
  return db.passengerLoopOffer.findUnique({ where: { matchId } });
}
