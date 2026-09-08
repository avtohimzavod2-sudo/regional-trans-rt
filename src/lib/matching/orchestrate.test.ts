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
vi.mock("@/lib/messaging/telegram", () => ({
  sendTelegramMessage: sendTelegramMessageMock,
  confirmDeclineKeyboard: vi.fn(),
}));
vi.mock("@/lib/messaging/whatsapp", () => ({
  sendWhatsAppText: sendWhatsAppTextMock,
  sendWhatsAppConfirmButtons: sendWhatsAppConfirmButtonsMock,
}));
vi.mock("@/lib/agents/trust", () => ({ assertSafeToReveal: assertSafeToRevealMock }));
vi.mock("@/lib/agents/support", () => ({ openSupportCase: openSupportCaseMock }));
vi.mock("@/lib/agents/pay", () => ({
  chargeCommissionForTrip: vi.fn(),
  CommissionAlreadyChargedError: class CommissionAlreadyChargedError extends Error {},
}));

import { handlePassengerResponse } from "./orchestrate";

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
});
