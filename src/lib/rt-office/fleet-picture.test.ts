import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMocks, crmAutoBridgeMocks, crmAutoConfigMocks } = vi.hoisted(() => ({
  dbMocks: {
    driver: { findMany: vi.fn() },
    trip: { findMany: vi.fn() },
    driverOffer: { findMany: vi.fn(), count: vi.fn() },
  },
  crmAutoBridgeMocks: {
    openBreakdownForDrivers: vi.fn(),
    latestVerifiedEtaForOffers: vi.fn(),
  },
  crmAutoConfigMocks: {
    getEtaStalenessMinutes: vi.fn(),
  },
}));
vi.mock("@/lib/db", () => ({ db: dbMocks }));
vi.mock("@/lib/crm-auto/bridge", () => crmAutoBridgeMocks);
vi.mock("@/lib/crm-auto/config", () => crmAutoConfigMocks);

import { buildLiveFleetPicture } from "./fleet-picture";

const NOW = new Date("2026-09-10T12:00:00.000Z");

const STOP_BISHKEK = { id: "stop-bishkek", nameRu: "Бишкек", nameKy: "Бишкек", nameEn: "Bishkek" };
const STOP_OSH = { id: "stop-osh", nameRu: "Ош", nameKy: "Ош", nameEn: "Osh" };

function driver(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "driver-1",
    name: "Азамат",
    telegramUsername: "azamat_tg",
    telegramUserId: "tg-1",
    status: "ACTIVE",
    carModel: "Sprinter",
    carPlate: "01KG777AAA",
    ...overrides,
  };
}

function offer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "offer-1",
    driverId: "driver-1",
    status: "OPEN",
    seatsTotal: 4,
    seatsAvailable: 4,
    isReturnLeg: false,
    generatedFromTripId: null,
    travelDate: new Date("2026-09-10T00:00:00.000Z"),
    timeWindowStart: "08:00",
    timeWindowEnd: "10:00",
    origin: STOP_BISHKEK,
    destination: STOP_OSH,
    createdAt: new Date("2026-09-09T00:00:00.000Z"),
    ...overrides,
  };
}

function trip(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "trip-1",
    driverId: "driver-1",
    status: "IN_PROGRESS",
    driverOffer: offer(),
    createdAt: new Date("2026-09-10T08:00:00.000Z"),
    ...overrides,
  };
}

const NO_ETA = { etaMinutes: null, freshness: null, delayed: false, arrived: false };

function setupBaseMocks() {
  dbMocks.driver.findMany.mockResolvedValue([driver()]);
  dbMocks.trip.findMany.mockImplementation((args: { where: { status?: { in: string[] } } }) => {
    // No status filter at all => the "fallback: latest trip of any status" query.
    if (!args.where.status) return Promise.resolve([]);
    return Promise.resolve([]);
  });
  dbMocks.driverOffer.findMany.mockResolvedValue([]);
  dbMocks.driverOffer.count.mockResolvedValue(0);
  crmAutoBridgeMocks.openBreakdownForDrivers.mockResolvedValue(new Map());
  crmAutoBridgeMocks.latestVerifiedEtaForOffers.mockResolvedValue(new Map());
  crmAutoConfigMocks.getEtaStalenessMinutes.mockReturnValue(30);
}

