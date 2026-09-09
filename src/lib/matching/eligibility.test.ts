import { beforeEach, describe, expect, it, vi } from "vitest";

// Spec s.9 — OPERATIONAL DRIVER ELIGIBILITY: proposeMatchesForRequest /
// proposeMatchesForOffer must not confidently propose a driver known (via
// CRM Auto's verified facts) to have a currently OPEN breakdown, even though
// that driver's Driver.status and DriverOffer.status both still look fine.
// Unknown/missing breakdown data must never be treated as a breakdown.

const { dbMocks, openBreakdownForDriversMock, latestOpenBreakdownForDriverMock, logActionMock, sendTelegramMessageMock } = vi.hoisted(() => ({
  dbMocks: {
    match: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
    },
    tripRequest: {
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    driverOffer: {
      findMany: vi.fn().mockResolvedValue([]),
      findUniqueOrThrow: vi.fn(),
    },
  },
  openBreakdownForDriversMock: vi.fn(),
  latestOpenBreakdownForDriverMock: vi.fn(),
  logActionMock: vi.fn().mockResolvedValue(undefined),
  sendTelegramMessageMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({ db: dbMocks }));
vi.mock("@/lib/audit", () => ({ logAction: logActionMock }));
vi.mock("@/lib/mira/outbound", () => ({
  notifyDriverPrivately: sendTelegramMessageMock,
  notifyPassengerText: vi.fn(),
  notifyPassengerWithConfirmButtons: vi.fn(),
  confirmDeclineKeyboard: vi.fn(),
}));
vi.mock("@/lib/crm-auto/bridge", () => ({
  openBreakdownForDrivers: openBreakdownForDriversMock,
  latestOpenBreakdownForDriver: latestOpenBreakdownForDriverMock,
}));

import { proposeMatchesForRequest, proposeMatchesForOffer } from "./orchestrate";

const origin = { id: "stop-a", corridorId: "c1", order: 1 };
const destination = { id: "stop-b", corridorId: "c1", order: 2 };
const travelDate = new Date("2026-09-10T00:00:00.000Z");

const request = {
  id: "req-1",
  origin,
  destination,
  travelDate,
  timeWindowStart: null,
  timeWindowEnd: null,
  seats: 1,
};

function makeOffer(id: string, driverId: string) {
  return {
    id,
    driverId,
    driver: { status: "ACTIVE", telegramUserId: `tg-${driverId}`, preferredLang: "RU" },
    origin,
    destination,
    travelDate,
    timeWindowStart: null,
    timeWindowEnd: null,
    seatsAvailable: 4,
    status: "OPEN",
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.match.count.mockResolvedValue(0);
  dbMocks.match.findMany.mockResolvedValue([]);
  dbMocks.tripRequest.findMany.mockResolvedValue([]);
  dbMocks.tripRequest.update.mockResolvedValue({});
  openBreakdownForDriversMock.mockResolvedValue(new Map());
  latestOpenBreakdownForDriverMock.mockResolvedValue({ hasOpenBreakdown: false });
});

describe("proposeMatchesForRequest — operational eligibility filter", () => {
  it("skips an offer whose driver has a verified OPEN breakdown, even though driver/offer status looks fine", async () => {
    dbMocks.tripRequest.findUniqueOrThrow.mockResolvedValue({ ...request, status: "PENDING" });
    dbMocks.driverOffer.findMany.mockResolvedValue([makeOffer("offer-broken", "driver-broken")]);
    openBreakdownForDriversMock.mockResolvedValue(new Map([["driver-broken", true]]));

    const result = await proposeMatchesForRequest("req-1");

    expect(result).toBeNull();
    expect(dbMocks.match.create).not.toHaveBeenCalled();
    expect(openBreakdownForDriversMock).toHaveBeenCalledWith(["driver-broken"]);
  });

  it("still proposes a match when the driver has no open breakdown (unknown/no incident is not treated as a breakdown)", async () => {
    dbMocks.tripRequest.findUniqueOrThrow.mockResolvedValue({ ...request, status: "PENDING" });
    dbMocks.driverOffer.findMany.mockResolvedValue([makeOffer("offer-ok", "driver-ok")]);
    dbMocks.tripRequest.findUniqueOrThrow.mockResolvedValueOnce({ ...request, status: "PENDING" });
    openBreakdownForDriversMock.mockResolvedValue(new Map()); // no entry at all for driver-ok
    dbMocks.match.create.mockResolvedValue({ id: "match-1" });
    dbMocks.tripRequest.findUniqueOrThrow.mockResolvedValue({ ...request, status: "PENDING" });
    dbMocks.driverOffer.findUniqueOrThrow.mockResolvedValue(makeOffer("offer-ok", "driver-ok"));

    const result = await proposeMatchesForRequest("req-1");

    expect(result).not.toBeNull();
    expect(dbMocks.match.create).toHaveBeenCalledTimes(1);
  });

  it("prefers a non-broken offer over a broken one for the same request", async () => {
    dbMocks.tripRequest.findUniqueOrThrow.mockResolvedValue({ ...request, status: "PENDING" });
    dbMocks.driverOffer.findMany.mockResolvedValue([makeOffer("offer-broken", "driver-broken"), makeOffer("offer-ok", "driver-ok")]);
    openBreakdownForDriversMock.mockResolvedValue(new Map([["driver-broken", true]]));
    dbMocks.match.create.mockResolvedValue({ id: "match-1" });
    dbMocks.driverOffer.findUniqueOrThrow.mockResolvedValue(makeOffer("offer-ok", "driver-ok"));

    await proposeMatchesForRequest("req-1");

    expect(dbMocks.match.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ driverOfferId: "offer-ok" }) }));
  });
});

describe("proposeMatchesForOffer — operational eligibility filter", () => {
  const offer = makeOffer("offer-1", "driver-1");

  it("returns null when the offer's driver has a verified OPEN breakdown", async () => {
    dbMocks.driverOffer.findUniqueOrThrow.mockResolvedValue(offer);
    latestOpenBreakdownForDriverMock.mockResolvedValue({ hasOpenBreakdown: true });

    const result = await proposeMatchesForOffer("offer-1");

    expect(result).toBeNull();
    expect(dbMocks.tripRequest.findMany).not.toHaveBeenCalled();
    expect(latestOpenBreakdownForDriverMock).toHaveBeenCalledWith("driver-1");
  });

  it("does not reject a driver merely because ETA/breakdown data is simply absent", async () => {
    dbMocks.driverOffer.findUniqueOrThrow.mockResolvedValue(offer);
    latestOpenBreakdownForDriverMock.mockResolvedValue({ hasOpenBreakdown: false });
    dbMocks.tripRequest.findMany.mockResolvedValue([request]);
    dbMocks.match.create.mockResolvedValue({ id: "match-1" });
    dbMocks.tripRequest.findUniqueOrThrow.mockResolvedValue({ ...request, status: "PENDING" });

    const result = await proposeMatchesForOffer("offer-1");

    expect(result).not.toBeNull();
  });
});
