// RT OFFICE — Driver Operations Detail (DRIVER OPERATIONS CENTER pass):
// the single-driver deep-dive read model behind /dispatcher/drive-crm/[id].
//
// This is deliberately NOT a second snapshot algorithm: the operational
// snapshot embedded here is built by the exact same buildDriverOperationalSnapshot()
// + selectCurrentContext() functions buildLiveFleetPicture() uses, so a given
// driver's derived state can never disagree between the fleet-wide view and
// this single-driver view.
//
// Performance: this is a fixed, small set of driverId-scoped queries — never
// buildLiveFleetPicture().drivers.find(...), which would read the whole
// fleet just to render one card.
import type { Driver, DriveCrmEvent } from "@prisma/client";
import { db } from "@/lib/db";
import { getEtaStalenessMinutes } from "@/lib/crm-auto/config";
import { latestOpenBreakdownForDriver, latestVerifiedEtaForOffer, operationalHistoryForArtur } from "@/lib/crm-auto/bridge";
import {
  buildDriverOperationalSnapshot,
  driverDisplayName,
  NON_TERMINAL_TRIP_STATUSES,
  OPEN_OFFER_STATUSES,
  selectCurrentContext,
  toStopSummary,
  type OfferWithStops,
  type TripWithOffer,
} from "./fleet-picture";
import type { DriverOperationalSnapshot, StopNameSummary } from "./types";

/** Trip history row (spec s.5) — deliberately omits passenger identity: this
 * is an internal dispatcher page but not a licence to leak uncontrolled
 * passenger PII, only the operational facts a dispatcher needs. */
export interface DriverTripHistoryEntry {
  id: string;
  status: string;
  origin: StopNameSummary;
  destination: StopNameSummary;
  seats: number;
  offerId: string;
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
}

export interface DriverOfferHistoryEntry {
  id: string;
  origin: StopNameSummary;
  destination: StopNameSummary;
  travelDate: string;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  seatsTotal: number;
  seatsAvailable: number;
  /** Always seatsTotal - seatsAvailable, clamped at 0 — same derivation rule
   * as DriverOperationalSnapshot.seatsOccupied, never a second counter. */
  seatsOccupied: number;
  status: string;
  isReturnLeg: boolean;
  generatedFromTripId: string | null;
  createdAt: string;
}

export interface DriverOperationsDetail {
  driver: {
    id: string;
    name: string;
    carModel: string | null;
    carPlate: string | null;
    verificationStatus: Driver["status"];
  };
  snapshot: DriverOperationalSnapshot;
  /** CRM Auto's append-only DriveCrmEvent journal, newest first — a
   * CORRECTION row is a separate additional entry, never a replacement of
   * the row it corrects (see crm-auto/boundary.test.ts). */
  recentEvents: DriveCrmEvent[];
  recentTrips: DriverTripHistoryEntry[];
  recentOffers: DriverOfferHistoryEntry[];
}

export interface DriverOperationsDetailOptions {
  eventLimit?: number;
  tripLimit?: number;
  offerLimit?: number;
}

/**
 * Single-driver deep-dive read model (spec s.2/s.3/s.4/s.5). Returns null for
 * a nonexistent driverId — callers (the dispatcher route) turn that into
 * notFound(), never a blank/garbage card.
 */
export async function buildDriverOperationsDetail(
  driverId: string,
  options: DriverOperationsDetailOptions = {},
  now: Date = new Date(),
): Promise<DriverOperationsDetail | null> {
  const { eventLimit = 50, tripLimit = 20, offerLimit = 20 } = options;
  const stalenessMinutes = getEtaStalenessMinutes();

  const driver = await db.driver.findUnique({ where: { id: driverId } });
  if (!driver) return null;

  const [nonTerminalTrip, openOffer, fallbackTrip, breakdown, recentEvents, recentTripsRaw, recentOffersRaw] = await Promise.all([
    db.trip.findFirst({
      where: { driverId, status: { in: [...NON_TERMINAL_TRIP_STATUSES] } },
      orderBy: { createdAt: "desc" },
      include: { driverOffer: { include: { origin: true, destination: true } } },
    }),
    db.driverOffer.findFirst({
      where: { driverId, status: { in: [...OPEN_OFFER_STATUSES] } },
      orderBy: { createdAt: "desc" },
      include: { origin: true, destination: true },
    }),
    db.trip.findFirst({
      where: { driverId },
      orderBy: { createdAt: "desc" },
      include: { driverOffer: { include: { origin: true, destination: true } } },
    }),
    latestOpenBreakdownForDriver(driverId),
    operationalHistoryForArtur(driverId, eventLimit),
    db.trip.findMany({
      where: { driverId },
      orderBy: { createdAt: "desc" },
      take: tripLimit,
      include: { driverOffer: { include: { origin: true, destination: true } } },
    }),
    db.driverOffer.findMany({
      where: { driverId },
      orderBy: { createdAt: "desc" },
      take: offerLimit,
      include: { origin: true, destination: true },
    }),
  ]);

  const context = selectCurrentContext(
    nonTerminalTrip as TripWithOffer | null,
    openOffer as OfferWithStops | null,
    fallbackTrip as TripWithOffer | null,
  );

  const eta = context.offer
    ? await latestVerifiedEtaForOffer(driverId, context.offer.id)
    : { etaMinutes: null, freshness: null, delayed: false, arrived: false };

  const snapshot = buildDriverOperationalSnapshot(driver, context, breakdown.hasOpenBreakdown, eta, now, stalenessMinutes);

  const recentTrips: DriverTripHistoryEntry[] = recentTripsRaw.map((t) => ({
    id: t.id,
    status: t.status,
    origin: toStopSummary(t.driverOffer.origin),
    destination: toStopSummary(t.driverOffer.destination),
    seats: t.seats,
    offerId: t.driverOfferId,
    createdAt: t.createdAt.toISOString(),
    completedAt: t.completedAt?.toISOString() ?? null,
    cancelledAt: t.cancelledAt?.toISOString() ?? null,
  }));

  const recentOffers: DriverOfferHistoryEntry[] = recentOffersRaw.map((o) => ({
    id: o.id,
    origin: toStopSummary(o.origin),
    destination: toStopSummary(o.destination),
    travelDate: o.travelDate.toISOString().slice(0, 10),
    timeWindowStart: o.timeWindowStart,
    timeWindowEnd: o.timeWindowEnd,
    seatsTotal: o.seatsTotal,
    seatsAvailable: o.seatsAvailable,
    seatsOccupied: Math.max(0, o.seatsTotal - o.seatsAvailable),
    status: o.status,
    isReturnLeg: o.isReturnLeg,
    generatedFromTripId: o.generatedFromTripId,
    createdAt: o.createdAt.toISOString(),
  }));

  return {
    driver: {
      id: driver.id,
      name: driverDisplayName(driver),
      carModel: driver.carModel,
      carPlate: driver.carPlate,
      verificationStatus: driver.status,
    },
    snapshot,
    recentEvents,
    recentTrips,
    recentOffers,
  };
}
