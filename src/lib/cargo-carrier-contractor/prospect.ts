// CargoCarrierProspect is CARGO_CARRIER_CONTRACTOR's exclusive write surface
// (Contragent #4, master spec s.6) — never Driver/ScoutCandidate/
// DeliveryExecutorProspect. Capability fields captured here (vehicle,
// capacity, temperature, route, backhaul) are unverified prospect CLAIMS
// only — they never get promoted automatically into Partner Registry's
// TransportAsset facts, which require normal onboarding/verification. This
// module never becomes Cargo Operations: it finds supply, captures claims,
// obtains interest, and stops the moment a ProspectHandoff is created.
import type { CargoCarrierProspect, CargoCarrierProspectStatus, ProspectLifecycleStage, ProspectVerificationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizePhone, normalizeTelegramUsername } from "@/lib/agents/scout";
import {
  captureQualificationFacts,
  flagPossibleDuplicate,
  transitionProspectLifecycleStage,
  upgradeVerificationStatus,
  type LifecycleTransitionResult,
} from "@/lib/prospecting/lifecycle";
import type { CargoCarrierQualificationFacts, CargoCarrierSightingInput } from "./types";

const CARGO_CARRIER_PROSPECT_TRANSITIONS: Record<CargoCarrierProspectStatus, CargoCarrierProspectStatus[]> = {
  NEW: ["CONTACTED", "DECLINED", "SPAM"],
  CONTACTED: ["QUALIFIED", "DECLINED", "SPAM"],
  QUALIFIED: ["HANDED_OFF", "DECLINED"],
  HANDED_OFF: [],
  DECLINED: [],
  SPAM: [],
};

/** Pure: is this a legal CargoCarrierProspect lifecycle transition? Critical
 * transitions stay deterministic code, same discipline as
 * delivery-executor-contractor/prospect.ts's analogous guard. */
export function canTransitionCargoCarrierProspect(current: CargoCarrierProspectStatus, next: CargoCarrierProspectStatus): boolean {
  return CARGO_CARRIER_PROSPECT_TRANSITIONS[current].includes(next);
}

