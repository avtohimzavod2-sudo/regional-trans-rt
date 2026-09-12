// What happened to order X, from the first message to wherever it is now.
//
// The facts were always there. They were in eight tables: the inbound message,
// the demand, RT OFFICE's loop run, every Match the demand went through, the
// Trip, Drive CRM's operational events, Mira's financial intents, RT's own
// ledger, and any support case opened along the way. Answering the question
// meant knowing all eight and joining them by hand.
//
// This module does the join. It reads, and only reads — nothing here writes a
// row, corrects a status or infers a fact that was not recorded. Where the
// data does not support an answer it says so in `gaps` rather than filling the
// hole with a plausible one, because a timeline that quietly invents the
// missing half is worse than no timeline.
import { db } from "@/lib/db";

export type TimelineSource =
  | "INBOUND"
  | "MIRA"
  | "AUDIT"
  | "JOLCHU"
  | "CRM_AUTO"
  | "FINANCE"
  | "LEDGER"
  | "SUPPORT";

/** Which part of RT handled the event.
 *
 * Not a new taxonomy — it is the one the organisation already has, read off
 * the audit action's own prefix. It exists so the question "did this order go
 * Mira → RT Core → RT OFFICE → CRM Авто and back?" can be answered by looking
 * rather than by knowing what every action name implies.
 *
 * HUMAN is deliberately its own contour rather than being folded into the
 * agent that carried the change out: a dispatcher override and an agent
 * decision must never read the same on a timeline. */
export type RtContour =
  | "MIRA"
  | "RT_CORE"
  | "RT_OFFICE"
  | "CRM_AUTO"
  | "JOLCHU"
  | "TREASURY"
  | "ESCALATION"
  | "MANAGEMENT"
  | "HUMAN"
  | "OTHER";

export interface TimelineEvent {
  at: Date;
  source: TimelineSource;
  contour: RtContour;
  /** Stable machine key — the audit action, the Drive CRM event type, etc. */
  key: string;
  /** One line a person can read without knowing the schema. */
  summary: string;
  /** Who did it, exactly as recorded. Null when the row does not say. */
  actor: string | null;
  /** The status the entity was in before this event, stitched from the
   * previous recorded status of the same entity on this timeline. Null at the
   * first event, and null wherever nothing recorded a status — RT's writers
   * store the status they moved *to*, not the one they came from, so this is a
   * derivation from the sequence and never a stored fact. */
  statusFrom: string | null;
  /** The status the entity was in after this event, as the row records it.
   * Null where the event is not a state change. */
  statusTo: string | null;
  /** The correlation id carried on the row itself. Null where the writer did
   * not set one — never back-filled from context.
   *
   * On an AUDIT row this is `AuditLogEntry.traceId`, which is the trace of the
   * *invocation* that wrote it, not of the order. Every inbound webhook starts
   * a fresh root context, so two transitions on one order carry two different
   * trace ids. The id that identifies the order across all of them is
   * `PassengerLoopRun.correlationId`, and RT OFFICE's writers put it in
   * `details.correlationId`. See `orderCorrelationId`. */
  correlationId: string | null;
  /** The order-wide correlation id, where the row records one — RT OFFICE's
   * loop writers do. This is the id that means "this order" across every
   * invocation; `correlationId` only means "this handler run". */
  orderCorrelationId: string | null;
  /** Only where a row genuinely records what caused it: a correction pointing
   * at the event it corrects, an intent naming its originating context, a
   * return-leg offer naming the trip that generated it. */
  causationId: string | null;
  entityType: string | null;
  entityId: string | null;
  detail?: unknown;
}

/** Where each entity stands now, with the timestamps the row itself carries.
 * Kept apart from `events` on purpose: this is state, not narrative, and
 * presenting a status as though it were a logged event would be inventing one. */
