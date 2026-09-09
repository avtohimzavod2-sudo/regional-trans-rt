import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression coverage for the RT OFFICE / Drive CRM pass's "seat
// double-booking is structurally protected" + "idempotent against
// duplicate webhook/event delivery" requirements. handlePassengerResponse
// previously read-then-wrote seatsAvailable non-atomically and checked its
// idempotency guard before the confirming transaction committed, which left
// a real race for concurrent/duplicate delivery of the same passenger
// response. This file did not exist before this pass — orchestrate.ts had
// zero test coverage.

const matchRecord = {
  id: "match-1",
  status: "AWAITING_PASSENGER",
  tripRequestId: "req-1",
  driverOfferId: "offer-1",
  driverOffer: {
    driverId: "driver-1",
    driver: { preferredLang: "RU", telegramUserId: "tg-driver-1", phone: null, name: "Driver", carModel: null, carPlate: null },
  },
  tripRequest: {
    passenger: { whatsappId: "wa-pax-1", preferredLang: "RU", phone: null, name: "Pax" },
    pickupPoint: "Point A",
  },
};

const requestRecord = {
  id: "req-1",
  passengerId: "pax-1",
  seats: 2,
  passenger: { whatsappId: "wa-pax-1", preferredLang: "RU", phone: null, name: "Pax" },
};

// vi.mock factories are hoisted above regular top-level statements, so
// anything a factory closes over must itself be created via vi.hoisted() —
// a plain `const dbMocks = {...}` above the vi.mock call would still throw
// a TDZ ReferenceError at module-eval time.
const { dbMocks, logActionMock, sendTelegramMessageMock, sendWhatsAppTextMock, sendWhatsAppConfirmButtonsMock, assertSafeToRevealMock, openSupportCaseMock } =
  vi.hoisted(() => ({
    dbMocks: {
      match: {
        findUniqueOrThrow: vi.fn(),
        updateMany: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0),
      },
      tripRequest: {
        update: vi.fn().mockResolvedValue({}),
        findUniqueOrThrow: vi.fn(),
      },
      driverOffer: {
        updateMany: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      trip: {
        create: vi.fn(),
      },
    },
    logActionMock: vi.fn().mockResolvedValue(undefined),
    sendTelegramMessageMock: vi.fn().mockResolvedValue(undefined),
    sendWhatsAppTextMock: vi.fn().mockResolvedValue(undefined),
    sendWhatsAppConfirmButtonsMock: vi.fn().mockResolvedValue(undefined),
    assertSafeToRevealMock: vi.fn().mockResolvedValue({ allowed: true }),
    openSupportCaseMock: vi.fn().mockResolvedValue({}),
  }));

vi.mock("@/lib/db", () => ({ db: dbMocks }));
vi.mock("@/lib/audit", () => ({ logAction: logActionMock }));
// orchestrate.ts routes its driver/passenger sends through Mira's outbound
// boundary (spec s.11) rather than the raw messaging adapters directly, so
// this is the module under test's actual import target now.
vi.mock("@/lib/mira/outbound", () => ({
  notifyDriverPrivately: sendTelegramMessageMock,
  notifyPassengerText: sendWhatsAppTextMock,
  notifyPassengerWithConfirmButtons: sendWhatsAppConfirmButtonsMock,
  confirmDeclineKeyboard: vi.fn(),
}));
vi.mock("@/lib/agents/trust", () => ({ assertSafeToReveal: assertSafeToRevealMock }));
vi.mock("@/lib/agents/support", () => ({ openSupportCase: openSupportCaseMock }));
vi.mock("@/lib/agents/pay", () => ({
  chargeCommissionForTrip: vi.fn(),
  CommissionAlreadyChargedError: class CommissionAlreadyChargedError extends Error {},
}));

import { messages } from "@/lib/i18n/messages";
import { handleDriverResponse, handlePassengerResponse } from "./orchestrate";

