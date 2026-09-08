import type { PaymentMode } from "@prisma/client";
import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { findCandidateOffers, findCandidateRequests } from "./engine";
import { buildReturnLegOfferInput } from "./queue";
import { confirmDeclineKeyboard, sendTelegramMessage } from "@/lib/messaging/telegram";
import { sendWhatsAppConfirmButtons, sendWhatsAppText } from "@/lib/messaging/whatsapp";
import { messages, type Lang } from "@/lib/i18n/messages";
import type { MatchableOffer, MatchableRequest } from "./types";
import { rootContext } from "@/lib/agents/trace";
import { assertSafeToReveal } from "@/lib/agents/trust";
import { chargeCommissionForTrip, CommissionAlreadyChargedError } from "@/lib/agents/pay";
import { openSupportCase } from "@/lib/agents/support";

const ACTIVE_MATCH_STATUSES = ["PROPOSED_TO_DRIVER", "AWAITING_DRIVER", "AWAITING_PASSENGER"] as const;

function toMatchableRequest(r: {
  id: string;
  origin: { id: string; corridorId: string; order: number };
  destination: { id: string; corridorId: string; order: number };
  travelDate: Date;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  seats: number;
}): MatchableRequest {
  return r;
}

function toMatchableOffer(o: {
  id: string;
  driverId: string;
  driver: { status: string };
  origin: { id: string; corridorId: string; order: number };
  destination: { id: string; corridorId: string; order: number };
  travelDate: Date;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  seatsAvailable: number;
  status: string;
  createdAt: Date;
}): MatchableOffer {
  return {
    id: o.id,
    driverId: o.driverId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    driverStatus: o.driver.status as any,
    origin: o.origin,
    destination: o.destination,
    travelDate: o.travelDate,
    timeWindowStart: o.timeWindowStart,
    timeWindowEnd: o.timeWindowEnd,
    seatsAvailable: o.seatsAvailable,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    status: o.status as any,
    createdAt: o.createdAt,
  };
}

/** Exported for reuse by RT OFFICE's read-only demand/supply resolution
 * (spec s.5/MATCHING correction): RT OFFICE MUST reuse this exact
 * exclusion-aware logic rather than building a weaker parallel advisory
 * candidate query that could describe an offer to a passenger the driver
 * has already declined for them. */
export async function excludedOfferIdsForRequest(requestId: string): Promise<string[]> {
  const declined = await db.match.findMany({
    where: { tripRequestId: requestId, status: { in: ["DECLINED_BY_DRIVER", "DECLINED_BY_PASSENGER", "EXPIRED", "CANCELLED"] } },
    select: { driverOfferId: true },
  });
  return declined.map((m) => m.driverOfferId);
}

async function excludedRequestIdsForOffer(offerId: string): Promise<string[]> {
  const declined = await db.match.findMany({
    where: { driverOfferId: offerId, status: { in: ["DECLINED_BY_DRIVER", "DECLINED_BY_PASSENGER", "EXPIRED", "CANCELLED"] } },
    select: { tripRequestId: true },
  });
  return declined.map((m) => m.tripRequestId);
}

async function hasActiveMatch(where: { tripRequestId?: string; driverOfferId?: string }): Promise<boolean> {
  const count = await db.match.count({ where: { ...where, status: { in: [...ACTIVE_MATCH_STATUSES] } } });
  return count > 0;
}

async function proposeToDriver(requestId: string, offerId: string) {
  const match = await db.match.create({
    data: {
      tripRequestId: requestId,
      driverOfferId: offerId,
      status: "AWAITING_DRIVER",
      proposedToDriverAt: new Date(),
    },
  });

  const [request, offer] = await Promise.all([
    db.tripRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { origin: true, destination: true, passenger: true },
    }),
    db.driverOffer.findUniqueOrThrow({ where: { id: offerId }, include: { driver: true } }),
  ]);

  await db.tripRequest.update({ where: { id: requestId }, data: { status: "MATCHING" } });

  const lang = (offer.driver.preferredLang ?? "RU") as Lang;
  const text = messages.proposalToDriver[lang](
    { ru: request.origin.nameRu, ky: request.origin.nameKy, en: request.origin.nameEn },
    { ru: request.destination.nameRu, ky: request.destination.nameKy, en: request.destination.nameEn },
    lang,
    request.travelDate.toISOString().slice(0, 10),
    request.seats,
  );
  await sendTelegramMessage(offer.driver.telegramUserId, text, confirmDeclineKeyboard(match.id, "driver"));

  await logAction({
    actorType: "AGENT",
    action: "match.proposed_to_driver",
    entityType: "Match",
    entityId: match.id,
    details: { requestId, offerId },
  });

  return match;
}

