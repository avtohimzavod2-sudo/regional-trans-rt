import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMocks, crmAutoBridgeMocks, orchestrateMocks } = vi.hoisted(() => ({
  dbMocks: {
    tripRequest: { findUniqueOrThrow: vi.fn() },
    driverOffer: { findMany: vi.fn() },
    trip: { findFirst: vi.fn() },
  },
  crmAutoBridgeMocks: {
    latestOpenBreakdownForDriver: vi.fn(),
    latestVerifiedEtaForOffer: vi.fn(),
  },
  orchestrateMocks: {
    excludedOfferIdsForRequest: vi.fn(),
  },
}));
vi.mock("@/lib/db", () => ({ db: dbMocks }));
vi.mock("@/lib/crm-auto/bridge", () => crmAutoBridgeMocks);
vi.mock("@/lib/matching/orchestrate", () => orchestrateMocks);

import { resolveDemandAgainstSupply } from "./facts";

const TRAVEL_DATE = new Date("2026-09-10T00:00:00.000Z");

const requestRecord = {
  id: "req-1",
  status: "PENDING",
  origin: { id: "stop-bishkek", corridorId: "corridor-1", order: 1 },
  destination: { id: "stop-karakol", corridorId: "corridor-1", order: 3 },
  travelDate: TRAVEL_DATE,
  timeWindowStart: null,
  timeWindowEnd: null,
  seats: 2,
};

const offerRecord = {
  id: "offer-1",
  driverId: "driver-1",
  origin: { id: "stop-bishkek", corridorId: "corridor-1", order: 1 },
  destination: { id: "stop-karakol", corridorId: "corridor-1", order: 3 },
  travelDate: TRAVEL_DATE,
  timeWindowStart: null,
  timeWindowEnd: null,
  seatsAvailable: 4,
  status: "OPEN",
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  driver: { status: "ACTIVE", carModel: "Sprinter", carPlate: "01KG777AAA" },
};

describe("resolveDemandAgainstSupply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.tripRequest.findUniqueOrThrow.mockResolvedValue(requestRecord);
    dbMocks.driverOffer.findMany.mockResolvedValue([offerRecord]);
    dbMocks.trip.findFirst.mockResolvedValue(null);
    orchestrateMocks.excludedOfferIdsForRequest.mockResolvedValue([]);
    crmAutoBridgeMocks.latestOpenBreakdownForDriver.mockResolvedValue({ hasOpenBreakdown: false });
    crmAutoBridgeMocks.latestVerifiedEtaForOffer.mockResolvedValue({ etaMinutes: null, freshness: null, delayed: false, arrived: false });
  });

  it("reuses the real matching engine to find a covering offer and returns a verified SupplyFact", async () => {
    const resolution = await resolveDemandAgainstSupply("req-1");

    expect(resolution.hasCandidateSupply).toBe(true);
    expect(resolution.candidates).toHaveLength(1);
    const fact = resolution.candidates[0];
    expect(fact.offerId).toBe("offer-1");
    expect(fact.seatsAvailable).toBe(4);
    expect(fact.operationalState).toBe("PLANNED"); // ACTIVE driver, OPEN offer, no active trip
    expect(fact.etaMinutes).toBeNull();
    expect(fact.confidence).toBe("VERIFIED");
  });

  it("never returns a candidate offer with insufficient seats (never invents availability)", async () => {
    dbMocks.driverOffer.findMany.mockResolvedValue([{ ...offerRecord, seatsAvailable: 1 }]);

    const resolution = await resolveDemandAgainstSupply("req-1");

    expect(resolution.hasCandidateSupply).toBe(false);
    expect(resolution.candidates).toEqual([]);
  });

  it("returns no candidates for a request that is not PENDING/MATCHING, without querying offers", async () => {
    dbMocks.tripRequest.findUniqueOrThrow.mockResolvedValue({ ...requestRecord, status: "CONFIRMED" });

    const resolution = await resolveDemandAgainstSupply("req-1");

    expect(resolution).toEqual({ tripRequestId: "req-1", hasCandidateSupply: false, candidates: [] });
    expect(dbMocks.driverOffer.findMany).not.toHaveBeenCalled();
    expect(orchestrateMocks.excludedOfferIdsForRequest).not.toHaveBeenCalled();
  });

  it("reuses matching/orchestrate.ts's real exclusion-aware logic to filter out offers already declined for this request", async () => {
    orchestrateMocks.excludedOfferIdsForRequest.mockResolvedValue(["offer-declined"]);

    await resolveDemandAgainstSupply("req-1");

    expect(orchestrateMocks.excludedOfferIdsForRequest).toHaveBeenCalledWith("req-1");
    expect(dbMocks.driverOffer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { notIn: ["offer-declined"] } }),
      }),
    );
  });

  it("surfaces BREAKDOWN as the operational state and never fabricates an ETA when none is verified", async () => {
    crmAutoBridgeMocks.latestOpenBreakdownForDriver.mockResolvedValue({ hasOpenBreakdown: true });

    const resolution = await resolveDemandAgainstSupply("req-1");

    expect(resolution.candidates[0].operationalState).toBe("BREAKDOWN");
    expect(resolution.candidates[0].etaMinutes).toBeNull();
    expect(resolution.candidates[0].freshness).toBeNull();
  });

  it("surfaces a verified ETA with its source and freshness when a real DriveCrmEvent exists", async () => {
    const createdAt = new Date("2026-09-09T12:00:00.000Z");
    crmAutoBridgeMocks.latestVerifiedEtaForOffer.mockResolvedValue({
      etaMinutes: 25,
      freshness: { source: "JOLCHU", asOf: createdAt.toISOString() },
      delayed: false,
      arrived: false,
    });

    const resolution = await resolveDemandAgainstSupply("req-1");

    expect(resolution.candidates[0].etaMinutes).toBe(25);
    expect(resolution.candidates[0].freshness).toEqual({ source: "JOLCHU", asOf: createdAt.toISOString() });
  });
});
