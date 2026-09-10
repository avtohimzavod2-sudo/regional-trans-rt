// RT OFFICE — Live Fleet Picture (spec s.3): the nationwide, dispatcher-facing
// read entrypoint on top of RT Core's existing Driver/DriverOffer/Trip tables
// and CRM Auto's DriveCrmEvent journal. This is deliberately NOT a second
// matching engine and NOT a new Prisma model (spec s.1/s.2/s.17) — it is a
// bulk, read-only aggregation reusing the exact same deriveOperationalState()
// function facts.ts already uses, so a driver's state can never disagree
// between the per-request view and the fleet-wide view.
//
// Performance (spec s.4): every query below is batched across the whole
// driver set (Prisma `distinct` for "latest row per driver", the existing
// openBreakdownForDrivers/latestVerifiedEtaForOffers bulk helpers) — the
// query count is constant regardless of fleet size, never one query per
// driver.
import type { Driver, DriverOffer, Stop, Trip } from "@prisma/client";
import { db } from "@/lib/db";
import { getEtaStalenessMinutes } from "@/lib/crm-auto/config";
import { latestVerifiedEtaForOffers, openBreakdownForDrivers, type VerifiedEtaFact } from "@/lib/crm-auto/bridge";
import { deriveOperationalState, type OperationalStateInput } from "./operational-state";
import type {
  DriverOperationalSnapshot,
  EtaFreshnessView,
  LiveFleetPicture,
  OperationalState,
  StopNameSummary,
} from "./types";

const OPERATIONAL_STATES: OperationalState[] = [
  "AVAILABLE",
  "PLANNED",
  "WAITING_DEPARTURE",
  "EN_ROUTE",
  "DELAYED",
  "ARRIVED",
  "COMPLETED",
  "CANCELLED",
  "BREAKDOWN",
  "OFFLINE",
];

// Only these states represent supply a dispatcher could actually put a new
// passenger into right now (spec s.10) — a BREAKDOWN/CANCELLED/OFFLINE/
// ARRIVED/COMPLETED "seatsAvailable" is a historical fact about a vehicle
// that is not real usable capacity today.
const USABLE_SUPPLY_STATES = new Set<OperationalState>(["AVAILABLE", "PLANNED", "WAITING_DEPARTURE", "EN_ROUTE", "DELAYED"]);

export const NON_TERMINAL_TRIP_STATUSES = ["SCHEDULED", "IN_PROGRESS"] as const;
export const OPEN_OFFER_STATUSES = ["OPEN", "PARTIALLY_FILLED"] as const;

export type OfferWithStops = DriverOffer & { origin: Stop; destination: Stop };
export type TripWithOffer = Trip & { driverOffer: OfferWithStops };

export function toStopSummary(stop: Stop): StopNameSummary {
  return { id: stop.id, nameRu: stop.nameRu, nameKy: stop.nameKy, nameEn: stop.nameEn };
}

export function driverDisplayName(driver: Pick<Driver, "name" | "telegramUsername" | "telegramUserId">): string {
  return driver.name ?? driver.telegramUsername ?? driver.telegramUserId;
}

/** "Latest row per driverId" via Prisma's distinct-on-orderBy idiom — a
 * single query regardless of how many historical rows exist, never a full
 * per-driver history pull. */
async function latestNonTerminalTripsByDriver(driverIds: string[]): Promise<Map<string, TripWithOffer>> {
  if (driverIds.length === 0) return new Map();
  const trips = await db.trip.findMany({
    where: { driverId: { in: driverIds }, status: { in: [...NON_TERMINAL_TRIP_STATUSES] } },
    distinct: ["driverId"],
    orderBy: [{ driverId: "asc" }, { createdAt: "desc" }],
    include: { driverOffer: { include: { origin: true, destination: true } } },
  });
  return new Map(trips.map((t) => [t.driverId, t as TripWithOffer]));
}

/** Same "latest row per driver" idiom, unrestricted by status — only ever
 * consulted for drivers with neither a non-terminal trip nor an open offer,
 * so this is the sole route by which ARRIVED/COMPLETED/CANCELLED become
 * observable (deriveOperationalState only reaches those branches from a
 * terminal Trip status). Reporting a driver's real last trip here is a true
 * historical fact, never a guess. */
async function latestTripsByDriver(driverIds: string[]): Promise<Map<string, TripWithOffer>> {
  if (driverIds.length === 0) return new Map();
  const trips = await db.trip.findMany({
    where: { driverId: { in: driverIds } },
    distinct: ["driverId"],
    orderBy: [{ driverId: "asc" }, { createdAt: "desc" }],
    include: { driverOffer: { include: { origin: true, destination: true } } },
  });
  return new Map(trips.map((t) => [t.driverId, t as TripWithOffer]));
}