export async function proposeMatchesForRequest(requestId: string) {
  if (await hasActiveMatch({ tripRequestId: requestId })) return null;

  const request = await db.tripRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { origin: true, destination: true },
  });
  if (request.status !== "PENDING" && request.status !== "MATCHING") return null;

  const excluded = await excludedOfferIdsForRequest(requestId);
  const offers = await db.driverOffer.findMany({
    where: {
      status: { in: ["OPEN", "PARTIALLY_FILLED"] },
      travelDate: request.travelDate,
      id: { notIn: excluded },
    },
    include: { origin: true, destination: true, driver: true },
  });

  const candidates = findCandidateOffers(toMatchableRequest(request), offers.map(toMatchableOffer));
  if (candidates.length === 0) return null;

  return proposeToDriver(requestId, candidates[0].offer.id);
}

export async function proposeMatchesForOffer(offerId: string) {
  if (await hasActiveMatch({ driverOfferId: offerId })) return null;

  const offer = await db.driverOffer.findUniqueOrThrow({
    where: { id: offerId },
    include: { origin: true, destination: true, driver: true },
  });
  if (offer.status !== "OPEN" && offer.status !== "PARTIALLY_FILLED") return null;
  if (offer.driver.status !== "ACTIVE") return null;

  const excluded = await excludedRequestIdsForOffer(offerId);
  const requests = await db.tripRequest.findMany({
    where: {
      status: { in: ["PENDING", "MATCHING"] },
      travelDate: offer.travelDate,
      id: { notIn: excluded },
    },
    include: { origin: true, destination: true },
  });

  const candidates = findCandidateRequests(toMatchableOffer(offer), requests.map(toMatchableRequest));
  if (candidates.length === 0) return null;

  return proposeToDriver(candidates[0].request.id, offerId);
}

export async function handleDriverResponse(matchId: string, accepted: boolean) {
  const match = await db.match.findUniqueOrThrow({
    where: { id: matchId },
    include: {
      tripRequest: { include: { origin: true, destination: true, passenger: true } },
      driverOffer: { include: { driver: true } },
    },
  });
  if (match.status !== "AWAITING_DRIVER") return match;

  if (!accepted) {
    const updated = await db.match.update({
      where: { id: matchId },
      data: { status: "DECLINED_BY_DRIVER", driverRespondedAt: new Date() },
    });
    await logAction({ actorType: "AGENT", action: "match.declined_by_driver", entityType: "Match", entityId: matchId });
    await proposeMatchesForRequest(match.tripRequestId);
    return updated;
  }

  const updated = await db.match.update({
    where: { id: matchId },
    data: { status: "AWAITING_PASSENGER", driverRespondedAt: new Date(), proposedToPassengerAt: new Date() },
  });

  const lang = (match.tripRequest.passenger.preferredLang ?? "RU") as Lang;
  const text = messages.proposalToPassenger[lang](
    { ru: match.tripRequest.origin.nameRu, ky: match.tripRequest.origin.nameKy, en: match.tripRequest.origin.nameEn },
    { ru: match.tripRequest.destination.nameRu, ky: match.tripRequest.destination.nameKy, en: match.tripRequest.destination.nameEn },
    lang,
    match.tripRequest.travelDate.toISOString().slice(0, 10),
  );
  await sendWhatsAppConfirmButtons(match.tripRequest.passenger.whatsappId, text, matchId);

  await logAction({ actorType: "AGENT", action: "match.confirmed_by_driver", entityType: "Match", entityId: matchId });
  return updated;
}

