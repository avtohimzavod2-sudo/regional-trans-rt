// CargoCarrierProspect is CARGO_CARRIER_CONTRACTOR's exclusive write surface
// (Contragent #4, master spec s.6) — never Driver/ScoutCandidate/
// DeliveryExecutorProspect. Capability fields captured here (vehicle,
// capacity, temperature, route, backhaul) are unverified prospect CLAIMS
// only — they never get promoted automatically into Partner Registry's
// TransportAsset facts, which require normal onboarding/verification. This
// module never becomes Cargo Operations: it finds supply, captures claims,
// obtains interest, and stops the moment a ProspectHandoff is created.
import type { CargoCarrierProspect, CargoCarrierProspectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizePhone, normalizeTelegramUsername } from "@/lib/agents/scout";
import type { CargoCarrierSightingInput } from "./types";

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
