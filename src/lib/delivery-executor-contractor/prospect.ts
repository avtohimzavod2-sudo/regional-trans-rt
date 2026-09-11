// DeliveryExecutorProspect is DELIVERY_EXECUTOR_CONTRACTOR's exclusive write
// surface (Contragent #3, master spec s.5) — never Driver/ScoutCandidate,
// which stay DRIVER_CONTRACTOR's/SCOUT's exclusive models for passenger-
// network seat supply. A DeliveryExecutorProspect only ever becomes real
// operational supply through an accepted ProspectHandoff to SAPAR/
// DELIVERY_OPERATIONS — this module never writes a Shipment or changes any
// delivery operational status itself.
import type { DeliveryExecutorProspect, DeliveryExecutorProspectStatus, ProspectLifecycleStage, ProspectVerificationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizePhone, normalizeTelegramUsername } from "@/lib/agents/scout";
import {
  captureQualificationFacts,
  flagPossibleDuplicate,
  transitionProspectLifecycleStage,
  upgradeVerificationStatus,
  type LifecycleTransitionResult,
} from "@/lib/prospecting/lifecycle";
import type { DeliveryExecutorQualificationFacts, DeliveryExecutorSightingInput } from "./types";

const DELIVERY_EXECUTOR_PROSPECT_TRANSITIONS: Record<DeliveryExecutorProspectStatus, DeliveryExecutorProspectStatus[]> = {
  NEW: ["CONTACTED", "DECLINED", "SPAM"],
  CONTACTED: ["QUALIFIED", "DECLINED", "SPAM"],
  QUALIFIED: ["HANDED_OFF", "DECLINED"],
  HANDED_OFF: [],
  DECLINED: [],
  SPAM: [],
};

/** Pure: is this a legal DeliveryExecutorProspect lifecycle transition?
 * Critical transitions stay deterministic code, same discipline as
 * delivery-contractor/prospect.ts's canTransitionBusinessProspect. */
export function canTransitionDeliveryExecutorProspect(current: DeliveryExecutorProspectStatus, next: DeliveryExecutorProspectStatus): boolean {
  return DELIVERY_EXECUTOR_PROSPECT_TRANSITIONS[current].includes(next);
}

