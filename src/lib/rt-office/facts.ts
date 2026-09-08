// RT OFFICE's read-only fact resolution. Reuses RT Core's EXISTING matching
// engine (src/lib/matching/engine.ts's findCandidateOffers) for candidate
// scoring instead of building a second matching engine (spec s.5) — this
// module only adds the verified-fact conversion layer on top (spec s.4:
// "RT OFFICE converts verified/current operational facts for Mira").
//
// MATCHING correction (Founder-directed, exceptional audited correction):
// this read path now reuses matching/orchestrate.ts's exact
// excludedOfferIdsForRequest exclusion logic, the same one
// proposeMatchesForRequest uses, so RT OFFICE can never describe an offer
// to a passenger that the driver has already declined for their request —
// no weaker parallel advisory matching.
import { db } from "@/lib/db";
import { findCandidateOffers } from "@/lib/matching/engine";
import { excludedOfferIdsForRequest } from "@/lib/matching/orchestrate";
import type { MatchableOffer, MatchableRequest } from "@/lib/matching/types";
import { latestOpenBreakdownForDriver, latestVerifiedEtaForOffer } from "@/lib/crm-auto/bridge";
import { deriveOperationalState, type OperationalStateInput } from "./operational-state";
import type { DemandSupplyResolution, SupplyFact } from "./types";

const MAX_CANDIDATES_RETURNED = 3;

type OfferWithRelations = Awaited<ReturnType<typeof findCandidateOfferRecords>>[number];

async function findCandidateOfferRecords(travelDate: Date, excludedOfferIds: string[]) {
  return db.driverOffer.findMany({
    where: { status: { in: ["OPEN", "PARTIALLY_FILLED"] }, travelDate, id: { notIn: excludedOfferIds } },
    include: { origin: true, destination: true, driver: true },
  });
}

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

function toMatchableOffer(o: OfferWithRelations): MatchableOffer {
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

async function buildSupplyFact(offer: OfferWithRelations): Promise<SupplyFact> {
  const [openBreakdown, eta, activeTrip] = await Promise.all([
    latestOpenBreakdownForDriver(offer.driverId),
    latestVerifiedEtaForOffer(offer.driverId, offer.id),
    db.trip.findFirst({
      where: { driverOfferId: offer.id, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const operationalState = deriveOperationalState({
    driverStatus: offer.driver.status as OperationalStateInput["driverStatus"],
    hasOpenBreakdown: openBreakdown.hasOpenBreakdown,
    activeOfferStatus: offer.status as OperationalStateInput["activeOfferStatus"],
    activeTripStatus: (activeTrip?.status ?? null) as OperationalStateInput["activeTripStatus"],
    delayedSignal: eta.delayed,
    arrivedSignal: eta.arrived,
  });

  return {
    offerId: offer.id,
    driverId: offer.driverId,
    seatsAvailable: offer.seatsAvailable,
    departureWindow: {
      travelDate: offer.travelDate.toISOString().slice(0, 10),
      start: offer.timeWindowStart,
      end: offer.timeWindowEnd,
    },
    vehicle: { driverId: offer.driverId, carModel: offer.driver.carModel, carPlate: offer.driver.carPlate },
    operationalState,
    etaMinutes: eta.etaMinutes,
    freshness: eta.freshness,
    confidence: "VERIFIED",
  };
}

/** RT OFFICE's core read entrypoint: compares one unresolved passenger
 * TripRequest against RT OFFICE's verified supply awareness. Never mutates
 * anything (spec s.4) — Mira alone decides what to say from the result. */
export async function resolveDemandAgainstSupply(tripRequestId: string): Promise<DemandSupplyResolution> {
  const request = await db.tripRequest.findUniqueOrThrow({
    where: { id: tripRequestId },
    include: { origin: true, destination: true },
  });

  if (request.status !== "PENDING" && request.status !== "MATCHING") {
    return { tripRequestId, hasCandidateSupply: false, candidates: [] };
  }

  const excludedOfferIds = await excludedOfferIdsForRequest(tripRequestId);
  const offers = await findCandidateOfferRecords(request.travelDate, excludedOfferIds);
  const offerById = new Map(offers.map((o) => [o.id, o]));

  const scored = findCandidateOffers(toMatchableRequest(request), offers.map(toMatchableOffer));
  const top = scored
    .slice(0, MAX_CANDIDATES_RETURNED)
    .map((c) => offerById.get(c.offer.id))
    .filter((o): o is OfferWithRelations => !!o);

  const candidates = await Promise.all(top.map(buildSupplyFact));

  return { tripRequestId, hasCandidateSupply: candidates.length > 0, candidates };
}