export async function handlePassengerResponse(matchId: string, accepted: boolean) {
  const match = await db.match.findUniqueOrThrow({
    where: { id: matchId },
    include: {
      tripRequest: { include: { passenger: true } },
      driverOffer: { include: { driver: true } },
    },
  });
  if (match.status !== "AWAITING_PASSENGER") return match;

  if (!accepted) {
    // Atomic, condition-guarded transition: if a duplicate/concurrent delivery
    // already moved this match off AWAITING_PASSENGER, count is 0 and we
    // return the current row as a no-op instead of re-running side effects
    // (duplicate driver notification, duplicate re-matching).
    const declineResult = await db.match.updateMany({
      where: { id: matchId, status: "AWAITING_PASSENGER" },
      data: { status: "DECLINED_BY_PASSENGER", passengerRespondedAt: new Date() },
    });
    if (declineResult.count === 0) return db.match.findUniqueOrThrow({ where: { id: matchId } });

    await db.tripRequest.update({ where: { id: match.tripRequestId }, data: { status: "PENDING" } });
    await logAction({ actorType: "AGENT", action: "match.declined_by_passenger", entityType: "Match", entityId: matchId });
    const driverLang = (match.driverOffer.driver.preferredLang ?? "RU") as Lang;
    await sendTelegramMessage(match.driverOffer.driver.telegramUserId, messages.declinedTryNext[driverLang]);
    await proposeMatchesForRequest(match.tripRequestId);
    return db.match.findUniqueOrThrow({ where: { id: matchId } });
  }

  // Same atomic-guard pattern for confirmation: only one concurrent/duplicate
  // call can win this updateMany (status="AWAITING_PASSENGER" is consumed by
  // whichever call gets there first), so everything below — seat decrement,
  // Trip creation, contact reveal — can only ever run once per match.
  const now = new Date();
  const confirmResult = await db.match.updateMany({
    where: { id: matchId, status: "AWAITING_PASSENGER" },
    data: { status: "CONFIRMED", passengerRespondedAt: now, confirmedAt: now },
  });
  if (confirmResult.count === 0) return db.match.findUniqueOrThrow({ where: { id: matchId } });
  await db.tripRequest.update({ where: { id: match.tripRequestId }, data: { status: "CONFIRMED" } });

  const request = await db.tripRequest.findUniqueOrThrow({ where: { id: match.tripRequestId }, include: { passenger: true } });

  // Atomic conditional decrement: the where-clause guard (seatsAvailable >=
  // request.seats) makes this a compare-and-swap, so two concurrent
  // confirmations against the same offer can never both succeed and
  // overdraw seatsAvailable below zero (the prior Math.max(0, ...) read-
  // modify-write was not safe against that race).
  const seatUpdateResult = await db.driverOffer.updateMany({
    where: { id: match.driverOfferId, seatsAvailable: { gte: request.seats } },
    data: { seatsAvailable: { decrement: request.seats } },
  });
  if (seatUpdateResult.count === 0) {
    // Match is already CONFIRMED above, so we cannot silently drop this —
    // seats were genuinely exhausted by another confirmation between
    // proposal and this response. Never invent availability: open a support
    // case for a human to resolve instead.
    const ctx = rootContext();
    await openSupportCase(ctx, {
      caseType: "OTHER",
      openedByType: "AGENT",
      openedById: "MATCHING",
      description: `Seat decrement failed on passenger confirmation: offer ${match.driverOfferId} no longer had ${request.seats} seat(s) available (matchId ${matchId}).`,
    });
    await logAction({
      actorType: "AGENT",
      action: "match.seat_decrement_failed",
      entityType: "Match",
      entityId: matchId,
      details: { offerId: match.driverOfferId, requestedSeats: request.seats },
    });
    return db.match.findUniqueOrThrow({ where: { id: matchId } });
  }

  const updatedOffer = await db.driverOffer.findUniqueOrThrow({ where: { id: match.driverOfferId } });
  await db.driverOffer.update({
    where: { id: updatedOffer.id },
    data: { status: updatedOffer.seatsAvailable === 0 ? "FULL" : "PARTIALLY_FILLED" },
  });

  const trip = await db.trip.create({
    data: {
      matchId,
      driverId: match.driverOffer.driverId,
      passengerId: request.passengerId,
      driverOfferId: match.driverOfferId,
      status: "SCHEDULED",
    },
  });

  await revealContacts(matchId, trip.id);
  await logAction({ actorType: "AGENT", action: "match.confirmed", entityType: "Match", entityId: matchId, details: { tripId: trip.id } });
  return db.match.findUniqueOrThrow({ where: { id: matchId } });
}