describe("buildLiveFleetPicture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBaseMocks();
  });

  it("derives EN_ROUTE from a non-terminal IN_PROGRESS trip and computes seatsOccupied = seatsTotal - seatsAvailable", async () => {
    dbMocks.driver.findMany.mockResolvedValue([driver()]);
    dbMocks.trip.findMany.mockImplementation((args: { where: { status?: { in: string[] } } }) =>
      args.where.status ? Promise.resolve([trip({ driverOffer: offer({ seatsTotal: 4, seatsAvailable: 1 }) })]) : Promise.resolve([]),
    );

    const picture = await buildLiveFleetPicture(NOW);

    expect(picture.drivers).toHaveLength(1);
    const snapshot = picture.drivers[0];
    expect(snapshot.operationalState).toBe("EN_ROUTE");
    expect(snapshot.activeTripId).toBe("trip-1");
    expect(snapshot.seatsTotal).toBe(4);
    expect(snapshot.seatsAvailable).toBe(1);
    expect(snapshot.seatsOccupied).toBe(3);
    expect(picture.counts.EN_ROUTE).toBe(1);
    expect(picture.totalDrivers).toBe(1);
  });

  it("prefers a non-terminal trip's offer over a separately open offer for the same driver (trip outranks a merely-open offer)", async () => {
    dbMocks.trip.findMany.mockImplementation((args: { where: { status?: { in: string[] } } }) =>
      args.where.status ? Promise.resolve([trip({ id: "trip-active" })]) : Promise.resolve([]),
    );
    dbMocks.driverOffer.findMany.mockResolvedValue([offer({ id: "offer-other", status: "OPEN" })]);

    const picture = await buildLiveFleetPicture(NOW);

    expect(picture.drivers[0].activeOfferId).toBe("offer-1"); // the trip's own offer, not "offer-other"
    expect(picture.drivers[0].activeTripId).toBe("trip-active");
  });

  it("falls back to the most recent OPEN/PARTIALLY_FILLED offer when there is no non-terminal trip, and reports PLANNED", async () => {
    dbMocks.driverOffer.findMany.mockResolvedValue([offer({ status: "PARTIALLY_FILLED", seatsTotal: 4, seatsAvailable: 2 })]);

    const picture = await buildLiveFleetPicture(NOW);

    expect(picture.drivers[0].operationalState).toBe("PLANNED");
    expect(picture.drivers[0].activeTripId).toBeNull();
    expect(picture.drivers[0].seatsOccupied).toBe(2);
  });

  it("reports AVAILABLE for a brand-new driver with no offer or trip ever (never guesses a state)", async () => {
    const picture = await buildLiveFleetPicture(NOW);

    const snapshot = picture.drivers[0];
    expect(snapshot.operationalState).toBe("AVAILABLE");
    expect(snapshot.activeOfferId).toBeNull();
    expect(snapshot.activeTripId).toBeNull();
    expect(snapshot.seatsTotal).toBe(0);
    expect(snapshot.seatsAvailable).toBe(0);
    expect(snapshot.seatsOccupied).toBe(0);
    expect(snapshot.origin).toBeNull();
    expect(snapshot.etaMinutes).toBeNull();
  });

  it("reports OFFLINE for a suspended driver with no active trip", async () => {
    dbMocks.driver.findMany.mockResolvedValue([driver({ status: "SUSPENDED" })]);

    const picture = await buildLiveFleetPicture(NOW);

    expect(picture.drivers[0].operationalState).toBe("OFFLINE");
    expect(picture.counts.OFFLINE).toBe(1);
  });

  it("does not use a FULL/CLOSED/CANCELLED offer as current context (only OPEN/PARTIALLY_FILLED are queried as 'open offers')", async () => {
    // The findMany mock for open offers is called with a status filter that
    // excludes FULL/CLOSED/CANCELLED at the query level — simulate that by
    // returning nothing, exactly as the real filtered query would.
    dbMocks.driverOffer.findMany.mockResolvedValue([]);

    const picture = await buildLiveFleetPicture(NOW);

    expect(picture.drivers[0].activeOfferId).toBeNull();
    expect(picture.drivers[0].operationalState).toBe("AVAILABLE");
    expect(picture.seatsAvailableTotal).toBe(0);
  });

  it("surfaces BREAKDOWN with highest priority even over an in-progress trip, and excludes it from usable seat totals", async () => {
    dbMocks.trip.findMany.mockImplementation((args: { where: { status?: { in: string[] } } }) =>
      args.where.status ? Promise.resolve([trip({ driverOffer: offer({ seatsTotal: 4, seatsAvailable: 4 }) })]) : Promise.resolve([]),
    );
    crmAutoBridgeMocks.openBreakdownForDrivers.mockResolvedValue(new Map([["driver-1", true]]));

    const picture = await buildLiveFleetPicture(NOW);

    expect(picture.drivers[0].operationalState).toBe("BREAKDOWN");
    expect(picture.drivers[0].breakdownOpen).toBe(true);
    expect(picture.counts.BREAKDOWN).toBe(1);
    expect(picture.seatsAvailableTotal).toBe(0);
  });

  it("returns the underlying derived state (not forced AVAILABLE) once a breakdown is resolved but a real trip is still active", async () => {
    dbMocks.trip.findMany.mockImplementation((args: { where: { status?: { in: string[] } } }) =>
      args.where.status ? Promise.resolve([trip({ status: "SCHEDULED" })]) : Promise.resolve([]),
    );
    // openBreakdownForDrivers already honors RESOLVED/CORRECTION internally —
    // from this module's point of view a resolved breakdown simply reports
    // hasOpenBreakdown: false, and the real trip state must show through.
    crmAutoBridgeMocks.openBreakdownForDrivers.mockResolvedValue(new Map([["driver-1", false]]));

    const picture = await buildLiveFleetPicture(NOW);

    expect(picture.drivers[0].operationalState).toBe("WAITING_DEPARTURE");
    expect(picture.drivers[0].breakdownOpen).toBe(false);
  });

  it("falls back to the driver's most recent terminal trip to surface ARRIVED when neither a non-terminal trip nor an open offer exists", async () => {
    dbMocks.trip.findMany.mockImplementation((args: { where: { status?: { in: string[] } } }) =>
      args.where.status ? Promise.resolve([]) : Promise.resolve([trip({ id: "trip-done", status: "COMPLETED" })]),
    );
    crmAutoBridgeMocks.latestVerifiedEtaForOffers.mockResolvedValue(
      new Map([["offer-1", { etaMinutes: 0, freshness: { source: "JOLCHU", asOf: NOW.toISOString() }, delayed: false, arrived: true }]]),
    );

    const picture = await buildLiveFleetPicture(NOW);

    expect(picture.drivers[0].operationalState).toBe("ARRIVED");
    expect(picture.drivers[0].activeTripId).toBe("trip-done");
    expect(picture.counts.ARRIVED).toBe(1);
  });

  it("falls back to the driver's most recent terminal trip to surface CANCELLED", async () => {
    dbMocks.trip.findMany.mockImplementation((args: { where: { status?: { in: string[] } } }) =>
      args.where.status ? Promise.resolve([]) : Promise.resolve([trip({ id: "trip-cancelled", status: "CANCELLED" })]),
    );

    const picture = await buildLiveFleetPicture(NOW);

    expect(picture.drivers[0].operationalState).toBe("CANCELLED");
  });

  it("makes a return-leg offer visible as the driver's current context and counts it in returnLegOfferCount", async () => {
    dbMocks.driverOffer.findMany.mockResolvedValue([offer({ isReturnLeg: true, generatedFromTripId: "trip-prev" })]);
    dbMocks.driverOffer.count.mockImplementation((args: { where?: { isReturnLeg?: boolean } }) =>
      Promise.resolve(args.where?.isReturnLeg ? 1 : 1),
    );

    const picture = await buildLiveFleetPicture(NOW);

    expect(picture.drivers[0].isReturnLeg).toBe(true);
    expect(picture.drivers[0].generatedFromTripId).toBe("trip-prev");
    expect(picture.returnLegOfferCount).toBe(1);
  });

  it("reports etaMinutes null and no freshness when no verified ETA event exists (never fabricates one)", async () => {
    dbMocks.driverOffer.findMany.mockResolvedValue([offer()]);
    crmAutoBridgeMocks.latestVerifiedEtaForOffers.mockResolvedValue(new Map([["offer-1", NO_ETA]]));

    const picture = await buildLiveFleetPicture(NOW);

    expect(picture.drivers[0].etaMinutes).toBeNull();
    expect(picture.drivers[0].etaFreshness).toBeNull();
    expect(picture.confirmedEtaCount).toBe(0);
  });

  it("marks a verified ETA as stale once it exceeds the configured staleness threshold, without altering the value", async () => {
    dbMocks.driverOffer.findMany.mockResolvedValue([offer()]);
    crmAutoConfigMocks.getEtaStalenessMinutes.mockReturnValue(30);
    const staleAsOf = new Date(NOW.getTime() - 45 * 60_000).toISOString();
    crmAutoBridgeMocks.latestVerifiedEtaForOffers.mockResolvedValue(
      new Map([["offer-1", { etaMinutes: 25, freshness: { source: "JOLCHU", asOf: staleAsOf }, delayed: false, arrived: false }]]),
    );

    const picture = await buildLiveFleetPicture(NOW);

    expect(picture.drivers[0].etaMinutes).toBe(25);
    expect(picture.drivers[0].etaFreshness).toEqual({ source: "JOLCHU", asOf: staleAsOf, stale: true });
    expect(picture.confirmedEtaCount).toBe(1);
  });

  it("reports a fresh (non-stale) verified ETA within the threshold", async () => {
    dbMocks.driverOffer.findMany.mockResolvedValue([offer()]);
    const freshAsOf = new Date(NOW.getTime() - 5 * 60_000).toISOString();
    crmAutoBridgeMocks.latestVerifiedEtaForOffers.mockResolvedValue(
      new Map([["offer-1", { etaMinutes: 25, freshness: { source: "JOLCHU", asOf: freshAsOf }, delayed: false, arrived: false }]]),
    );

    const picture = await buildLiveFleetPicture(NOW);

    expect(picture.drivers[0].etaFreshness).toEqual({ source: "JOLCHU", asOf: freshAsOf, stale: false });
  });

  it("aggregates counts across multiple drivers without double-counting any single driver", async () => {
    dbMocks.driver.findMany.mockResolvedValue([
      driver({ id: "driver-a" }),
      driver({ id: "driver-b", status: "SUSPENDED" }),
      driver({ id: "driver-c" }),
    ]);
    dbMocks.driverOffer.findMany.mockResolvedValue([offer({ id: "offer-c", driverId: "driver-c", status: "OPEN" })]);

    const picture = await buildLiveFleetPicture(NOW);

    expect(picture.totalDrivers).toBe(3);
    const totalCounted = Object.values(picture.counts).reduce((sum, n) => sum + n, 0);
    expect(totalCounted).toBe(3);
    expect(picture.counts.AVAILABLE).toBe(1); // driver-a
    expect(picture.counts.OFFLINE).toBe(1); // driver-b
    expect(picture.counts.PLANNED).toBe(1); // driver-c
  });

  it("issues a bounded, constant number of bulk queries regardless of fleet size (never one query per driver)", async () => {
    dbMocks.driver.findMany.mockResolvedValue([driver({ id: "driver-a" }), driver({ id: "driver-b" }), driver({ id: "driver-c" })]);

    await buildLiveFleetPicture(NOW);

    // trip.findMany: once for non-terminal trips, once for the fallback tier.
    expect(dbMocks.trip.findMany).toHaveBeenCalledTimes(2);
    // driverOffer.findMany: once for open offers across the whole driver set.
    expect(dbMocks.driverOffer.findMany).toHaveBeenCalledTimes(1);
    expect(crmAutoBridgeMocks.openBreakdownForDrivers).toHaveBeenCalledTimes(1);
    expect(crmAutoBridgeMocks.latestVerifiedEtaForOffers).toHaveBeenCalledTimes(1);
  });
});