export async function findExistingDeliveryExecutorProspect(input: DeliveryExecutorSightingInput): Promise<DeliveryExecutorProspect | null> {
  const normalizedPhone = normalizePhone(input.rawPhone);
  if (normalizedPhone) {
    const byPhone = await db.deliveryExecutorProspect.findFirst({ where: { normalizedPhone }, orderBy: { createdAt: "desc" } });
    if (byPhone) return byPhone;
  }

  const handle = normalizeTelegramUsername(input.rawTelegramUsername);
  if (handle) {
    const byHandle = await db.deliveryExecutorProspect.findFirst({
      where: { rawTelegramUsername: { equals: handle, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
    });
    if (byHandle) return byHandle;
  }

  return null;
}

export async function createDeliveryExecutorProspect(input: DeliveryExecutorSightingInput): Promise<DeliveryExecutorProspect> {
  return db.deliveryExecutorProspect.create({
    data: {
      sourceType: input.sourceType,
      sourceGroupId: input.sourceGroupId,
      sourceRef: input.sourceRef,
      sourceText: input.sourceText,
      rawPhone: input.rawPhone,
      rawTelegramUsername: normalizeTelegramUsername(input.rawTelegramUsername),
      rawVehicleText: input.rawVehicleText,
      rawZonesText: input.rawZonesText,
      normalizedPhone: normalizePhone(input.rawPhone),
      status: "NEW",
    },
  });
}

/** Rejects an illegal lifecycle jump rather than forcing it — the caller
 * (orchestrator.ts) always checks canTransitionDeliveryExecutorProspect first. */
export async function transitionDeliveryExecutorProspectStatus(prospectId: string, next: DeliveryExecutorProspectStatus): Promise<DeliveryExecutorProspect> {
  return db.deliveryExecutorProspect.update({
    where: { id: prospectId },
    data: { status: next, ...(next === "HANDED_OFF" ? { handedOffAt: new Date() } : {}) },
  });
}

export async function getDeliveryExecutorProspect(prospectId: string): Promise<DeliveryExecutorProspect | null> {
  return db.deliveryExecutorProspect.findUnique({ where: { id: prospectId } });
}

// --- Task D: additive ProspectLifecycleStage layer -------------------------
// Everything below drives the new `lifecycleStage` column added alongside
// the pre-existing `status` column above. It is a parallel, independent
// dimension — nothing above this line is modified by, or needs to know
// about, anything below it (docs/architecture/prospecting.md's additive-only
// rule, the same relationship Task C's PassengerLoopRun has with
// Match/TripRequest).

/** CAS transition on lifecycleStage — illegal jumps and not-found prospects
 * throw (ProspectLifecycleTransitionError / ProspectLifecycleNotFoundError
 * from ./lifecycle), a retried identical transition is a deduplicated no-op. */
export async function transitionDeliveryExecutorLifecycleStage(
  prospectId: string,
  next: ProspectLifecycleStage,
  extraData: Record<string, unknown> = {},
): Promise<LifecycleTransitionResult<DeliveryExecutorProspect>> {
  return transitionProspectLifecycleStage(db.deliveryExecutorProspect, prospectId, next, extraData);
}

/** First-write-wins capture of qualification facts (spec A/D) — never
 * fabricates, never overwrites an already-known fact. */
export async function captureDeliveryExecutorQualificationFacts(
  prospectId: string,
  facts: DeliveryExecutorQualificationFacts,
): Promise<DeliveryExecutorProspect> {
  return captureQualificationFacts(db.deliveryExecutorProspect, prospectId, facts as Record<string, string | null | undefined>);
}

/** Verification status only ever moves forward (UNVERIFIED -> SELF_REPORTED
 * -> VERIFIED), never backward. */
export async function upgradeDeliveryExecutorVerificationStatus(
  prospectId: string,
  next: ProspectVerificationStatus,
): Promise<DeliveryExecutorProspect> {
  return upgradeVerificationStatus(db.deliveryExecutorProspect, prospectId, next);
}

/** Weak-signal duplicate detection (spec E): matches only on an exact,
 * case-insensitive personOrCompanyName — deliberately narrower than a fuzzy
 * name match, and NEVER used to merge records, only to flag them for human
 * review. findExistingDeliveryExecutorProspect above (phone/Telegram handle)
 * remains the sole *definite*-match path treated as "the same prospect". */
export async function findPossibleDuplicateDeliveryExecutorProspect(personOrCompanyName: string, excludeId: string): Promise<DeliveryExecutorProspect | null> {
  return db.deliveryExecutorProspect.findFirst({
    where: { id: { not: excludeId }, personOrCompanyName: { equals: personOrCompanyName, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
  });
}

/** Idempotent: a prospect already flagged keeps its original flag rather
 * than being silently repointed at a different candidate later. */
export async function flagDeliveryExecutorPossibleDuplicate(prospectId: string, duplicateOfId: string): Promise<DeliveryExecutorProspect> {
  return flagPossibleDuplicate(db.deliveryExecutorProspect, prospectId, duplicateOfId);
}

/** Records the count/timestamp of the most recent follow-up attempt on the
 * prospect row itself (the authoritative per-attempt ledger is
 * ProspectFollowUpAttempt — this is only a cheap denormalized read for
 * dispatcher UI/list views). Never regresses a higher recorded count. */
export async function recordDeliveryExecutorFollowUpCounters(prospectId: string, attemptNumber: number): Promise<DeliveryExecutorProspect> {
  const current = await db.deliveryExecutorProspect.findUniqueOrThrow({ where: { id: prospectId } });
  if (current.followUpCount >= attemptNumber) return current;
  return db.deliveryExecutorProspect.update({ where: { id: prospectId }, data: { followUpCount: attemptNumber, lastFollowUpAt: new Date() } });
}