async function latestOpenOffersByDriver(driverIds: string[]): Promise<Map<string, OfferWithStops>> {
  if (driverIds.length === 0) return new Map();
  const offers = await db.driverOffer.findMany({
    where: { driverId: { in: driverIds }, status: { in: [...OPEN_OFFER_STATUSES] } },
    distinct: ["driverId"],
    orderBy: [{ driverId: "asc" }, { createdAt: "desc" }],
    include: { origin: true, destination: true },
  });
  return new Map(offers.map((o) => [o.driverId, o as OfferWithStops]));
}

export interface CurrentContext {
  offer: OfferWithStops | null;
  tripId: string | null;
  tripStatus: OperationalStateInput["activeTripStatus"];
}

/**
 * Deterministic, testable "which offer/trip is this driver's current
 * operational context" rule (spec s.2/s.3 — never an LLM decision):
 *   1. The driver's most recent non-terminal Trip (SCHEDULED/IN_PROGRESS), if
 *      any — an ongoing journey always outranks a merely-open offer.
 *   2. Else the driver's most recent OPEN/PARTIALLY_FILLED DriverOffer.
 *   3. Else the driver's most recent Trip of any status (so a just-completed
 *      or just-cancelled trip is still visible as ARRIVED/COMPLETED/
 *      CANCELLED until superseded by a new offer — completeTrip() normally
 *      creates the return-leg offer immediately, so this is a narrow,
 *      truthful window rather than a stale forever-state).
 *   4. Else no context at all (a driver who has never posted or received a
 *      trip): the fleet picture falls through to deriveOperationalState's
 *      own AVAILABLE/OFFLINE default from driver.status alone.
 *
 * Pure and driverId-agnostic — this is the single source of context-priority
 * truth shared by the bulk fleet path (which resolves its three inputs via
 * Map lookups) and the single-driver Driver Detail path (which resolves them
 * via direct findFirst results), so the two views can never disagree about
 * the same driver at the same instant (spec DRIVER OPERATIONS CENTER s.2/s.3).
 */
export function selectCurrentContext(
  nonTerminalTrip: TripWithOffer | null,
  openOffer: OfferWithStops | null,
  fallbackTrip: TripWithOffer | null,
): CurrentContext {
  if (nonTerminalTrip) return { offer: nonTerminalTrip.driverOffer, tripId: nonTerminalTrip.id, tripStatus: nonTerminalTrip.status };
  if (openOffer) return { offer: openOffer, tripId: null, tripStatus: null };
  if (fallbackTrip) return { offer: fallbackTrip.driverOffer, tripId: fallbackTrip.id, tripStatus: fallbackTrip.status };
  return { offer: null, tripId: null, tripStatus: null };
}

function pickCurrentContext(
  driverId: string,
  nonTerminalTrips: Map<string, TripWithOffer>,
  openOffers: Map<string, OfferWithStops>,
  fallbackTrips: Map<string, TripWithOffer>,
): CurrentContext {
  return selectCurrentContext(
    nonTerminalTrips.get(driverId) ?? null,
    openOffers.get(driverId) ?? null,
    fallbackTrips.get(driverId) ?? null,
  );
}

function isEtaStale(asOf: string, now: Date, stalenessMinutes: number): boolean {
  return now.getTime() - new Date(asOf).getTime() > stalenessMinutes * 60_000;
}

function buildEtaFreshnessView(eta: VerifiedEtaFact, now: Date, stalenessMinutes: number): EtaFreshnessView | null {
  if (!eta.freshness) return null;
  return { ...eta.freshness, stale: isEtaStale(eta.freshness.asOf, now, stalenessMinutes) };
}

function emptyCounts(): Record<OperationalState, number> {
  const counts = {} as Record<OperationalState, number>;
  for (const state of OPERATIONAL_STATES) counts[state] = 0;
  return counts;
}

/**
 * The single per-driver snapshot builder (spec DRIVER OPERATIONS CENTER
 * s.2/s.3: "must not create a second snapshot algorithm") — used by both the
 * bulk buildLiveFleetPicture() path and the single-driver Driver Detail path
 * so a given driver's derived state can never disagree between the two
 * views.
 */