export async function findExistingCargoCarrierProspect(input: CargoCarrierSightingInput): Promise<CargoCarrierProspect | null> {
  const normalizedPhone = normalizePhone(input.rawPhone);
  if (normalizedPhone) {
    const byPhone = await db.cargoCarrierProspect.findFirst({ where: { normalizedPhone }, orderBy: { createdAt: "desc" } });
    if (byPhone) return byPhone;
  }

  const handle = normalizeTelegramUsername(input.rawTelegramUsername);
  if (handle) {
    const byHandle = await db.cargoCarrierProspect.findFirst({
      where: { rawTelegramUsername: { equals: handle, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
    });
    if (byHandle) return byHandle;
  }

  return null;
}

export async function createCargoCarrierProspect(input: CargoCarrierSightingInput): Promise<CargoCarrierProspect> {
  return db.cargoCarrierProspect.create({
    data: {
      sourceType: input.sourceType,
      sourceGroupId: input.sourceGroupId,
      sourceRef: input.sourceRef,
      sourceText: input.sourceText,
      rawPhone: input.rawPhone,
      rawTelegramUsername: normalizeTelegramUsername(input.rawTelegramUsername),
      rawVehicleText: input.rawVehicleText,
      rawCapacityText: input.rawCapacityText,
      rawRouteText: input.rawRouteText,
      rawTemperatureCapability: input.rawTemperatureCapability ?? null,
      rawBackhaulText: input.rawBackhaulText,
      normalizedPhone: normalizePhone(input.rawPhone),
      status: "NEW",
    },
  });
}

/** Rejects an illegal lifecycle jump rather than forcing it — the caller
 * (orchestrator.ts) always checks canTransitionCargoCarrierProspect first. */
export async function transitionCargoCarrierProspectStatus(prospectId: string, next: CargoCarrierProspectStatus): Promise<CargoCarrierProspect> {
  return db.cargoCarrierProspect.update({
    where: { id: prospectId },
    data: { status: next, ...(next === "HANDED_OFF" ? { handedOffAt: new Date() } : {}) },
  });
}

export async function getCargoCarrierProspect(prospectId: string): Promise<CargoCarrierProspect | null> {
  return db.cargoCarrierProspect.findUnique({ where: { id: prospectId } });
}

// --- Task D: additive ProspectLifecycleStage layer -------------------------
// Everything below drives the new `lifecycleStage` column added alongside
// the pre-existing `status` column above — a parallel, independent
// dimension. Nothing above this line is modified by anything below it (see
// delivery-executor-contractor/prospect.ts's identical layering).

/** CAS transition on lifecycleStage — illegal jumps and not-found prospects
 * throw (ProspectLifecycleTransitionError / ProspectLifecycleNotFoundError
 * from ./lifecycle), a retried identical transition is a deduplicated no-op. */
export async function transitionCargoCarrierLifecycleStage(
  prospectId: string,
  next: ProspectLifecycleStage,
  extraData: Record<string, unknown> = {},
): Promise<LifecycleTransitionResult<CargoCarrierProspect>> {
  return transitionProspectLifecycleStage(db.cargoCarrierProspect, prospectId, next, extraData);
}

/** First-write-wins capture of qualification facts (spec B/D) — never
 * fabricates, never overwrites an already-known fact. */
export async function captureCargoCarrierQualificationFacts(
  prospectId: string,
  facts: CargoCarrierQualificationFacts,
): Promise<CargoCarrierProspect> {
  return captureQualificationFacts(db.cargoCarrierProspect, prospectId, facts as Record<string, string | null | undefined>);
}

/** Verification status only ever moves forward (UNVERIFIED -> SELF_REPORTED
 * -> VERIFIED), never backward. */
export async function upgradeCargoCarrierVerificationStatus(
  prospectId: string,
  next: ProspectVerificationStatus,
): Promise<CargoCarrierProspect> {
  return upgradeVerificationStatus(db.cargoCarrierProspect, prospectId, next);
}

/** Weak-signal duplicate detection (spec E): matches only on an exact,
 * case-insensitive carrierIdentityName — deliberately narrower than a fuzzy
 * name match, and NEVER used to merge records, only to flag them for human
 * review. findExistingCargoCarrierProspect above (phone/Telegram handle)
 * remains the sole *definite*-match path treated as "the same prospect". */
export async function findPossibleDuplicateCargoCarrierProspect(carrierIdentityName: string, excludeId: string): Promise<CargoCarrierProspect | null> {
  return db.cargoCarrierProspect.findFirst({
    where: { id: { not: excludeId }, carrierIdentityName: { equals: carrierIdentityName, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
  });
}

/** Idempotent: a prospect already flagged keeps its original flag rather
 * than being silently repointed at a different candidate later. */
export async function flagCargoCarrierPossibleDuplicate(prospectId: string, duplicateOfId: string): Promise<CargoCarrierProspect> {
  return flagPossibleDuplicate(db.cargoCarrierProspect, prospectId, duplicateOfId);
}

/** Records the count/timestamp of the most recent follow-up attempt on the
 * prospect row itself (the authoritative per-attempt ledger is
 * ProspectFollowUpAttempt — this is only a cheap denormalized read for
 * dispatcher UI/list views). Never regresses a higher recorded count. */
export async function recordCargoCarrierFollowUpCounters(prospectId: string, attemptNumber: number): Promise<CargoCarrierProspect> {
  const current = await db.cargoCarrierProspect.findUniqueOrThrow({ where: { id: prospectId } });
  if (current.followUpCount >= attemptNumber) return current;
  return db.cargoCarrierProspect.update({ where: { id: prospectId }, data: { followUpCount: attemptNumber, lastFollowUpAt: new Date() } });
}
