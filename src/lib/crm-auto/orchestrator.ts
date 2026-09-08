// CRM_AUTO_AGENT_CONTRACT + CRM Auto's entrypoints. CRM Auto owns exactly
// one Prisma model — DriveCrmEvent — and only ever appends verified
// operational facts to it (ETA, breakdown/incident, backhaul opportunity,
// operational history). It never mutates Driver/DriverOffer/Match/Trip
// (RT Core's exclusive write surface, spec s.5/s.8) and never calculates
// money (spec PART 1/3).
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";
import type { AgentContract } from "@/lib/agents/types";
import { canOpenBreakdown, canResolveBreakdown, validateOperationalEvent } from "./lifecycle";
import type { RecordOperationalEventInput, RecordOperationalEventOutcome } from "./types";

export const CRM_AUTO_AGENT_CONTRACT: AgentContract = {
  name: "CRM_AUTO",
  mission:
    "Service Drive CRM: append-only tracking of operational ETA, breakdown/incident, backhaul opportunity, and operational history for drivers — a verified-fact log other agents (RT OFFICE, Artur) read, never a second source of truth for Driver/DriverOffer/Match/Trip.",
  inputs: ["driverId + eventType + verified fact payload (etaMinutes / incidentStatus / correctsEventId / details) + idempotencyKey"],
  outputs: ["DriveCrmEvent row (created or deduplicated)", "operational history / open-incident reads for RT OFFICE and Artur"],
  permissions: [
    "create DriveCrmEvent (its own exclusive write surface — append-only, never update or delete)",
    "read DriveCrmEvent",
    "write AuditLogEntry (agent: CRM_AUTO)",
  ],
  prohibitedActions: [
    "never own Mira CRM or any passenger-facing data",
    "never replace RT OFFICE's demand<->supply resolution",
    "never orchestrate other RT agents",
    "never calculate money or touch RtBalance/LedgerEntry/commission",
    "never communicate externally as Mira or any public persona",
    "never write Driver/DriverOffer/Match/Trip directly — those remain matching/orchestrate.ts's exclusive write surface",
    "never record a fact it has not verified — an ETA/incident is only ever recorded from an upstream verified signal, never invented",
    "never update or delete a DriveCrmEvent row — a mistaken fact is only ever corrected by appending a new CORRECTION event referencing it (correctsEventId), preserving full historical auditability",
  ],
  kpi: ["% of recordOperationalEvent calls that are clean (non-duplicate) appends", "breakdown incidents resolved without a stale second OPEN incident"],
  escalationRules: ["a resolveBreakdownIncident call with no matching OPEN incident is rejected rather than guessed"],
  reportsTo: "ARTUR",
  canRead: ["drive_crm_event"],
  canExecute: ["crm_auto.record_operational_event", "crm_auto.resolve_breakdown_incident", "crm_auto.record_exceptional_correction"],
  ownsExclusiveCapabilities: ["drive_crm_event_write"],
  forbiddenCapabilities: [
    "external_customer_communication",
    "confirm_cargo_payment",
    "central_treasury_transaction_record",
    "complaint_arbitration_decision",
    "disciplinary_sanction",
    "director_daily_brief",
  ],
  escalationTarget: "ARTUR",
  criticalityLevel: "MEDIUM",
  active: true,
};

/** Append one verified operational fact. Idempotent against duplicate
 * webhook/event delivery: relies on DriveCrmEvent.idempotencyKey's real
 * DB-level unique constraint (Prisma P2002), not a check-then-write race,
 * since two deliveries of the same event can race concurrently. */