export function buildDriverOperationalSnapshot(
  driver: Driver,
  context: CurrentContext,
  breakdownOpen: boolean,
  eta: VerifiedEtaFact,
  now: Date,
  stalenessMinutes: number,
): DriverOperationalSnapshot {
  const { offer, tripId, tripStatus } = context;

  const operationalState = deriveOperationalState({
    driverStatus: driver.status,
    hasOpenBreakdown: breakdownOpen,
    activeOfferStatus: offer?.status ?? null,
    activeTripStatus: tripStatus,
    delayedSignal: eta.delayed,
    arrivedSignal: eta.arrived,
  });

  const seatsTotal = offer?.seatsTotal ?? 0;
  const seatsAvailable = offer?.seatsAvailable ?? 0;

  return {
    driverId: driver.id,
    driverName: driverDisplayName(driver),
    driverVerificationStatus: driver.status,
    vehicle: { carModel: driver.carModel, carPlate: driver.carPlate },
    operationalState,
    activeOfferId: offer?.id ?? null,
    activeTripId: tripId,
    origin: offer ? toStopSummary(offer.origin) : null,
    destination: offer ? toStopSummary(offer.destination) : null,
    travelDate: offer ? offer.travelDate.toISOString().slice(0, 10) : null,
    departureWindow: offer
      ? { travelDate: offer.travelDate.toISOString().slice(0, 10), start: offer.timeWindowStart, end: offer.timeWindowEnd }
      : null,
    seatsTotal,
    seatsAvailable,
    seatsOccupied: Math.max(0, seatsTotal - seatsAvailable),
    etaMinutes: eta.etaMinutes,
    etaFreshness: buildEtaFreshnessView(eta, now, stalenessMinutes),
    breakdownOpen,
    isReturnLeg: offer?.isReturnLeg ?? false,
    generatedFromTripId: offer?.generatedFromTripId ?? null,
    snapshotAsOf: now.toISOString(),
  };
}

/**
 * RT OFFICE's aggregated, nationwide fleet entrypoint (spec s.3). Every
 * driver ever registered is represented exactly once (spec: "must not
 * double-count a driver"). No new Prisma model, no new matching logic — pure
 * composition of existing RT Core reads plus CRM Auto's existing bulk bridge
 * helpers.
 */
export async function buildLiveFleetPicture(now: Date = new Date()): Promise<LiveFleetPicture> {
  const stalenessMinutes = getEtaStalenessMinutes();

  const drivers = await db.driver.findMany();
  const driverIds = drivers.map((d) => d.id);

  const nonTerminalTrips = await latestNonTerminalTripsByDriver(driverIds);
  const openOffers = await latestOpenOffersByDriver(driverIds);

  const remainingDriverIds = driverIds.filter((id) => !nonTerminalTrips.has(id) && !openOffers.has(id));
  const fallbackTrips = await latestTripsByDriver(remainingDriverIds);

  const [breakdownByDriver, activeDriverOfferCount, returnLegOfferCount] = await Promise.all([
    openBreakdownForDrivers(driverIds),
    db.driverOffer.count({ where: { status: { in: [...OPEN_OFFER_STATUSES] } } }),
    db.driverOffer.count({ where: { isReturnLeg: true, status: { in: [...OPEN_OFFER_STATUSES] } } }),
  ]);

  const contexts = new Map(
    driverIds.map((id) => [id, pickCurrentContext(id, nonTerminalTrips, openOffers, fallbackTrips)]),
  );
  const contextOfferIds = Array.from(
    new Set(Array.from(contexts.values()).map((c) => c.offer?.id).filter((id): id is string => !!id)),
  );
  const etaByOffer = await latestVerifiedEtaForOffers(contextOfferIds);
  const noEta: VerifiedEtaFact = { etaMinutes: null, freshness: null, delayed: false, arrived: false };

  const counts = emptyCounts();
  let seatsAvailableTotal = 0;
  let seatsOccupiedTotal = 0;
  let confirmedEtaCount = 0;

  const snapshots: DriverOperationalSnapshot[] = drivers.map((driver) => {
    const context = contexts.get(driver.id)!;
    const eta = (context.offer && etaByOffer.get(context.offer.id)) || noEta;
    const snapshot = buildDriverOperationalSnapshot(driver, context, breakdownByDriver.get(driver.id) ?? false, eta, now, stalenessMinutes);

    counts[snapshot.operationalState] += 1;
    if (USABLE_SUPPLY_STATES.has(snapshot.operationalState)) {
      seatsAvailableTotal += snapshot.seatsAvailable;
      seatsOccupiedTotal += snapshot.seatsOccupied;
    }
    if (snapshot.etaMinutes !== null) confirmedEtaCount += 1;

    return snapshot;
  });

  return {
    totalDrivers: drivers.length,
    counts,
    seatsAvailableTotal,
    seatsOccupiedTotal,
    activeDriverOfferCount,
    returnLegOfferCount,
    confirmedEtaCount,
    generatedAt: now.toISOString(),
    drivers: snapshots,
  };
}
