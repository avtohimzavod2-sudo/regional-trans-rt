// PassengerProspect is PASSENGER_CONTRACTOR's exclusive write surface —
// a genuinely new identity (no existing model covers "someone who might
// become a passenger but hasn't yet"), never a second Passenger/TripRequest
// source of truth. All writes to this model go through this file.
import type { PassengerProspect } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizePhone, normalizeTelegramUsername } from "@/lib/agents/scout";
import type { PassengerSightingInput } from "./types";

/** Finds an existing prospect by whichever real contact signal the sighting
 * carries — never creates a second row for someone we already know about.
 * No idempotencyKey exists on this model (unlike AcquisitionOutreachEvent),
 * so dedup is a real signal lookup, same spirit as SCOUT's fingerprint match. */
export async function findExistingProspect(input: PassengerSightingInput): Promise<PassengerProspect | null> {
  const normalizedPhone = normalizePhone(input.rawPhone);
  if (normalizedPhone) {
    const byPhone = await db.passengerProspect.findFirst({ where: { normalizedPhone }, orderBy: { createdAt: "desc" } });
    if (byPhone) return byPhone;
  }

  const telegramUsername = normalizeTelegramUsername(input.rawTelegramUsername);
  if (telegramUsername) {
    const byHandle = await db.passengerProspect.findFirst({
      where: { rawTelegramUsername: { equals: telegramUsername, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
    });
    if (byHandle) return byHandle;
  }

  return null;
}

export async function createPassengerProspect(input: PassengerSightingInput): Promise<PassengerProspect> {
  return db.passengerProspect.create({
    data: {
      sourceType: input.sourceType,
      sourceGroupId: input.sourceGroupId,
      sourceText: input.sourceText,
      rawPhone: input.rawPhone,
      rawTelegramUsername: input.rawTelegramUsername,
      rawRouteText: input.rawRouteText,
      rawOriginStopId: input.rawOriginStopId,
      rawDestinationStopId: input.rawDestinationStopId,
      rawTravelDate: input.rawTravelDate,
      normalizedPhone: normalizePhone(input.rawPhone),
      status: "NEW",
    },
  });
}

export async function markProspectContacted(prospectId: string): Promise<PassengerProspect> {
  return db.passengerProspect.update({ where: { id: prospectId }, data: { status: "CONTACTED" } });
}

/** Only ever called once a genuine downstream signal exists (e.g. a real
 * TripRequest belonging to a matching Passenger identity) — never a guess. */
export async function markProspectConverted(prospectId: string, tripRequestId: string): Promise<PassengerProspect> {
  return db.passengerProspect.update({
    where: { id: prospectId },
    data: { status: "CONVERTED", convertedTripRequestId: tripRequestId },
  });
}

export async function markProspectDeclined(prospectId: string): Promise<PassengerProspect> {
  return db.passengerProspect.update({ where: { id: prospectId }, data: { status: "DECLINED" } });
}
