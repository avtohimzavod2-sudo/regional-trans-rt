import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMocks, crmAutoBridgeMocks, crmAutoConfigMocks } = vi.hoisted(() => ({
  dbMocks: {
    driver: { findUnique: vi.fn() },
    trip: { findFirst: vi.fn(), findMany: vi.fn() },
    driverOffer: { findFirst: vi.fn(), findMany: vi.fn() },
  },
  crmAutoBridgeMocks: {
    latestOpenBreakdownForDriver: vi.fn(),
    latestVerifiedEtaForOffer: vi.fn(),
    operationalHistoryForArtur: vi.fn(),
  },
  crmAutoConfigMocks: {
    getEtaStalenessMinutes: vi.fn(),
  },
}));
vi.mock("@/lib/db", () => ({ db: dbMocks }));
vi.mock("@/lib/crm-auto/bridge", () => crmAutoBridgeMocks);
vi.mock("@/lib/crm-auto/config", () => crmAutoConfigMocks);

import { buildDriverOperationsDetail } from "./driver-detail";

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
    driverOfferId: "offer-1",
    status: "IN_PROGRESS",
    seats: 2,
    driverOffer: offer(),
    createdAt: new Date("2026-09-10T08:00:00.000Z"),
    completedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

const NO_ETA = { etaMinutes: null, freshness: null, delayed: false, arrived: false };
const NO_BREAKDOWN = { hasOpenBreakdown: false };

function setupBaseMocks() {
  dbMocks.driver.findUnique.mockResolvedValue(driver());
  dbMocks.trip.findFirst.mockResolvedValue(null);
  dbMocks.driverOffer.findFirst.mockResolvedValue(null);
  dbMocks.trip.findMany.mockResolvedValue([]);
  dbMocks.driverOffer.findMany.mockResolvedValue([]);
  crmAutoBridgeMocks.latestOpenBreakdownForDriver.mockResolvedValue(NO_BREAKDOWN);
  crmAutoBridgeMocks.latestVerifiedEtaForOffer.mockResolvedValue(NO_ETA);
  crmAutoBridgeMocks.operationalHistoryForArtur.mockResolvedValue([]);
  crmAutoConfigMocks.getEtaStalenessMinutes.mockReturnValue(30);
}

