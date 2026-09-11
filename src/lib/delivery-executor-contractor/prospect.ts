// DeliveryExecutorProspect is DELIVERY_EXECUTOR_CONTRACTOR's exclusive write
// surface (Contragent #3, master spec s.5) — never Driver/ScoutCandidate,
// which stay DRIVER_CONTRACTOR's/SCOUT's exclusive models for passenger-
// network seat supply. A DeliveryExecutorProspect only ever becomes real
// operational supply through an accepted ProspectHandoff to SAPAR/
// DELIVERY_OPERATIONS — this module never writes a Shipment or changes any
// delivery operational status itself.
import type { DeliveryExecutorProspect, DeliveryExecutorProspectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizePhone, normalizeTelegramUsername } from "@/lib/agents/scout";
import type { DeliveryExecutorSightingInput } from "./types";

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