export interface OrderStates {
  request: { id: string; status: string; seats: number; travelDate: Date; createdAt: Date } | null;
  loopRun: {
    id: string;
    correlationId: string;
    status: string;
    noSupplyReason: string | null;
    noSupplyDetail: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  matches: Array<{
    id: string;
    status: string;
    driverOfferId: string;
    proposedToDriverAt: Date | null;
    driverRespondedAt: Date | null;
    proposedToPassengerAt: Date | null;
    passengerRespondedAt: Date | null;
    confirmedAt: Date | null;
    contactRevealedAt: Date | null;
    declineReason: string | null;
  }>;
  /** RT OFFICE's own view of each Match it worked. Kept separate from
   * `matches` because it is a different contour's record of the same thing,
   * and a disagreement between the two is itself worth being able to see. */
  loopOffers: Array<{ id: string; matchId: string; driverOfferId: string; status: string; updatedAt: Date }>;
  trip: {
    id: string;
    status: string;
    seats: number;
    paymentMode: string | null;
    totalFareSom: number | null;
    commissionSom: number | null;
    commissionChargedAt: Date | null;
    completedAt: Date | null;
    cancelledAt: Date | null;
    cancelReason: string | null;
  } | null;
}

export interface OrderIdentity {
  correlationId: string | null;
  rawMessageId: string | null;
  tripRequestId: string | null;
  loopRunId: string | null;
  passengerId: string | null;
  driverId: string | null;
  driverOfferId: string | null;
  matchIds: string[];
  tripId: string | null;
}

export interface OrderTimeline {
  /** What the caller asked about, verbatim. */
  handle: string;
  /** How the handle was recognised — "tripRequestId", "correlationId", … */
  resolvedBy: string | null;
  found: boolean;
  identity: OrderIdentity;
  states: OrderStates;
  events: TimelineEvent[];
  /** The contours this order actually passed through, in the order it reached
   * them, each named once. The short answer to "which parts of RT touched
   * this?" — and, read against the expected chain, to "which parts did not?" */
  contourPath: RtContour[];
  /** Where the order stands now, derived from `states`, not read from a log.
   * Named as a derivation so nobody mistakes it for something RT recorded. */
  derivedOutcome: string;
  /** The subset of events that are a duplicate, a retry or a lost race. Pulled
   * out because "was this order processed twice?" is a question people ask. */
  retries: TimelineEvent[];
  /** Refusals, blocks, failed writes and escalations. */
  problems: TimelineEvent[];
  /** What this timeline cannot tell you. Present so that a quiet timeline is
   * not mistaken for a complete one. */
  gaps: string[];
}

// Audit action prefix -> contour. The prefixes are already the organisation
// chart; this only writes the mapping down. `dispatcher.` is a human at a
// keyboard, which is why it maps to HUMAN and not to whichever agent's data
// the override touched.
const CONTOUR_BY_PREFIX: ReadonlyArray<readonly [string, RtContour]> = [
  ["mira.", "MIRA"],
  ["rt_office.", "RT_OFFICE"],
  ["crm_auto.", "CRM_AUTO"],
  ["jolchu.", "JOLCHU"],
  ["dispatcher.", "HUMAN"],
  ["artur.", "MANAGEMENT"],
  ["adilet.", "ESCALATION"],
  ["support.", "ESCALATION"],
  // Trust gates core decisions — whether a contact may be revealed on this
  // match — so it belongs to the core, not to the escalation contour. Conflicts
  // and discipline reach ESCALATION through Adilet and support cases instead.
  ["trust.", "RT_CORE"],
  ["pay.", "TREASURY"],
  ["tyyin.", "TREASURY"],
  ["sapargul.", "TREASURY"],
  // RT Core: the matching lifecycle itself. Listed explicitly rather than
  // used as a default, so an action from a contour nobody has mapped yet
  // shows up as OTHER instead of being silently attributed to the core.
  ["request.", "RT_CORE"],
  ["trip_request.", "RT_CORE"],
  ["offer.", "RT_CORE"],
  ["match.", "RT_CORE"],
  ["trip.", "RT_CORE"],
  ["contact.", "RT_CORE"],
  ["driver.", "RT_CORE"],
];

function contourOf(action: string): RtContour {
  for (const [prefix, contour] of CONTOUR_BY_PREFIX) {
    if (action.startsWith(prefix)) return contour;
  }
  return "OTHER";
}

// --- Data minimisation ------------------------------------------------------
//
// A timeline is read by operators, pasted into tickets and attached to
// reports, so it must not be a second copy of everyone's contact details and
// message bodies. Identifiers are masked to a correlatable tail; free text is
// reduced to its length. Both are reversible only by going back to the tables
// the timeline read from, which is where the access control lives.
//
// `reveal` exists because a real investigation sometimes needs the words a
// passenger used. It is off by default and the caller has to ask.

/** Keys whose value is a person's contact identifier. */
const IDENTIFIER_KEYS =
  /^(whatsappid|telegramuserid|telegramusername|senderid|externaluserid|chatid|phone|contactphone|contacthandle|customerref|recipient)$/i;

/** Keys whose value is free text somebody typed or said. */
const FREE_TEXT_KEYS =
  /^(text|rawtext|transcript|normalizedtext|description|resolution|rawinputsanitized|body|message|notes)$/i;

const SYNTHETIC_MARKER = "SYNTHETIC-TEST-";

/** Masks a contact identifier down to something an operator can still
 * correlate between two timelines without it being a phone number. The
 * synthetic-contour marker survives masking on purpose: it is proof of which
 * contour the row belongs to and it identifies nobody. */
export function maskIdentifier(value: string): string {
  const prefix = value.includes(SYNTHETIC_MARKER) ? SYNTHETIC_MARKER : "";
  return value.length <= 4 ? `${prefix}***` : `${prefix}***${value.slice(-4)}`;
}

function redactText(value: string): string {
  return `<redacted, ${value.length} chars>`;
}

/** Final pass: the known contact identifiers appear nowhere in the result,
 * under any key, however they got there.
 *
 * Per-field redaction is not sufficient on its own, and the reason is worth
 * writing down. RT builds a RawMessage id by concatenation —
 * `CHANNEL:senderId:externalId` — so the passenger's chat id rides inside a
 * field that looks like an opaque primary key, and gets copied into every
 * audit row that names that message. Masking field by field means finding
 * every such field forever. Replacing the identifiers wherever they occur
 * means finding them once.
 *
 * Dates are returned untouched: they are not strings and must stay Date
 * objects for the formatter and for callers. */
function scrubIdentifiers<T>(value: T, identifiers: readonly string[]): T {
  if (identifiers.length === 0) return value;

  const replace = (text: string): string => {
    let out = text;
    for (const identifier of identifiers) {
      if (out.includes(identifier)) out = out.split(identifier).join(maskIdentifier(identifier));
    }
    return out;
  };

  const walk = (node: unknown, depth: number): unknown => {
    if (typeof node === "string") return replace(node);
    if (node === null || typeof node !== "object" || node instanceof Date) return node;
    if (depth > 12) return node;
    if (Array.isArray(node)) return node.map((item) => walk(item, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(node as Record<string, unknown>)) {
      out[key] = walk(item, depth + 1);
    }
    return out;
  };

  return walk(value, 0) as T;
}

/** Walks a stored JSON payload and reduces anything personal. Structure and
 * every non-personal field are kept, because "toStatus", "reason" and
 * "idempotencyKey" are the whole diagnostic value of a details blob. */
function redactPayload(value: unknown, reveal: boolean, depth = 0): unknown {
  if (reveal || value === null || value === undefined) return value;
  if (depth > 6) return "<depth limit>";
  if (Array.isArray(value)) return value.map((item) => redactPayload(item, reveal, depth + 1));
  if (typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string" && IDENTIFIER_KEYS.test(key)) out[key] = maskIdentifier(item);
    else if (typeof item === "string" && FREE_TEXT_KEYS.test(key)) out[key] = redactText(item);
    else out[key] = redactPayload(item, reveal, depth + 1);
  }
  return out;
}

// Audit actions that mean "RT saw this twice, or lost a race, and did not
// double-act". Not failures; the opposite. Worth being able to find.
const RETRY_ACTIONS = new Set([
  "request.duplicate_ignored",
  "offer.duplicate_ignored",
  "match.seat_decrement_failed",
  "rt_office.telemetry_duplicate_ignored",
]);

// Actions that mean somebody or something was refused, blocked or escalated.
const PROBLEM_ACTIONS = new Set([
  "contact.reveal_blocked",
  "rt_office.telemetry_rejected",
  "rt_office.no_verified_supply_yet",
  "mira.injection_attempt_blocked",
  "mira.outbound.suppressed",
]);

const EMPTY_IDENTITY: OrderIdentity = {
  correlationId: null,
  rawMessageId: null,
  tripRequestId: null,
  loopRunId: null,
  passengerId: null,
  driverId: null,
  driverOfferId: null,
  matchIds: [],
  tripId: null,
};

const EMPTY_STATES: OrderStates = { request: null, loopRun: null, matches: [], loopOffers: [], trip: null };

export interface TimelineOptions {
  /** Include message bodies and contact identifiers unmasked. Off by default;
   * an investigation that genuinely needs the passenger's words has to say so,
   * and the routine case never carries them. */
  reveal?: boolean;
}

/** Turns whatever handle a person has into a trip request id.
 *
 * People arrive holding different things: a correlation id from a log line, a
 * match id from a dispatcher screen, a trip id from a complaint, a WhatsApp id
 * from the passenger themselves. All of them are the same order. */
async function resolveTripRequestId(handle: string): Promise<{ tripRequestId: string; resolvedBy: string } | null> {
  const request = await db.tripRequest.findUnique({ where: { id: handle }, select: { id: true } });
  if (request) return { tripRequestId: request.id, resolvedBy: "tripRequestId" };

  const loopRun = await db.passengerLoopRun.findUnique({
    where: { correlationId: handle },
    select: { tripRequestId: true },
  });
  if (loopRun) return { tripRequestId: loopRun.tripRequestId, resolvedBy: "correlationId" };

  const byLoopRunId = await db.passengerLoopRun.findUnique({
    where: { id: handle },
    select: { tripRequestId: true },
  });
  if (byLoopRunId) return { tripRequestId: byLoopRunId.tripRequestId, resolvedBy: "loopRunId" };

  const match = await db.match.findUnique({ where: { id: handle }, select: { tripRequestId: true } });
  if (match) return { tripRequestId: match.tripRequestId, resolvedBy: "matchId" };

  const trip = await db.trip.findUnique({
    where: { id: handle },
    select: { match: { select: { tripRequestId: true } } },
  });
  if (trip) return { tripRequestId: trip.match.tripRequestId, resolvedBy: "tripId" };

  const byRawMessage = await db.tripRequest.findUnique({
    where: { rawMessageId: handle },
    select: { id: true },
  });
  if (byRawMessage) return { tripRequestId: byRawMessage.id, resolvedBy: "rawMessageId" };

  // Last: the passenger's own WhatsApp id. Ambiguous by nature — a passenger
  // can have many orders — so it resolves to their most recent one and the
  // caller is told that is what happened.
  const passenger = await db.passenger.findUnique({
    where: { whatsappId: handle },
    select: { requests: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } } },
  });
  const latest = passenger?.requests[0];
  if (latest) return { tripRequestId: latest.id, resolvedBy: "passenger whatsappId (most recent order)" };

