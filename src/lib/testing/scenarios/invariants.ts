// The promises RT makes about the whole database, not about one order.
//
// A scenario checks its own outcome. These check the things no single scenario
// can see: that three hundred orders running in a disordered mix did not
// produce one passenger with two confirmed drivers, one match with two trips,
// or a car carrying more people than it has seats. Those are exactly the
// failures a batch exists to find, and exactly the ones a per-scenario
// assertion is blind to.
//
// Every check reads the whole table. That is affordable because this only ever
// runs against the synthetic test contour, and it is the point: a violation
// caused by scenario 12 and only visible after scenario 300 still gets caught.
import { db } from "@/lib/db";
import { isSyntheticIdentifier } from "../synthetic";

export interface InvariantViolation {
  name: string;
  detail: string;
}

/** Groups ids by key and reports every key holding more than one. */
function duplicates<T>(rows: readonly T[], keyOf: (row: T) => string, idOf: (row: T) => string): Map<string, string[]> {
  const byKey = new Map<string, string[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(idOf(row));
    else byKey.set(key, [idOf(row)]);
  }
  for (const [key, ids] of byKey) if (ids.length < 2) byKey.delete(key);
  return byKey;
}

/** One passenger demand can end with one driver committed to it. Two confirmed
 * matches for the same request means RT sold the same seat twice. */
async function onlyOneConfirmedMatchPerRequest(): Promise<InvariantViolation[]> {
  const confirmed = await db.match.findMany({
    where: { status: "CONFIRMED" },
    select: { id: true, tripRequestId: true },
  });
  return [...duplicates(confirmed, (m) => m.tripRequestId, (m) => m.id)].map(([tripRequestId, ids]) => ({
    name: "one-confirmed-match-per-request",
    detail: `TripRequest ${tripRequestId} has ${ids.length} confirmed matches: ${ids.join(", ")}`,
  }));
}

/** A request can be re-matched after a decline, so several trips over its
 * lifetime is legal — several *live* ones is not. */
async function onlyOneLiveTripPerRequest(): Promise<InvariantViolation[]> {
  const live = await db.trip.findMany({
    where: { status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
    select: { id: true, match: { select: { tripRequestId: true } } },
  });
  return [...duplicates(live, (t) => t.match.tripRequestId, (t) => t.id)].map(([tripRequestId, ids]) => ({
    name: "one-live-trip-per-request",
    detail: `TripRequest ${tripRequestId} has ${ids.length} live trips: ${ids.join(", ")}`,
  }));
}

/** Seats are the physical constraint the whole business rests on. A negative
 * count means a seat was sold that did not exist; above capacity means one was
 * released twice. */
async function seatsStayWithinTheCar(): Promise<InvariantViolation[]> {
  const offers = await db.driverOffer.findMany({ select: { id: true, seatsAvailable: true, seatsTotal: true } });
  return offers
    .filter((o) => o.seatsAvailable < 0 || o.seatsAvailable > o.seatsTotal)
    .map((o) => ({
      name: "seats-within-capacity",
      detail: `DriverOffer ${o.id} has ${o.seatsAvailable} of ${o.seatsTotal} seats available`,
    }));
}

/** No trip exists without both sides having agreed to it. A cancelled trip
 * takes its match to CANCELLED with it; anything else means a trip was
 * conjured out of an unanswered or refused proposal. */
async function everyTripRestsOnAnAgreement(): Promise<InvariantViolation[]> {
  const trips = await db.trip.findMany({
    select: { id: true, status: true, match: { select: { status: true } } },
  });
  return trips
    .filter((t) => t.match.status !== "CONFIRMED" && t.match.status !== "CANCELLED")
    .map((t) => ({
      name: "trip-rests-on-agreement",
      detail: `Trip ${t.id} (${t.status}) sits on a match that is ${t.match.status}`,
    }));
}

/** Money is charged once or not at all. Two commission charges against one
 * trip is the failure that costs a driver real som. */
async function commissionChargedAtMostOnce(): Promise<InvariantViolation[]> {
  const entries = await db.ledgerEntry.findMany({
    where: { type: "COMMISSION_CHARGE", tripId: { not: null } },
    select: { id: true, tripId: true },
  });
  return [...duplicates(entries, (e) => e.tripId!, (e) => e.id)].map(([tripId, ids]) => ({
    name: "commission-charged-once",
    detail: `Trip ${tripId} was charged commission ${ids.length} times: ${ids.join(", ")}`,
  }));
}

/** A trip is finished one way or the other, never both. */
async function noTripBothRanAndDidNot(): Promise<InvariantViolation[]> {
  const trips = await db.trip.findMany({
    where: { AND: [{ completedAt: { not: null } }, { cancelledAt: { not: null } }] },
    select: { id: true, status: true },
  });
  return trips.map((t) => ({
    name: "trip-ends-once",
    detail: `Trip ${t.id} (${t.status}) is both completed and cancelled`,
  }));
}

/** The contour check, restated over stored rows rather than over outgoing
 * messages: if a real passenger or driver is in this database at all, the
 * isolation the whole test rig depends on has already failed. */
async function everyPartyIsSynthetic(): Promise<InvariantViolation[]> {
  const [passengers, drivers] = await Promise.all([
    db.passenger.findMany({ select: { id: true, whatsappId: true } }),
    db.driver.findMany({ select: { id: true, telegramUserId: true } }),
  ]);
  const violations: InvariantViolation[] = [];
  for (const p of passengers) {
    if (!isSyntheticIdentifier(p.whatsappId)) {
      violations.push({ name: "contour-is-synthetic", detail: `Passenger ${p.id} is not a synthetic identity` });
    }
  }
  for (const d of drivers) {
    if (!isSyntheticIdentifier(d.telegramUserId)) {
      violations.push({ name: "contour-is-synthetic", detail: `Driver ${d.id} is not a synthetic identity` });
    }
  }
  return violations;
}

const CHECKS = [
  onlyOneConfirmedMatchPerRequest,
  onlyOneLiveTripPerRequest,
  seatsStayWithinTheCar,
  everyTripRestsOnAnAgreement,
  commissionChargedAtMostOnce,
  noTripBothRanAndDidNot,
  everyPartyIsSynthetic,
] as const;

/** Runs every invariant and returns everything that is wrong, not the first
 * thing. A batch report that names one violation when there are twelve sends
 * the reader round the loop twelve times. */
export async function checkGlobalInvariants(): Promise<InvariantViolation[]> {
  const results = await Promise.all(CHECKS.map((check) => check()));
  return results.flat();
}
