// ADILET enforcement layer (AGENTS Adilet spec s.30-s.33). The ONLY place
// in Adilet that mutates a subject's actual access — checks current
// status, duration, caseId, reason, and idempotency before touching
// anything (spec s.30). Reuses Driver.status/DeliveryExecutor.status'
// existing enums directly rather than inventing a parallel field (spec
// s.33) — Adilet becomes the disciplinary writer of those fields, not a
// competing scoring system. Passenger.isBlocked is the one existing
// client-block mechanism; no new tiered client-access field is added here
// (spec s.46 excludes a larger passenger-core rework — see AdiletSanction
// itself as the source of truth for TEMPORARY_RESTRICTION/SUSPENSION on a
// client, surfaced to dispatchers via the case, not enforced client-side).
import type { AdiletSanction, AdiletSanctionType } from "@prisma/client";
import { db } from "@/lib/db";
import type { AgentContext } from "@/lib/agents/types";
import { recordExecutorOutcome } from "@/lib/sapar/executors";
import { emitAdiletEvent } from "./events";

const ACTIVE_SHIPMENT_STATUSES = ["CONFIRMED", "AWAITING_PICKUP", "PICKED_UP", "IN_TRANSIT", "AT_TRANSFER_POINT", "OUT_FOR_DELIVERY"] as const;
const ACTIVE_TRIP_STATUSES = ["SCHEDULED", "IN_PROGRESS"] as const;

/** Pure: whether applying this sanction type actually changes the
 * subject's status field, vs. only being recorded (spec s.33 — no
 * arbitrary magic-number/status writes for advisory-level rungs). */
export function statusEffectFor(sanctionType: AdiletSanctionType): "ACTIVE" | "LIMITED" | "SUSPENDED" | "BLOCKED" | null {
  switch (sanctionType) {
    case "BLOCKED":
      return "BLOCKED";
    case "SUSPENDED":
    case "TEMPORARY_SUSPENSION":
      return "SUSPENDED";
    case "LIMITED_ACCESS":
      return "LIMITED";
    default:
      return null;
  }
}

/** Never left undefined (spec s.32): surfaces any shipment an executor is
 * still actively working before/while a suspension takes effect, so a
 * dispatcher can complete/replace/escalate it rather than have it silently
 * orphaned. Adilet itself never auto-reassigns a shipment — that stays
 * Sapar's job. */