describe("handlePassengerResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.match.findUniqueOrThrow.mockResolvedValue(matchRecord);
    dbMocks.match.update.mockResolvedValue({});
    dbMocks.match.count.mockResolvedValue(0);
    dbMocks.tripRequest.update.mockResolvedValue({});
    dbMocks.tripRequest.findUniqueOrThrow.mockResolvedValue(requestRecord);
    dbMocks.driverOffer.findUniqueOrThrow.mockResolvedValue({ id: "offer-1", seatsAvailable: 1, status: "PARTIALLY_FILLED" });
    dbMocks.driverOffer.update.mockResolvedValue({});
    dbMocks.trip.create.mockResolvedValue({ id: "trip-1" });
    assertSafeToRevealMock.mockResolvedValue({ allowed: true });
  });

  it("confirms once, atomically decrements seats, and creates a Trip", async () => {
    dbMocks.match.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.driverOffer.updateMany.mockResolvedValue({ count: 1 });

    await handlePassengerResponse("match-1", true);

    expect(dbMocks.match.updateMany).toHaveBeenCalledWith({
      where: { id: "match-1", status: "AWAITING_PASSENGER" },
      data: expect.objectContaining({ status: "CONFIRMED" }),
    });
    expect(dbMocks.driverOffer.updateMany).toHaveBeenCalledWith({
      where: { id: "offer-1", seatsAvailable: { gte: 2 } },
      data: { seatsAvailable: { decrement: 2 } },
    });
    expect(dbMocks.trip.create).toHaveBeenCalledTimes(1);
    expect(openSupportCaseMock).not.toHaveBeenCalled();
  });

  it("treats a duplicate confirm delivery as a safe no-op once another call already advanced the match", async () => {
    // Simulates two concurrent/duplicate webhook deliveries: the initial
    // guard read still observes AWAITING_PASSENGER (stale), but by the time
    // this call's updateMany runs, the other delivery has already won.
    dbMocks.match.updateMany.mockResolvedValue({ count: 0 });

    await handlePassengerResponse("match-1", true);

    expect(dbMocks.tripRequest.update).not.toHaveBeenCalled();
    expect(dbMocks.driverOffer.updateMany).not.toHaveBeenCalled();
    expect(dbMocks.trip.create).not.toHaveBeenCalled();
  });

  it("opens a support case instead of overbooking when seats are exhausted by a concurrent confirmation", async () => {
    dbMocks.match.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.driverOffer.updateMany.mockResolvedValue({ count: 0 });

    await handlePassengerResponse("match-1", true);

    expect(openSupportCaseMock).toHaveBeenCalledTimes(1);
    expect(logActionMock).toHaveBeenCalledWith(expect.objectContaining({ action: "match.seat_decrement_failed" }));
    expect(dbMocks.trip.create).not.toHaveBeenCalled();
  });

  it("treats a duplicate decline delivery as a safe no-op once another call already advanced the match", async () => {
    dbMocks.match.updateMany.mockResolvedValue({ count: 0 });

    await handlePassengerResponse("match-1", false);

    expect(dbMocks.tripRequest.update).not.toHaveBeenCalled();
    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
    expect(dbMocks.match.count).not.toHaveBeenCalled();
  });

  it("returns the current row without any side effects once the match is no longer AWAITING_PASSENGER", async () => {
    dbMocks.match.findUniqueOrThrow.mockResolvedValue({ ...matchRecord, status: "CONFIRMED" });

    const result = await handlePassengerResponse("match-1", true);

    expect(result.status).toBe("CONFIRMED");
    expect(dbMocks.match.updateMany).not.toHaveBeenCalled();
    expect(dbMocks.driverOffer.updateMany).not.toHaveBeenCalled();
  });

  // Test 6 (spec s.15) — the normal, non-duplicate first-decline path: unlike
  // the "duplicate delivery" test above (which stubs updateMany.count = 0 to
  // simulate a delivery that lost the race), this is the single/first
  // delivery that actually wins the atomic guard (count = 1) and must run
  // every real side effect exactly once.
  it("Test 6 — passenger declines: resets the request to PENDING, notifies the driver, and re-triggers matching", async () => {
    dbMocks.match.updateMany.mockResolvedValue({ count: 1 });

    await handlePassengerResponse("match-1", false);

    expect(dbMocks.tripRequest.update).toHaveBeenCalledWith({ where: { id: "req-1" }, data: { status: "PENDING" } });
    expect(logActionMock).toHaveBeenCalledWith(expect.objectContaining({ action: "match.declined_by_passenger", entityId: "match-1" }));
    expect(sendTelegramMessageMock).toHaveBeenCalledWith("tg-driver-1", messages.declinedTryNext.RU);
    // proposeMatchesForRequest re-runs the real MATCH engine (no parallel
    // engine, no duplicate TripRequest/Match) — its first read is the
    // active-match guard against the same tripRequestId.
    expect(dbMocks.match.count).toHaveBeenCalledWith({ where: { tripRequestId: "req-1", status: { in: expect.arrayContaining(["AWAITING_DRIVER"]) } } });
  });
});