async function revealContacts(matchId: string, tripId: string) {
  const ctx = rootContext();
  const safety = await assertSafeToReveal(ctx, matchId);
  if (!safety.allowed) {
    await openSupportCase(ctx, {
      tripId,
      caseType: "OTHER",
      openedByType: "AGENT",
      openedById: "TRUST",
      description: `Contact reveal blocked: ${safety.reason}`,
    });
    await logAction({
      actorType: "AGENT",
      action: "contact.reveal_blocked",
      entityType: "Trip",
      entityId: tripId,
      details: { matchId, reason: safety.reason },
    });
    return;
  }

  const match = await db.match.findUniqueOrThrow({
    where: { id: matchId },
    include: {
      tripRequest: { include: { passenger: true } },
      driverOffer: { include: { driver: true } },
    },
  });

  const driver = match.driverOffer.driver;
  const passenger = match.tripRequest.passenger;

  const driverLang = (driver.preferredLang ?? "RU") as Lang;
  const passengerLang = (passenger.preferredLang ?? "RU") as Lang;

  await sendTelegramMessage(
    driver.telegramUserId,
    messages.contactRevealedToDriver[driverLang](
      passenger.name ?? "-",
      passenger.phone ?? passenger.whatsappId,
      match.tripRequest.pickupPoint,
    ),
  );
  await sendWhatsAppText(
    passenger.whatsappId,
    messages.contactRevealedToPassenger[passengerLang](
      driver.name ?? "-",
      driver.phone ?? driver.telegramUserId,
      [driver.carModel, driver.carPlate].filter(Boolean).join(" "),
    ),
  );

  await db.match.update({ where: { id: matchId }, data: { contactRevealedAt: new Date() } });
  await logAction({ actorType: "AGENT", action: "contact.revealed", entityType: "Trip", entityId: tripId, details: { matchId } });
}

// Default payment mode when the dispatcher/driver flow hasn't specified one:
// the driver collects the fare in person and RT simply debits the driver's
// RT Balance for its 100-som-per-seat commission. This is the simplest,
// safest default — no cash ever passes through RT — and can be overridden
// per-trip by passing an explicit `payment` param once a THROUGH_RT flow exists.
const DEFAULT_PAYMENT_MODE: PaymentMode = "DRIVER_DIRECT_RT_BALANCE";

export async function completeTrip(tripId: string, payment?: { mode?: PaymentMode; totalFareSom?: number }) {
  const trip = await db.trip.findUniqueOrThrow({
    where: { id: tripId },
    include: { driverOffer: { include: { origin: true, destination: true } } },
  });

  await db.trip.update({ where: { id: tripId }, data: { status: "COMPLETED", completedAt: new Date() } });

  const ctx = rootContext();
  try {
    await chargeCommissionForTrip(ctx, tripId, {
      mode: payment?.mode ?? DEFAULT_PAYMENT_MODE,
      totalFareSom: payment?.totalFareSom,
    });
  } catch (err) {
    if (!(err instanceof CommissionAlreadyChargedError)) throw err;
  }

  const returnOffer = await db.driverOffer.create({
    data: buildReturnLegOfferInput({
      driverId: trip.driverId,
      originStopId: trip.driverOffer.destinationStopId,
      destinationStopId: trip.driverOffer.originStopId,
      travelDate: trip.driverOffer.travelDate,
      seatsTotal: trip.driverOffer.seatsTotal,
      generatedFromTripId: trip.id,
    }),
  });

  await logAction({
    actorType: "SYSTEM",
    action: "trip.completed",
    entityType: "Trip",
    entityId: tripId,
    details: { returnLegOfferId: returnOffer.id },
  });

  await proposeMatchesForOffer(returnOffer.id);
  return returnOffer;
}