  return null;
}

/** Builds one order's whole story. Accepts a trip request id, a correlation
 * id, a loop run id, a match id, a trip id, an inbound message id, or the
 * passenger's WhatsApp id. */
export async function buildOrderTimeline(handle: string, options: TimelineOptions = {}): Promise<OrderTimeline> {
  const reveal = options.reveal ?? false;
  const resolved = await resolveTripRequestId(handle);
  if (!resolved) {
    return {
      handle,
      resolvedBy: null,
      found: false,
      identity: EMPTY_IDENTITY,
      states: EMPTY_STATES,
      events: [],
      contourPath: [],
      derivedOutcome: "NOT_FOUND",
      retries: [],
      problems: [],
      gaps: ["Nothing in the database matches this handle."],
    };
  }

  const request = await db.tripRequest.findUniqueOrThrow({
    where: { id: resolved.tripRequestId },
    include: {
      passenger: { select: { id: true, whatsappId: true } },
      rawMessage: true,
      passengerLoopRun: true,
      matches: { orderBy: { createdAt: "asc" }, include: { trip: true } },
    },
  });

  const trip = request.matches.map((m) => m.trip).find((t) => t !== null) ?? null;
  // The offer that mattered: the confirmed one if there is one, otherwise the
  // most recent proposal. Both are "which car was this order about".
  const decidedMatch = request.matches.find((m) => m.status === "CONFIRMED") ?? request.matches.at(-1) ?? null;
  const driverOfferId = trip?.driverOfferId ?? decidedMatch?.driverOfferId ?? null;
  const driverId =
    trip?.driverId ??
    (driverOfferId
      ? (await db.driverOffer.findUnique({ where: { id: driverOfferId }, select: { driverId: true } }))?.driverId ?? null
      : null);

  // Fetched for one purpose: knowing what has to be scrubbed out of the
  // result. A driver's phone number is shared with one passenger on one
  // confirmed match; it is not a field for an operator's timeline.
  const driver = driverId
    ? await db.driver.findUnique({
        where: { id: driverId },
        select: { telegramUserId: true, telegramUsername: true, phone: true },
      })
    : null;
  const contactIdentifiers = [
    request.passenger.whatsappId,
    driver?.telegramUserId,
    driver?.telegramUsername,
    driver?.phone,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  const identity: OrderIdentity = {
    correlationId: request.passengerLoopRun?.correlationId ?? null,
    rawMessageId: request.rawMessageId,
    tripRequestId: request.id,
    loopRunId: request.passengerLoopRun?.id ?? null,
    passengerId: request.passengerId,
    driverId,
    driverOfferId,
    matchIds: request.matches.map((m) => m.id),
    tripId: trip?.id ?? null,
  };

  const events = await collectEvents(identity, request.rawMessage, driverOfferId, reveal);
  events.sort((a, b) => a.at.getTime() - b.at.getTime());
  stitchStatusFrom(events);

  const loopOffers = request.passengerLoopRun
    ? await db.passengerLoopOffer.findMany({
        where: { loopRunId: request.passengerLoopRun.id },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const states: OrderStates = {
    request: {
      id: request.id,
      status: request.status,
      seats: request.seats,
      travelDate: request.travelDate,
      createdAt: request.createdAt,
    },
    loopRun: request.passengerLoopRun
      ? {
          id: request.passengerLoopRun.id,
          correlationId: request.passengerLoopRun.correlationId,
          status: request.passengerLoopRun.status,
          noSupplyReason: request.passengerLoopRun.noSupplyReason,
          noSupplyDetail: request.passengerLoopRun.noSupplyDetail,
          createdAt: request.passengerLoopRun.createdAt,
          updatedAt: request.passengerLoopRun.updatedAt,
        }
      : null,
    matches: request.matches.map((m) => ({
      id: m.id,
      status: m.status,
      driverOfferId: m.driverOfferId,
      proposedToDriverAt: m.proposedToDriverAt,
      driverRespondedAt: m.driverRespondedAt,
      proposedToPassengerAt: m.proposedToPassengerAt,
      passengerRespondedAt: m.passengerRespondedAt,
      confirmedAt: m.confirmedAt,
      contactRevealedAt: m.contactRevealedAt,
      declineReason: m.declineReason,
    })),
    loopOffers: loopOffers.map((o) => ({
      id: o.id,
      matchId: o.matchId,
      driverOfferId: o.driverOfferId,
      status: o.status,
      updatedAt: o.updatedAt,
    })),
    trip: trip
      ? {
          id: trip.id,
          status: trip.status,
          seats: trip.seats,
          paymentMode: trip.paymentMode,
          totalFareSom: trip.totalFareSom,
          commissionSom: trip.commissionSom,
          commissionChargedAt: trip.commissionChargedAt,
          completedAt: trip.completedAt,
          cancelledAt: trip.cancelledAt,
          cancelReason: trip.cancelReason,
        }
      : null,
  };

  // Scrubbed before the timeline is assembled rather than after, so that
  // `retries` and `problems` stay the very same event objects that are in
  // `events` instead of becoming clones of them.
  const scrub = <T,>(value: T): T => (reveal ? value : scrubIdentifiers(value, contactIdentifiers));
  const safeEvents = scrub(events);

  return {
    handle: scrub(handle),
    resolvedBy: resolved.resolvedBy,
    found: true,
    identity: scrub(identity),
    states: scrub(states),
    events: safeEvents,
    contourPath: distinctInOrder(safeEvents.map((e) => e.contour)),
    derivedOutcome: deriveOutcome(states),
    retries: safeEvents.filter((e) => RETRY_ACTIONS.has(e.key)),
    problems: safeEvents.filter(
      (e) => PROBLEM_ACTIONS.has(e.key) || e.source === "SUPPORT" || e.key.endsWith(".failed"),
    ),
    gaps: describeGaps(identity, safeEvents, reveal),
  };
}

function distinctInOrder(contours: readonly RtContour[]): RtContour[] {
  const seen = new Set<RtContour>();
  const out: RtContour[] = [];
  for (const contour of contours) {
    if (seen.has(contour)) continue;
    seen.add(contour);
    out.push(contour);
  }
  return out;
}

/** Fills in each event's input status from the last status recorded for the
 * same entity. RT's writers store where they moved a row *to*; the row it came
 * from is only knowable from the sequence, so this reads the sequence — and
 * leaves the first event of every entity at null rather than guessing that it
 * started from whatever the enum's default happens to be. */
function stitchStatusFrom(sorted: TimelineEvent[]): void {
  const lastByEntity = new Map<string, string>();
  for (const event of sorted) {
    if (event.statusTo === null || event.entityId === null) continue;
    event.statusFrom = lastByEntity.get(event.entityId) ?? null;
    lastByEntity.set(event.entityId, event.statusTo);
  }
}

/** The status a row records having moved to, if it records one at all. The key
 * names are the ones RT's writers actually use; an event with none of them is
 * not a state change and is left alone. */
function recordedStatus(detail: unknown): string | null {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  const bag = detail as Record<string, unknown>;
  for (const key of ["toStatus", "newStatus", "status", "to"]) {
    const value = bag[key];
    if (typeof value === "string") return value;
  }
  return null;
}

/** Reads one string out of a stored details blob, or null.
 *
 * Used for `causationId` and `correlationId`, both of which RT OFFICE's loop
 * writers record there. Read only where written — never derived from the
 * preceding event, because "what came before" and "what caused this" are not
 * the same claim. */
function detailString(detail: unknown, key: string): string | null {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  const value = (detail as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

type RawMessageRow = NonNullable<Awaited<ReturnType<typeof db.rawMessage.findUnique>>>;

async function collectEvents(
  identity: OrderIdentity,
  rawMessage: RawMessageRow | null,
  driverOfferId: string | null,
  reveal: boolean,
): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];
  const mask = (value: string) => (reveal ? value : maskIdentifier(value));

  // --- The message that started it -----------------------------------------
  if (rawMessage) {
    events.push({
      at: rawMessage.createdAt,
      source: "INBOUND",
      // The contact surface is Mira's, whichever adapter the bytes came in
      // through — this is the customer-demand end of the chain.
      contour: "MIRA",
      key: `inbound.${rawMessage.parseResult ?? "UNKNOWN"}`,
      summary: `${rawMessage.channel} message from ${mask(rawMessage.senderId)}: ${
        reveal ? truncate(rawMessage.text) : redactText(rawMessage.text)
      }`,
      actor: mask(rawMessage.senderId),
      correlationId: null,
      orderCorrelationId: null,
      causationId: null,
      statusFrom: null,
      statusTo: rawMessage.parseResult,
      entityType: "RawMessage",
      entityId: rawMessage.id,
      detail: {
        parseResult: rawMessage.parseResult,
        extractionConfidence: rawMessage.extractionConfidence,
        detectedLanguage: rawMessage.detectedLanguage,
      },
    });
  }

  // --- Mira's side of the conversation, where she drove this order ---------
  // Joined on traceId, which is the only honest link: a turn that did not
  // produce this order's trace is not this order's turn. Orders ingested
  // straight through the adapter (as the synthetic contour does) legitimately
  // have none, which is why an empty result is not treated as a gap.
  if (identity.correlationId) {
    const turns = await db.miraMessage.findMany({
      where: { traceId: identity.correlationId },
      orderBy: { createdAt: "asc" },
    });
    for (const turn of turns) {
      const said = turn.normalizedText ?? turn.transcript ?? turn.rawText ?? "";
      events.push({
        at: turn.createdAt,
        source: "MIRA",
        contour: "MIRA",
        key: `mira.turn.${turn.sender}`,
        summary: `${turn.sender} turn${turn.intent ? ` (intent ${turn.intent})` : ""}: ${
          reveal ? truncate(said) : redactText(said)
        }`,
        actor: turn.sender,
        correlationId: turn.traceId,
        orderCorrelationId: null,
        causationId: null,
        statusFrom: null,
        statusTo: null,
        entityType: "MiraMessage",
        entityId: turn.id,
        detail: {
          requiresClarification: turn.requiresClarification,
          uncertainties: turn.uncertainties,
          languageConfidence: turn.languageConfidence,
        },
      });
    }
  }

  // --- Everything the system logged about any part of this order -----------
  const entityIds = [
    identity.rawMessageId,
    identity.tripRequestId,
    identity.loopRunId,
    identity.driverOfferId,
    identity.tripId,
    ...identity.matchIds,
  ].filter((id): id is string => id !== null);

  const audit = await db.auditLogEntry.findMany({
    where: {
      OR: [
        { entityId: { in: entityIds } },
        ...(identity.correlationId ? [{ traceId: identity.correlationId }] : []),
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  for (const entry of audit) {
    const status = recordedStatus(entry.details);
    events.push({
      at: entry.createdAt,
      source: "AUDIT",
      // A DISPATCHER actor is a person, whatever the action prefix says, and
      // the timeline must show that rather than crediting an agent.
      contour: entry.actorType === "DISPATCHER" ? "HUMAN" : contourOf(entry.action),
      key: entry.action,
      summary: `${entry.action} on ${entry.entityType}${status ? ` -> ${status}` : ""}`,
      actor: entry.agentName ?? entry.actorId ?? entry.actorType,
      correlationId: entry.traceId,
      orderCorrelationId: detailString(entry.details, "correlationId"),
      // Some writers record the trace that caused the transition alongside it;
      // taken only where it is genuinely there.
      causationId: detailString(entry.details, "causationId"),
      statusFrom: null,
      statusTo: status,
      entityType: entry.entityType,
      entityId: entry.entityId,
      detail: redactPayload(entry.details, reveal),
    });
  }

  // --- Route intelligence, where the order needed any -----------------------
  // Жолчу answers route/geo/ETA questions and owns no order, so its rows carry
  // a traceId rather than an order id. That trace is the join, and it is also
  // the limit: Jolchu work done outside this order's trace is not this order's.
  if (identity.correlationId) {
    const routeWork = await db.jolchuRequest.findMany({
      where: { traceId: identity.correlationId },
      orderBy: { createdAt: "asc" },
    });
    for (const work of routeWork) {
      events.push({
        at: work.createdAt,
        source: "JOLCHU",
        contour: "JOLCHU",
        key: `jolchu.${work.reasonCode}`,
        summary:
          `${work.reasonCode} -> ${work.status}` +
          `${work.ambiguity ? ", ambiguous" : ""}` +
          `${work.requiresConfirmation ? ", needs confirmation" : ""}` +
          `${work.errorMessage ? `, error: ${work.errorMessage}` : ""}`,
        actor: "JOLCHU",
        correlationId: work.traceId,
        orderCorrelationId: null,
        causationId: null,
        statusFrom: null,
        statusTo: work.status,
        entityType: "JolchuRequest",
        entityId: work.id,
        detail: {
          confidence: work.confidence,
          latencyMs: work.latencyMs,
          warnings: work.warnings,
          inputType: work.inputType,
        },
      });
    }
  }

  // --- Operational reality, as CRM Авто recorded it ------------------------
  const crmEvents = await db.driveCrmEvent.findMany({
    where: {
      OR: [
        ...(identity.tripId ? [{ tripId: identity.tripId }] : []),
        ...(driverOfferId ? [{ offerId: driverOfferId }] : []),
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  for (const event of crmEvents) {
    events.push({
      at: event.createdAt,
      source: "CRM_AUTO",
      contour: "CRM_AUTO",
      key: `crm_auto.${event.eventType}`,
      summary: `${event.eventType} reported by ${event.source}`,
      actor: event.source,
      correlationId: null,
      orderCorrelationId: null,
      // The one place in the schema where a row names what it corrects.
      causationId: event.correctsEventId,
      statusFrom: null,
      statusTo: event.incidentStatus,
      entityType: "DriveCrmEvent",
      entityId: event.id,
      detail: {
        incidentStatus: event.incidentStatus,
        etaMinutes: event.etaMinutes,
        details: redactPayload(event.details, reveal),
      },
    });
  }

  // --- Money intended, and money actually booked ---------------------------
  if (identity.tripId) {
    const intents = await db.passengerFinancialIntent.findMany({
      where: { tripId: identity.tripId },
      orderBy: { createdAt: "asc" },
    });
    for (const intent of intents) {
      events.push({
        at: intent.createdAt,
        source: "FINANCE",
        // An intent is Mira recording what a passenger owes, not the treasury
        // taking it. Attributing it to TREASURY would put money in a contour
        // that has not touched it.
        contour: "MIRA",
        key: `finance.intent.${intent.reason}`,
        // Deliberately worded as an intent. No money moved; a passenger cashier
        // has not been appointed, and financialProcessor stays null until one is.
        summary: `intent to collect ${intent.amountSom} ${intent.currency} (${intent.paymentType}), processor: ${intent.financialProcessor ?? "none appointed"}`,
        actor: intent.financialProcessor,
        correlationId: intent.conversationId,
        orderCorrelationId: null,
        causationId: intent.originatingContext,
        statusFrom: null,
        statusTo: null,
        entityType: "PassengerFinancialIntent",
        entityId: intent.id,
        detail: {
          idempotencyKey: intent.idempotencyKey,
          bookingId: intent.bookingId,
          customerRef: reveal ? intent.customerRef : maskIdentifier(intent.customerRef),
        },
      });
    }

    const ledger = await db.ledgerEntry.findMany({
      where: { tripId: identity.tripId },
      orderBy: { createdAt: "asc" },
    });
    for (const entry of ledger) {
      events.push({
        at: entry.createdAt,
        source: "LEDGER",
        contour: "TREASURY",
        key: `ledger.${entry.type}`,
        summary: `${entry.type} ${entry.amountSom} som (${entry.status})`,
        actor: entry.actorId ?? entry.actorType,
        correlationId: null,
        orderCorrelationId: null,
        causationId: null,
        statusFrom: null,
        statusTo: entry.status,
        entityType: "LedgerEntry",
        entityId: entry.id,
        detail: { paymentMode: entry.paymentMode, description: entry.description, reversedAt: entry.reversedAt },
      });
    }

    const cases = await db.supportCase.findMany({
      where: { tripId: identity.tripId },
      orderBy: { createdAt: "asc" },
    });
    for (const supportCase of cases) {
      events.push({
        at: supportCase.createdAt,
        source: "SUPPORT",
        contour: "ESCALATION",
        key: `support.${supportCase.caseType}`,
        summary: `support case ${supportCase.caseType} (${supportCase.status})${supportCase.escalatedAt ? ", escalated" : ""}`,
        actor: supportCase.openedById ?? supportCase.openedByType,
        correlationId: null,
        orderCorrelationId: null,
        causationId: null,
        statusFrom: null,
        statusTo: supportCase.status,
        entityType: "SupportCase",
        entityId: supportCase.id,
        detail: {
          // A complaint is written in somebody's own words about somebody
          // else. Length only, unless asked.
          description: supportCase.description
            ? reveal
              ? supportCase.description
              : redactText(supportCase.description)
            : null,
          resolution: supportCase.resolution
            ? reveal
              ? supportCase.resolution
              : redactText(supportCase.resolution)
            : null,
          escalatedAt: supportCase.escalatedAt,
          resolvedAt: supportCase.resolvedAt,
        },
      });
    }
  }

  return events;
}

/** Where the order stands, read off the rows. Every branch names a state that
 * is actually stored; none of them guesses. */
function deriveOutcome(states: OrderStates): string {
  if (states.trip) {
    if (states.trip.status === "COMPLETED") return "TRIP_COMPLETED";
    if (states.trip.status === "CANCELLED") return "TRIP_CANCELLED";
    if (states.trip.status === "IN_PROGRESS") return "TRIP_IN_PROGRESS";
    if (states.trip.status === "NO_SHOW") return "TRIP_NO_SHOW";
    return "TRIP_SCHEDULED";
  }
  if (!states.request) return "NOT_FOUND";
  if (states.request.status === "CANCELLED") return "DEMAND_CANCELLED";
  if (states.request.status === "EXPIRED") return "DEMAND_EXPIRED";

  const open = states.matches.find((m) => m.status === "AWAITING_DRIVER" || m.status === "AWAITING_PASSENGER");
  if (open) return open.status;

  if (states.loopRun?.status === "NO_SUPPLY") return "NO_SUPPLY";
  return `DEMAND_${states.request.status}`;
}

/** Says out loud what this timeline does not cover. Every line is a real
 * limitation of what RT writes down today, not a disclaimer. */
function describeGaps(identity: OrderIdentity, events: TimelineEvent[], reveal: boolean): string[] {
  const gaps: string[] = [];

  if (!identity.correlationId) {
    gaps.push(
      "No RT OFFICE loop run, so this order has no correlation id — and Mira's turns and Жолчу's route work " +
        "join on exactly that, so neither can be shown even if they happened.",
    );
  }

  // Input statuses are the one field on this timeline that is inferred rather
  // than read, and a reader deciding something on the strength of a transition
  // has to know which half of it was stored.
  if (events.some((e) => e.statusFrom !== null)) {
    gaps.push(
      "Input statuses are stitched from the previous recorded status of the same entity — RT's writers store " +
        "the status they moved to, not the one they came from.",
    );
  }

  if (!reveal) {
    gaps.push(
      "Message bodies and contact identifiers are redacted. Re-read with reveal for an investigation that needs them.",
    );
  }

  const auditEvents = events.filter((e) => e.source === "AUDIT");
  const withoutCorrelation = auditEvents.filter((e) => e.correlationId === null).length;
  if (withoutCorrelation > 0) {
    gaps.push(
      `${withoutCorrelation} of ${auditEvents.length} audit entries carry no traceId — ` +
        "logAction() does not take one, so those are stitched in by entity id instead.",
    );
  }

  // The limitation that most changes how this timeline should be read. A
  // traceId is minted per root context, and every inbound webhook starts a
  // new one, so an order worked over four webhooks has four trace ids and
  // none of them identifies the order. Searching by traceId therefore finds
  // one invocation; this timeline is held together by entity id instead.
  const otherTraces = new Set(
    auditEvents
      .map((e) => e.correlationId)
      .filter((id): id is string => id !== null && id !== identity.correlationId),
  );
  if (otherTraces.size > 0) {
    gaps.push(
      `Audit traceId is per-invocation, not per-order: these entries span ${otherTraces.size + 1} trace ids ` +
        `because each inbound event starts a fresh root context. The order-wide id is ` +
        `${identity.correlationId ?? "(none)"}, which RT OFFICE records in details.correlationId; ` +
        "this timeline is joined by entity id, not by trace.",
    );
  }

  // Outbound text is handed to the send boundary and not persisted. Anyone
  // asking "what exactly did we tell the passenger?" has to be told plainly
  // that this timeline cannot answer it.
  gaps.push("Outbound message bodies are not stored; this timeline shows what RT decided, not what it said.");

  if (!identity.rawMessageId) {
    gaps.push("No inbound message is linked to this demand, so the story starts at the TripRequest.");
  }

  return gaps;
}

function truncate(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/** The timeline as something a person reads in a terminal. */
export function formatOrderTimeline(timeline: OrderTimeline): string {
  if (!timeline.found) return `No order matches "${timeline.handle}".`;

  const { identity, states } = timeline;
  const lines: string[] = [
    `Order ${identity.tripRequestId}  (matched from ${timeline.handle} by ${timeline.resolvedBy})`,
    `  correlation ${identity.correlationId ?? "—"}   passenger ${identity.passengerId ?? "—"}   driver ${identity.driverId ?? "—"}`,
    `  offer ${identity.driverOfferId ?? "—"}   matches ${identity.matchIds.length}   trip ${identity.tripId ?? "—"}`,
    `  contours: ${timeline.contourPath.join(" -> ") || "—"}`,
    `  now: ${timeline.derivedOutcome} (derived from current state)`,
    "",
  ];

  if (states.loopRun) {
    const reason = states.loopRun.noSupplyReason
      ? ` — ${states.loopRun.noSupplyReason}${states.loopRun.noSupplyDetail ? ` (${states.loopRun.noSupplyDetail})` : ""}`
      : "";
    lines.push(`  RT OFFICE loop: ${states.loopRun.status}${reason}`, "");
  }

  lines.push(`  ${timeline.events.length} events:`);
  for (const event of timeline.events) {
    const when = event.at.toISOString().replace("T", " ").slice(0, 19);
    const actor = event.actor ? ` [${event.actor}]` : "";
    // Only shown when the row recorded an output status; "? -> X" says the
    // input was not stored, which is different from saying it was unknown.
    const transition = event.statusTo ? `  (${event.statusFrom ?? "?"} -> ${event.statusTo})` : "";
    lines.push(`    ${when}  ${event.contour.padEnd(11)} ${event.key}${actor}${transition}`);
    lines.push(`${" ".repeat(34)}${event.summary}`);
  }

  if (timeline.retries.length > 0) {
    lines.push("", `  ${timeline.retries.length} duplicate/retry events:`);
    for (const event of timeline.retries) lines.push(`    ${event.key} — ${event.summary}`);
  }

  if (timeline.problems.length > 0) {
    lines.push("", `  ${timeline.problems.length} refusals/escalations:`);
    for (const event of timeline.problems) lines.push(`    ${event.key} — ${event.summary}`);
  }

  lines.push("", "  What this cannot tell you:");
  for (const gap of timeline.gaps) lines.push(`    - ${gap}`);

  return lines.join("\n");
}