// Spec s.15 Test 4/Test 5 — handleDriverResponse had zero dedicated test
// coverage before this pass, despite being the entrypoint Telegram's
// accept/decline keyboard callback drives.
const driverResponseMatchRecord = {
  id: "match-2",
  status: "AWAITING_DRIVER",
  tripRequestId: "req-2",
  driverOfferId: "offer-2",
  tripRequest: {
    origin: { nameRu: "Бишкек", nameKy: "Бишкек", nameEn: "Bishkek" },
    destination: { nameRu: "Ош", nameKy: "Ош", nameEn: "Osh" },
    passenger: { whatsappId: "wa-pax-2", preferredLang: "RU" },
    travelDate: new Date("2026-09-20T00:00:00+06:00"),
  },
  driverOffer: {
    driver: { telegramUserId: "tg-driver-2", preferredLang: "RU" },
  },
};

describe("handleDriverResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.match.findUniqueOrThrow.mockResolvedValue(driverResponseMatchRecord);
    dbMocks.match.update.mockResolvedValue({});
    dbMocks.match.count.mockResolvedValue(0);
    dbMocks.tripRequest.update.mockResolvedValue({});
    // Status deliberately outside {PENDING, MATCHING} so proposeMatchesForRequest's
    // re-trigger exits cleanly right after the active-match guard we assert on,
    // without needing to also stub the downstream offer-candidate query.
    dbMocks.tripRequest.findUniqueOrThrow.mockResolvedValue({ id: "req-2", status: "CONFIRMED" });
  });

  it("Test 4 — driver declines: marks the match DECLINED_BY_DRIVER and re-triggers matching for the same request, never a new one", async () => {
    const updated = await handleDriverResponse("match-2", false);

    expect(dbMocks.match.update).toHaveBeenCalledWith({
      where: { id: "match-2" },
      data: expect.objectContaining({ status: "DECLINED_BY_DRIVER" }),
    });
    expect(logActionMock).toHaveBeenCalledWith(expect.objectContaining({ action: "match.declined_by_driver", entityId: "match-2" }));
    // proposeMatchesForRequest is the real, single MATCH engine (no parallel
    // engine) — its first read is the active-match guard for this request.
    expect(dbMocks.match.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tripRequestId: "req-2" }) }));
    expect(sendWhatsAppConfirmButtonsMock).not.toHaveBeenCalled();
    expect(updated).toEqual({});
  });

  it("Test 5 — driver accepts: moves the match to AWAITING_PASSENGER and asks the passenger to confirm", async () => {
    dbMocks.match.update.mockResolvedValue({ ...driverResponseMatchRecord, status: "AWAITING_PASSENGER" });

    const updated = await handleDriverResponse("match-2", true);

    expect(dbMocks.match.update).toHaveBeenCalledWith({
      where: { id: "match-2" },
      data: expect.objectContaining({ status: "AWAITING_PASSENGER" }),
    });
    expect(sendWhatsAppConfirmButtonsMock).toHaveBeenCalledWith(
      "wa-pax-2",
      expect.any(String),
      "match-2",
    );
    expect(logActionMock).toHaveBeenCalledWith(expect.objectContaining({ action: "match.confirmed_by_driver", entityId: "match-2" }));
    expect(updated.status).toBe("AWAITING_PASSENGER");
  });

  it("returns the current row without side effects once the match is no longer AWAITING_DRIVER", async () => {
    dbMocks.match.findUniqueOrThrow.mockResolvedValue({ ...driverResponseMatchRecord, status: "DECLINED_BY_DRIVER" });

    const result = await handleDriverResponse("match-2", true);

    expect(result.status).toBe("DECLINED_BY_DRIVER");
    expect(dbMocks.match.update).not.toHaveBeenCalled();
    expect(sendWhatsAppConfirmButtonsMock).not.toHaveBeenCalled();
  });
});
