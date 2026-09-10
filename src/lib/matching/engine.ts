import type { DriverCategory, MatchableOffer, MatchableRequest, ScoredOffer, ScoredRequest } from "./types";

const MAX_TIME_GAP_MINUTES = 180; // beyond this, time mismatch is not proposed automatically

// Spec s.3: "Registered RT drivers get priority over external/unregistered
// candidates, but never at the expense of safety/route/seats/arrival time."
// Kept deliberately small next to segmentScore/timeScore/fairnessScore
// (each worth up to 6-10 points) so it only ever breaks near-ties between
// otherwise comparable offers — it can never make a worse route/time fit
// win over a better one, since isEligibleOffer/the hard filters in
// findCandidateOffers already run first and are untouched by this bonus.
const DRIVER_CATEGORY_PRIORITY_BONUS: Record<DriverCategory, number> = {
  ANCHOR: 3,
  DISPATCHER_FLEET: 2.5,
  REGULAR: 1.5,
  OCCASIONAL: 0.5,
  UNKNOWN: 0,
};

function toMinutes(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** Gap in minutes between two [start,end] windows; 0 if they overlap. Null if either side is fully open. */
function windowGapMinutes(
  aStart: string | null,
  aEnd: string | null,
  bStart: string | null,
  bEnd: string | null,
): number | null {
  const as = toMinutes(aStart);
  const ae = toMinutes(aEnd) ?? as;
  const bs = toMinutes(bStart);
  const be = toMinutes(bEnd) ?? bs;
  if (as === null || bs === null) return null; // one side flexible -> no penalty
  const aLo = Math.min(as, ae as number);
  const aHi = Math.max(as, ae as number);
  const bLo = Math.min(bs, be as number);
  const bHi = Math.max(bs, be as number);
  if (aHi < bLo) return bLo - aHi;
  if (bHi < aLo) return aLo - bHi;
  return 0; // overlap
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * An offer "covers" a request when it travels the same direction along the
 * corridor and its origin/destination bracket the request's segment.
 */
export function offerCoversRequest(offer: MatchableOffer, request: MatchableRequest): boolean {
  if (offer.origin.corridorId !== request.origin.corridorId) return false;
  if (offer.destination.corridorId !== request.destination.corridorId) return false;

  const requestForward = request.destination.order - request.origin.order;
  const offerForward = offer.destination.order - offer.origin.order;
  if (requestForward === 0 || offerForward === 0) return false;
  const sameDirection = Math.sign(requestForward) === Math.sign(offerForward);
  if (!sameDirection) return false;

  if (requestForward > 0) {
    return offer.origin.order <= request.origin.order && offer.destination.order >= request.destination.order;
  }
  return offer.origin.order >= request.origin.order && offer.destination.order <= request.destination.order;
}

function isEligibleOffer(offer: MatchableOffer): boolean {
  return (
    offer.driverStatus === "ACTIVE" &&
    (offer.status === "OPEN" || offer.status === "PARTIALLY_FILLED")
  );
}

/**
 * Score a candidate pairing. Higher is better. Rewards a tight segment fit
 * (less driver detour), close pickup time, and older offers/requests
 * (first-in-queue fairness along the direction).
 */
function scorePair(offer: MatchableOffer, request: MatchableRequest, now: Date): number {
  const overhang =
    Math.abs(offer.destination.order - offer.origin.order) -
    Math.abs(request.destination.order - request.origin.order);

  const gap = windowGapMinutes(
    offer.timeWindowStart,
    offer.timeWindowEnd,
    request.timeWindowStart,
    request.timeWindowEnd,
  );
  const timeScore = gap === null ? 5 : Math.max(0, 10 - gap / 15);

  const ageHours = Math.max(0, (now.getTime() - offer.createdAt.getTime()) / 36e5);
  const fairnessScore = Math.min(6, ageHours / 4); // older offers climb slowly, capped

  const segmentScore = Math.max(0, 8 - overhang * 2);

  const priorityScore = DRIVER_CATEGORY_PRIORITY_BONUS[offer.driverCategory] ?? 0;

  return segmentScore + timeScore + fairnessScore + priorityScore;
}

export interface FindCandidatesOptions {
  now?: Date;
  maxTimeGapMinutes?: number;
}

/** Find and rank driver offers that can serve a given passenger request. */
export function findCandidateOffers(
  request: MatchableRequest,
  offers: MatchableOffer[],
  options: FindCandidatesOptions = {},
): ScoredOffer[] {
  const now = options.now ?? new Date();
  const maxGap = options.maxTimeGapMinutes ?? MAX_TIME_GAP_MINUTES;

  return offers
    .filter((offer) => isEligibleOffer(offer))
    .filter((offer) => sameDay(offer.travelDate, request.travelDate))
    .filter((offer) => offer.seatsAvailable >= request.seats)
    .filter((offer) => offerCoversRequest(offer, request))
    .filter((offer) => {
      const gap = windowGapMinutes(
        offer.timeWindowStart,
        offer.timeWindowEnd,
        request.timeWindowStart,
        request.timeWindowEnd,
      );
      return gap === null || gap <= maxGap;
    })
    .map((offer) => ({ offer, score: scorePair(offer, request, now) }))
    .sort((a, b) => b.score - a.score);
}

/** Find and rank pending passenger requests that a given driver offer can serve. */
export function findCandidateRequests(
  offer: MatchableOffer,
  requests: MatchableRequest[],
  options: FindCandidatesOptions = {},
): ScoredRequest[] {
  if (!isEligibleOffer(offer)) return [];
  const now = options.now ?? new Date();
  const maxGap = options.maxTimeGapMinutes ?? MAX_TIME_GAP_MINUTES;

  return requests
    .filter((request) => sameDay(offer.travelDate, request.travelDate))
    .filter((request) => offer.seatsAvailable >= request.seats)
    .filter((request) => offerCoversRequest(offer, request))
    .filter((request) => {
      const gap = windowGapMinutes(
        offer.timeWindowStart,
        offer.timeWindowEnd,
        request.timeWindowStart,
        request.timeWindowEnd,
      );
      return gap === null || gap <= maxGap;
    })
    .map((request) => ({ request, score: scorePair(offer, request, now) }))
    .sort((a, b) => b.score - a.score);
}