describe("buildDriverOperationsDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBaseMocks();
  });

  it("returns null for a nonexistent driverId", async () => {
    dbMocks.driver.findUnique.mockResolvedValue(null);

    const detail = await buildDriverOperationsDetail("missing-driver", {}, NOW);

    expect(detail).toBeNull();
  });

  it("reports AVAILABLE for a driver with no trip or offer ever", async () => {
    const detail = await buildDriverOperationsDetail("driver-1", {}, NOW);

    expect(detail!.snapshot.operationalState).toBe("AVAILABLE");
    expect(detail!.snapshot.activeOfferId).toBeNull();
    expect(detail!.snapshot.activeTripId).toBeNull();
  });

  it("reports PLANNED via an open offer", async () => {
    dbMocks.driverOffer.findFirst.mockResolvedValue(offer({ status: "OPEN" }));

    const detail = await buildDriverOperationsDetail("driver-1", {}, NOW);

    expect(detail!.snapshot.operationalState).toBe("PLANNED");
    expect(detail!.snapshot.activeOfferId).toBe("offer-1");
  });

  it("reports WAITING_DEPARTURE via a SCHEDULED non-terminal trip", async () => {
    dbMocks.trip.findFirst.mockImplementation((args: { where: { status?: { in: string[] } } }) =>
      Promise.resolve(args.where.status ? trip({ status: "SCHEDULED" }) : null),
    );

    const detail = await buildDriverOperationsDetail("driver-1", {}, NOW);

    expect(detail!.snapshot.operationalState).toBe("WAITING_DEPARTURE");
  });

  it("reports EN_ROUTE via an IN_PROGRESS non-terminal trip, matching the exact seat math the fleet picture uses", async () => {
    dbMocks.trip.findFirst.mockImplementation((args: { where: { status?: { in: string[] } } }) =>
      Promise.resolve(args.where.status ? trip({ driverOffer: offer({ seatsTotal: 4, seatsAvailable: 1 }) }) : null),
    );

    const detail = await buildDriverOperationsDetail("driver-1", {}, NOW);

    expect(detail!.snapshot.operationalState).toBe("EN_ROUTE");
    expect(detail!.snapshot.seatsTotal).toBe(4);
    expect(detail!.snapshot.seatsAvailable).toBe(1);
    expect(detail!.snapshot.seatsOccupied).toBe(3);
  });

  it("reports DELAYED when the verified ETA fact carries an explicit delayed signal on an in-progress trip", async () => {
    dbMocks.trip.findFirst.mockImplementation((args: { where: { status?: { in: string[] } } }) =>
      Promise.resolve(args.where.status ? trip() : null),
    );
    crmAutoBridgeMocks.latestVerifiedEtaForOffer.mockResolvedValue({
      etaMinutes: 15,
      freshness: { source: "JOLCHU", asOf: NOW.toISOString() },
      delayed: true,
      arrived: false,
    });

    const detail = await buildDriverOperationsDetail("driver-1", {}, NOW);

    expect(detail!.snapshot.operationalState).toBe("DELAYED");
  });

  it("surfaces BREAKDOWN with highest priority even over an in-progress trip", async () => {
    dbMocks.trip.findFirst.mockImplementation((args: { where: { status?: { in: string[] } } }) =>
      Promise.resolve(args.where.status ? trip() : null),
    );
    crmAutoBridgeMocks.latestOpenBreakdownForDriver.mockResolvedValue({ hasOpenBreakdown: true });

    const detail = await buildDriverOperationsDetail("driver-1", {}, NOW);

    expect(detail!.snapshot.operationalState).toBe("BREAKDOWN");
    expect(detail!.snapshot.breakdownOpen).toBe(true);
  });

  it("returns the real underlying state once a breakdown is resolved", async () => {
    dbMocks.trip.findFirst.mockImplementation((args: { where: { status?: { in: string[] } } }) =>
      Promise.resolve(args.where.status ? trip({ status: "SCHEDULED" }) : null),
    );
    crmAutoBridgeMocks.latestOpenBreakdownForDriver.mockResolvedValue({ hasOpenBreakdown: false });

    const detail = await buildDriverOperationsDetail("driver-1", {}, NOW);

    expect(detail!.snapshot.operationalState).toBe("WAITING_DEPARTURE");
  });

  it("reports etaMinutes null when no verified ETA exists (never invented)", async () => {
    dbMocks.driverOffer.findFirst.mockResolvedValue(offer());

    const detail = await buildDriverOperationsDetail("driver-1", {}, NOW);

    expect(detail!.snapshot.etaMinutes).toBeNull();
    expect(detail!.snapshot.etaFreshness).toBeNull();
  });

  it("flags a verified ETA older than the staleness threshold", async () => {
    dbMocks.driverOffer.findFirst.mockResolvedValue(offer());
    const staleAsOf = new Date(NOW.getTime() - 45 * 60_000).toISOString();
    crmAutoBridgeMocks.latestVerifiedEtaForOffer.mockResolvedValue({
      etaMinutes: 25,
      freshness: { source: "JOLCHU", asOf: staleAsOf },
      delayed: false,
      arrived: false,
    });

    const detail = await buildDriverOperationsDetail("driver-1", {}, NOW);

    expect(detail!.snapshot.etaFreshness).toEqual({ source: "JOLCHU", asOf: staleAsOf, stale: true });
  });

  it("derives seatsOccupied for offer history entries and shows return-leg offers", async () => {
    dbMocks.driverOffer.findMany.mockResolvedValue([
      offer({ id: "offer-return", isReturnLeg: true, generatedFromTripId: "trip-prev", seatsTotal: 4, seatsAvailable: 1 }),
    ]);

    const detail = await buildDriverOperationsDetail("driver-1", {}, NOW);

    expect(detail!.recentOffers).toHaveLength(1);
    expect(detail!.recentOffers[0].seatsOccupied).toBe(3);
    expect(detail!.recentOffers[0].isReturnLeg).toBe(true);
  });

  it("sorts history newest-first and respects the configured limit (query take arg)", async () => {
    await buildDriverOperationsDetail("driver-1", { eventLimit: 5, tripLimit: 3, offerLimit: 7 }, NOW);

    expect(crmAutoBridgeMocks.operationalHistoryForArtur).toHaveBeenCalledWith("driver-1", 5);
    expect(dbMocks.trip.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3, orderBy: { createdAt: "desc" } }));
    expect(dbMocks.driverOffer.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 7, orderBy: { createdAt: "desc" } }));
  });

  it("never deletes or hides a corrected event — a CORRECTION appears as an additional entry", async () => {
    crmAutoBridgeMocks.operationalHistoryForArtur.mockResolvedValue([
      { id: "evt-correction", eventType: "CORRECTION", correctsEventId: "evt-original", createdAt: NOW, driverId: "driver-1" },
      { id: "evt-original", eventType: "BREAKDOWN_INCIDENT", incidentStatus: "OPEN", createdAt: new Date(NOW.getTime() - 60_000), driverId: "driver-1" },
    ]);

    const detail = await buildDriverOperationsDetail("driver-1", {}, NOW);

    expect(detail!.recentEvents).toHaveLength(2);
    expect(detail!.recentEvents.map((e) => e.id)).toEqual(["evt-correction", "evt-original"]);
  });

  it("never leaks passenger identity fields in trip history (only operational facts)", async () => {
    dbMocks.trip.findMany.mockResolvedValue([trip()]);

    const detail = await buildDriverOperationsDetail("driver-1", {}, NOW);

    expect(detail!.recentTrips[0]).not.toHaveProperty("passenger");
    expect(detail!.recentTrips[0]).not.toHaveProperty("passengerId");
  });
});
