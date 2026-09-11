// Timeout sweep for un-accepted Match proposals (README "Что дальше":
// Match.expiresAt was reserved in the schema but nothing ever expired it).
// Intended to be invoked by a periodic job/cron (src/app/api/cron/match-expiry)
// — safe to call repeatedly, since every transition below is guarded by an
// atomic updateMany on the still-current status, so a real driver/passenger
// response that lands in the same instant as a sweep can never be silently
// overwritten by it.
import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { notifyDriverPrivately, notifyPassengerText } from "@/lib/mira/outbound";
import { messages, type Lang } from "@/lib/i18n/messages";
import { proposeMatchesForRequest } from "./orchestrate";
import { getLoopRunByTripRequestId, recordOfferExpired, recordOfferReady } from "@/lib/rt-office/passenger-loop";
import { rootContext } from "@/lib/agents/trace";

const EXPIRY_BATCH_SIZE = 200;

type DueDriverMatch = {
  id: string;
  tripRequestId: string;
  driverOfferId: string;
  driverOffer: { driver: { telegramUserId: string; preferredLang: string | null } };
};

type DuePassengerMatch = {
  id: string;
  tripRequestId: string;
  driverOfferId: string;
  driverOffer: { driver: { telegramUserId: string; preferredLang: string | null } };
  tripRequest: { passenger: { whatsappId: string; preferredLang: string | null } };
};

async function notifyNoCandidatesLeft(tripRequestId: string) {
  const request = await db.tripRequest.findUnique({
    where: { id: tripRequestId },
    include: { passenger: true },
  });
  if (!request) return;
  const lang = (request.passenger.preferredLang ?? "RU") as Lang;
  await notifyPassengerText(request.passenger.whatsappId, messages.noCandidatesYet[lang]);
}

/** A driver never responded within their window: expire, tell them honestly
 * (never "declined" — they simply ran out of time), and try the next
 * candidate driver for the same request. */
async function expireAwaitingDriverMatch(match: DueDriverMatch) {
  const result = await db.match.updateMany({
    where: { id: match.id, status: "AWAITING_DRIVER" },
    data: { status: "EXPIRED" },
  });
  if (result.count === 0) return; // raced with a real driver response — leave it alone

  await logAction({
    actorType: "SYSTEM",
    action: "match.expired_awaiting_driver",
    entityType: "Match",
    entityId: match.id,
    details: { tripRequestId: match.tripRequestId, driverOfferId: match.driverOfferId },
  });

  const driverLang = (match.driverOffer.driver.preferredLang ?? "RU") as Lang;
  await notifyDriverPrivately(match.driverOffer.driver.telegramUserId, messages.driverResponseTimedOut[driverLang]);

  const nextMatch = await proposeMatchesForRequest(match.tripRequestId);
  const loopRun = await getLoopRunByTripRequestId(match.tripRequestId);
  if (loopRun) {
    const ctx = rootContext();
    await recordOfferExpired(ctx, loopRun.id, match.id, !!nextMatch);
    if (nextMatch) await recordOfferReady(ctx, loopRun.id, nextMatch.id, nextMatch.driverOfferId);
  }
  if (!nextMatch) await notifyNoCandidatesLeft(match.tripRequestId);
}

/** A passenger never responded within their window: expire, reset the
 * request to PENDING (same recovery path as an explicit passenger decline),
 * tell the driver honestly it was a timeout rather than a decline, and
 * re-trigger matching for the request. */
async function expireAwaitingPassengerMatch(match: DuePassengerMatch) {
  const result = await db.match.updateMany({
    where: { id: match.id, status: "AWAITING_PASSENGER" },
    data: { status: "EXPIRED" },
  });
  if (result.count === 0) return; // raced with a real passenger response — leave it alone

  await db.tripRequest.update({ where: { id: match.tripRequestId }, data: { status: "PENDING" } });

  await logAction({
    actorType: "SYSTEM",
    action: "match.expired_awaiting_passenger",
    entityType: "Match",
    entityId: match.id,
    details: { tripRequestId: match.tripRequestId, driverOfferId: match.driverOfferId },
  });

  const driverLang = (match.driverOffer.driver.preferredLang ?? "RU") as Lang;
  await notifyDriverPrivately(match.driverOffer.driver.telegramUserId, messages.passengerResponseTimedOutForDriver[driverLang]);

  const passengerLang = (match.tripRequest.passenger.preferredLang ?? "RU") as Lang;
  await notifyPassengerText(match.tripRequest.passenger.whatsappId, messages.passengerResponseTimedOut[passengerLang]);

  const nextMatch = await proposeMatchesForRequest(match.tripRequestId);
  const loopRun = await getLoopRunByTripRequestId(match.tripRequestId);
  if (loopRun) {
    const ctx = rootContext();
    await recordOfferExpired(ctx, loopRun.id, match.id, !!nextMatch);
    if (nextMatch) await recordOfferReady(ctx, loopRun.id, nextMatch.id, nextMatch.driverOfferId);
  }
}

/** Entry point for the cron sweep. Batched (take: 200) rather than a
 * single unbounded scan, mirroring src/lib/adilet/enforcement.ts's
 * expireDueSanctions — the [status, expiresAt] index keeps each query cheap
 * regardless of table size. */
export async function expireStaleMatches(now: Date = new Date()): Promise<{ driverTimeouts: number; passengerTimeouts: number }> {
  const dueDriverMatches = await db.match.findMany({
    where: { status: "AWAITING_DRIVER", expiresAt: { lte: now } },
    include: { driverOffer: { include: { driver: true } } },
    take: EXPIRY_BATCH_SIZE,
  });
  for (const match of dueDriverMatches) await expireAwaitingDriverMatch(match);

  const duePassengerMatches = await db.match.findMany({
    where: { status: "AWAITING_PASSENGER", expiresAt: { lte: now } },
    include: {
      driverOffer: { include: { driver: true } },
      tripRequest: { include: { passenger: true } },
    },
    take: EXPIRY_BATCH_SIZE,
  });
  for (const match of duePassengerMatches) await expireAwaitingPassengerMatch(match);

  return { driverTimeouts: dueDriverMatches.length, passengerTimeouts: duePassengerMatches.length };
}