export async function recordOperationalEvent(input: RecordOperationalEventInput): Promise<RecordOperationalEventOutcome & { deduplicated: boolean }> {
  const validation = validateOperationalEvent(input);
  if (!validation.valid) {
    throw new Error(`CRM Auto rejected event: ${validation.reason}`);
  }

  try {
    const event = await db.driveCrmEvent.create({
      data: {
        driverId: input.driverId,
        tripId: input.tripId,
        offerId: input.offerId,
        eventType: input.eventType,
        incidentStatus: input.incidentStatus,
        etaMinutes: input.etaMinutes,
        source: input.source,
        details: input.details as Prisma.InputJsonValue | undefined,
        correctsEventId: input.correctsEventId,
        idempotencyKey: input.idempotencyKey,
      },
    });

    // CORRECTION events get a distinct audit action name so an exceptional
    // audited correction is never buried among routine event_recorded
    // entries — it must stand out on inspection (preserve full historical
    // auditability, never a silent overwrite).
    await logAction({
      actorType: "AGENT",
      actorId: "CRM_AUTO",
      action: input.eventType === "CORRECTION" ? "crm_auto.exceptional_correction" : "crm_auto.event_recorded",
      entityType: "DriveCrmEvent",
      entityId: event.id,
      details: { eventType: input.eventType, driverId: input.driverId, correctsEventId: input.correctsEventId },
    });

    return { eventId: event.id, deduplicated: false };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await db.driveCrmEvent.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey } });
      return { eventId: existing.id, deduplicated: true };
    }
    throw err;
  }
}

/** Records an exceptional, explicitly audited correction of an earlier
 * event (e.g. a false breakdown report) — spec-directed "preserve full
 * historical auditability": the original row is never updated or deleted
 * (see boundary.test.ts), only superseded in meaning by this new appended
 * CORRECTION event that references it via correctsEventId. Deliberately
 * bypasses canOpenBreakdown/canResolveBreakdown — a correction is not a new
 * operational transition, it is an audited admission that an earlier
 * recorded fact was wrong, so it must not be blocked by the very state that
 * fact itself produced. */
export async function recordExceptionalCorrection(params: {
  driverId: string;
  correctsEventId: string;
  reason: string;
  source: string;
  idempotencyKey: string;
  tripId?: string;
  offerId?: string;
}): Promise<RecordOperationalEventOutcome & { deduplicated: boolean }> {
  return recordOperationalEvent({
    driverId: params.driverId,
    tripId: params.tripId,
    offerId: params.offerId,
    eventType: "CORRECTION",
    source: params.source,
    correctsEventId: params.correctsEventId,
    details: { reason: params.reason },
    idempotencyKey: params.idempotencyKey,
  });
}

/** Deterministic transition: open a new breakdown only when the driver has
 * no other OPEN incident already (spec s.8: critical transitions must be
 * deterministic code, not a free-form LLM decision). */
export async function openBreakdownIncident(params: {
  driverId: string;
  source: string;
  idempotencyKey: string;
  details?: Record<string, unknown>;
}) {
  const openIncident = await db.driveCrmEvent.findFirst({
    where: { driverId: params.driverId, eventType: "BREAKDOWN_INCIDENT", incidentStatus: "OPEN" },
    orderBy: { createdAt: "desc" },
  });

  const validation = canOpenBreakdown(!!openIncident);
  if (!validation.valid) throw new Error(`CRM Auto rejected breakdown open: ${validation.reason}`);

  return recordOperationalEvent({
    driverId: params.driverId,
    eventType: "BREAKDOWN_INCIDENT",
    incidentStatus: "OPEN",
    source: params.source,
    details: params.details,
    idempotencyKey: params.idempotencyKey,
  });
}

/** Deterministic transition: a RESOLVED event may only be recorded when an
 * OPEN incident currently exists for that driver. */
export async function resolveBreakdownIncident(params: {
  driverId: string;
  source: string;
  idempotencyKey: string;
  details?: Record<string, unknown>;
}) {
  const openIncident = await db.driveCrmEvent.findFirst({
    where: { driverId: params.driverId, eventType: "BREAKDOWN_INCIDENT", incidentStatus: "OPEN" },
    orderBy: { createdAt: "desc" },
  });

  const validation = canResolveBreakdown(!!openIncident);
  if (!validation.valid) throw new Error(`CRM Auto rejected breakdown resolution: ${validation.reason}`);

  return recordOperationalEvent({
    driverId: params.driverId,
    eventType: "BREAKDOWN_INCIDENT",
    incidentStatus: "RESOLVED",
    source: params.source,
    details: params.details,
    idempotencyKey: params.idempotencyKey,
  });
}

/** Read-only operational history for a driver — feeds Artur's read-only
 * Drive CRM visibility (spec s.9) via bridge.ts. */
export async function operationalHistoryForDriver(driverId: string, limit = 20) {
  return db.driveCrmEvent.findMany({
    where: { driverId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
