import { beforeEach, describe, expect, it, vi } from "vitest";

// Test 2 (spec s.15) — "supply arrives later": a passenger's TripRequest has
// no eligible driver yet, then a driver reports/creates matching supply.
// This must be a genuinely end-to-end proof that a real Match gets created —
// unlike src/lib/ingest.test.ts, which only asserts notifySupplyAvailable was
// *called* with mocked internals. Here only @/lib/db and the outbound
// messaging boundary are mocked; reportSupplyAvailable -> matchOffer ->
// proposeMatchesForOffer -> the real scoring engine (matching/engine.ts) and
// CRM Auto eligibility filter (crm-auto/bridge.ts) all run for real, so this
// is the only place in the suite that proves the whole "RT OFFICE informs
// RT Core, RT Core's one true MATCH engine reacts" loop actually connects.

const origin = { id: "stop-bishkek", corridorId: "cor-1", order: 0, nameRu: "Бишкек", nameKy: "Бишкек", nameEn: "Bishkek" };
const destination = { id: "stop-osh", corridorId: "cor-1", order: 10, nameRu: "Ош", nameKy: "Ош", nameEn: "Osh" };
const travelDate = new Date("2026-09-20T00:00:00.000Z");

const offerFixture = {
  id: "offer-1",
  driverId: "driver-1",
  origin,
  destination,
  travelDate,
  timeWindowStart: null,
  timeWindowEnd: null,
  seatsAvailable: 3,
  status: "OPEN",
  createdAt: new Date("2026-09-19T00:00:00.000Z"),
  driver: { status: "ACTIVE", preferredLang: "RU", telegramUserId: "tg-driver-1" },
};

const requestFixture = {
  id: "req-1",
  origin,
  destination,
  travelDate,
  timeWindowStart: null,
  timeWindowEnd: null,
  seats: 2,
  passenger: { whatsappId: "wa-pax-1", preferredLang: "RU" },
};

const { dbMocks, notifyDriverPrivatelyMock } = vi.hoisted(() => ({
  dbMocks: {
    driverOffer: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    match: {
      count: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    tripRequest: {
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    driveCrmEvent: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    auditLogEntry: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
  notifyDriverPrivatelyMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({ db: dbMocks }));
vi.mock("@/lib/mira/outbound", () => ({
  notifyDriverPrivately: notifyDriverPrivatelyMock,
  notifyPassengerText: vi.fn(),
  notifyPassengerWithConfirmButtons: vi.fn(),
  confirmDeclineKeyboard: vi.fn().mockReturnValue(undefined),
}));

import { reportSupplyAvailable } from "./supply-signal";

describe("reportSupplyAvailable — Test 2: supply arrives later (spec s.8/s.15)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.driveCrmEvent.findFirst.mockResolvedValue(null);
    dbMocks.driverOffer.findUnique.mockResolvedValue(offerFixture);
    dbMocks.driverOffer.findUniqueOrThrow.mockResolvedValue(offerFixture);
    dbMocks.match.count.mockResolvedValue(0);
    dbMocks.match.findMany.mockResolvedValue([]);
    dbMocks.tripRequest.findMany.mockResolvedValue([requestFixture]);
    dbMocks.tripRequest.findUniqueOrThrow.mockResolvedValue(requestFixture);
    dbMocks.match.create.mockResolvedValue({ id: "match-1", tripRequestId: "req-1", driverOfferId: "offer-1" });
  });

  it("re-triggers the real MATCH engine and actually creates a Match once eligible demand exists", async () => {
    const outcome = await reportSupplyAvailable({ offerId: "offer-1", reportedBy: "DRIVER_REPORT" });

    expect(outcome).toEqual({ offerId: "offer-1", rematchTriggered: true, matchId: "match-1" });
    expect(dbMocks.match.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tripRequestId: "req-1", driverOfferId: "offer-1", status: "AWAITING_DRIVER" }) }),
    );
    expect(dbMocks.tripRequest.update).toHaveBeenCalledWith({ where: { id: "req-1" }, data: { status: "MATCHING" } });
    expect(notifyDriverPrivatelyMock).toHaveBeenCalledWith("tg-driver-1", expect.any(String), undefined);
    expect(dbMocks.auditLogEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "rt_office.supply_reported", details: expect.objectContaining({ matchId: "match-1" }) }) }),
    );
  });

  it("honestly reports no rematch when the offer has no eligible demand yet (no candidate requests)", async () => {
    dbMocks.tripRequest.findMany.mockResolvedValue([]);

    const outcome = await reportSupplyAvailable({ offerId: "offer-1", reportedBy: "DRIVER_REPORT" });

    expect(outcome).toEqual({ offerId: "offer-1", rematchTriggered: false, matchId: null });
    expect(dbMocks.match.create).not.toHaveBeenCalled();
  });

  it("never re-triggers matching for an offer that is no longer OPEN/PARTIALLY_FILLED (e.g. already FULL)", async () => {
    dbMocks.driverOffer.findUnique.mockResolvedValue({ ...offerFixture, status: "FULL" });

    const outcome = await reportSupplyAvailable({ offerId: "offer-1", reportedBy: "SYSTEM" });

    expect(outcome).toEqual({ offerId: "offer-1", rematchTriggered: false, matchId: null });
    expect(dbMocks.match.count).not.toHaveBeenCalled();
    expect(dbMocks.match.create).not.toHaveBeenCalled();
  });

  it("s.9 operational eligibility: never proposes a driver with a currently OPEN verified breakdown, even though their offer is otherwise a perfect match", async () => {
    dbMocks.driveCrmEvent.findFirst.mockImplementation(({ where }: { where: { eventType: string } }) =>
      where.eventType === "BREAKDOWN_INCIDENT" ? Promise.resolve({ id: "evt-1", driverId: "driver-1", incidentStatus: "OPEN" }) : Promise.resolve(null),
    );

    const outcome = await reportSupplyAvailable({ offerId: "offer-1", reportedBy: "DRIVER_REPORT" });

    expect(outcome).toEqual({ offerId: "offer-1", rematchTriggered: false, matchId: null });
    expect(dbMocks.match.create).not.toHaveBeenCalled();
  });
});