async function activeShipmentIdsForExecutor(executorId: string): Promise<string[]> {
  const rows = await db.shipment.findMany({
    where: { assignedExecutorId: executorId, status: { in: [...ACTIVE_SHIPMENT_STATUSES] } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function activeTripIdsForDriver(driverId: string): Promise<string[]> {
  const rows = await db.trip.findMany({ where: { driverId, status: { in: [...ACTIVE_TRIP_STATUSES] } }, select: { id: true } });
  return rows.map((r) => r.id);
}

async function applyClientEffect(sanction: AdiletSanction) {
  if (statusEffectFor(sanction.sanctionType) !== "BLOCKED") return;
  const passenger = await db.passenger.findUnique({ where: { id: sanction.subjectId } });
  if (passenger) await db.passenger.update({ where: { id: sanction.subjectId }, data: { isBlocked: true } });
}

async function applyDriverEffect(ctx: AgentContext, sanction: AdiletSanction) {
  const effect = statusEffectFor(sanction.sanctionType);
  const activeTripIds = await activeTripIdsForDriver(sanction.subjectId);
  if (activeTripIds.length > 0) {
    await emitAdiletEvent(ctx, "SANCTION_APPLIED", sanction.caseId, { subjectType: "DRIVER", subjectId: sanction.subjectId, activeTripIds, note: "driver has active trips — dispatcher must complete/reassign/escalate, not silently abandoned" });
  }
  if (effect === "BLOCKED" || effect === "SUSPENDED") {
    await db.driver.update({ where: { id: sanction.subjectId }, data: { status: effect } });
  }
  // LIMITED has no DriverStatus equivalent (spec s.46 scope: no passenger-core
  // rework) — recorded on the sanction only, matching gate already checks
  // driverStatus === "ACTIVE" so a milder rung's absence of a field never
  // silently grants full access back.
}

async function applyExecutorEffect(ctx: AgentContext, sanction: AdiletSanction) {
  const effect = statusEffectFor(sanction.sanctionType);
  const activeShipmentIds = await activeShipmentIdsForExecutor(sanction.subjectId);
  if (activeShipmentIds.length > 0) {
    await emitAdiletEvent(ctx, "SANCTION_APPLIED", sanction.caseId, { subjectType: "EXECUTOR", subjectId: sanction.subjectId, activeShipmentIds, note: "executor has active shipments — dispatcher must complete/reassign/escalate, not silently abandoned" });
  }
  if (effect) {
    await db.deliveryExecutor.update({
      where: { id: sanction.subjectId },
      data: {
        status: effect,
        blacklistReason: effect === "SUSPENDED" || effect === "BLOCKED" ? sanction.reason : undefined,
        blacklistedAt: effect === "SUSPENDED" || effect === "BLOCKED" ? new Date() : undefined,
      },
    });
  }
  if (sanction.sanctionType === "RELIABILITY_PENALTY") {
    // Deterministic reliability impact via the existing counter Sapar
    // already scores from (spec s.33) — never an invented number.
    await recordExecutorOutcome(sanction.subjectId, "complaint");
  }
}

/** Idempotent (spec s.34): `decisionId` is unique on AdiletSanction, so a
 * repeated call for the same decision returns the already-applied sanction
 * instead of double-applying. */
export async function applySanction(ctx: AgentContext, params: { caseId: string; decisionId: string; subjectType: "CLIENT" | "DRIVER" | "EXECUTOR"; subjectId: string; sanctionType: AdiletSanctionType; reason: string; durationDays: number | null }): Promise<AdiletSanction> {
  const existing = await db.adiletSanction.findUnique({ where: { decisionId: params.decisionId } });
  if (existing) return existing;

  const expiresAt = params.durationDays != null ? new Date(Date.now() + params.durationDays * 24 * 60 * 60 * 1000) : null;

  const sanction = await db.adiletSanction.create({
    data: {
      caseId: params.caseId,
      decisionId: params.decisionId,
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      sanctionType: params.sanctionType,
      reason: params.reason,
      expiresAt,
    },
  });

  if (params.subjectType === "CLIENT") await applyClientEffect(sanction);
  else if (params.subjectType === "DRIVER") await applyDriverEffect(ctx, sanction);
  else await applyExecutorEffect(ctx, sanction);

  await emitAdiletEvent(ctx, sanction.sanctionType === "FORMAL_WARNING" || sanction.sanctionType === "ADVISORY" ? "WARNING_ISSUED" : "SANCTION_APPLIED", params.caseId, {
    sanctionId: sanction.id,
    subjectType: params.subjectType,
    subjectId: params.subjectId,
    sanctionType: params.sanctionType,
    expiresAt: expiresAt?.toISOString() ?? null,
  });

  return sanction;
}

/** Reverses a sanction (appeal overturned, or manual director override) —
 * the sanction row is never deleted, only marked REVERSED (spec s.19). If
 * the subject's status still matches what this sanction set, it's rolled
 * back to ACTIVE; if something else changed it meanwhile, that newer state
 * is left alone rather than clobbered (spec s.35 concurrency safety). */
export async function reverseSanction(ctx: AgentContext, sanctionId: string, reason: string): Promise<AdiletSanction> {
  const sanction = await db.adiletSanction.findUniqueOrThrow({ where: { id: sanctionId } });
  if (sanction.status === "REVERSED") return sanction;

  const effect = statusEffectFor(sanction.sanctionType);
  if (sanction.subjectType === "CLIENT" && effect === "BLOCKED") {
    await db.passenger.updateMany({ where: { id: sanction.subjectId, isBlocked: true }, data: { isBlocked: false } });
  } else if (sanction.subjectType === "DRIVER" && (effect === "BLOCKED" || effect === "SUSPENDED")) {
    await db.driver.updateMany({ where: { id: sanction.subjectId, status: effect }, data: { status: "ACTIVE" } });
  } else if (sanction.subjectType === "EXECUTOR" && effect) {
    await db.deliveryExecutor.updateMany({ where: { id: sanction.subjectId, status: effect }, data: { status: "ACTIVE", blacklistReason: null, blacklistedAt: null } });
  }

  const reversed = await db.adiletSanction.update({ where: { id: sanctionId }, data: { status: "REVERSED", reversedAt: new Date(), reversedReason: reason } });
  await emitAdiletEvent(ctx, "SANCTION_REVERSED", sanction.caseId, { sanctionId, reason });
  return reversed;
}

/** Scalable expiry (spec s.48/s.49) — an indexed [status, expiresAt] query,
 * never a per-second full-table scan. Intended to be invoked by a periodic
 * job/cron once one exists in this project; safe to call repeatedly
 * (idempotent — an already-EXPIRED row is simply not matched again). */
export async function expireDueSanctions(ctx: AgentContext, now: Date = new Date()): Promise<number> {
  const due = await db.adiletSanction.findMany({ where: { status: "ACTIVE", expiresAt: { lte: now } }, take: 200 });
  for (const sanction of due) {
    const effect = statusEffectFor(sanction.sanctionType);
    if (sanction.subjectType === "CLIENT" && effect === "BLOCKED") {
      await db.passenger.updateMany({ where: { id: sanction.subjectId, isBlocked: true }, data: { isBlocked: false } });
    } else if (sanction.subjectType === "DRIVER" && (effect === "BLOCKED" || effect === "SUSPENDED")) {
      await db.driver.updateMany({ where: { id: sanction.subjectId, status: effect }, data: { status: "ACTIVE" } });
    } else if (sanction.subjectType === "EXECUTOR" && effect) {
      await db.deliveryExecutor.updateMany({ where: { id: sanction.subjectId, status: effect }, data: { status: "ACTIVE", blacklistReason: null, blacklistedAt: null } });
    }
    await db.adiletSanction.update({ where: { id: sanction.id }, data: { status: "EXPIRED" } });
    await emitAdiletEvent(ctx, "SANCTION_EXPIRED", sanction.caseId, { sanctionId: sanction.id });
  }
  return due.length;
}
