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
const {
  dbMocks,
  logActionMock,
  sendTelegramMessageMock,
  sendWhatsAppTextMock,
  sendWhatsAppConfirmButtonsMock,
  assertSafeToRevealMock,
  openSupportCaseMock,
  passengerLoopMocks,
  openBreakdownForDriversMock,
  latestOpenBreakdownForDriverMock,
} = vi.hoisted(() => {
    const dbMocks = {
      match: {
        findUniqueOrThrow: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      },
      tripRequest: {
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn(),
      },
      driverOffer: {
        updateMany: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn(),
      },
      trip: {
        create: vi.fn(),
        updateMany: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      // proposeToDriver wraps its re-check-then-create in a transaction
      // (defense in depth against the offer-double-hold race) — the mock
      // just runs the callback against the same mocked db.
      $transaction: vi.fn(async (fn: (tx: typeof dbMocks) => unknown) => fn(dbMocks)),
    };
    return {
      dbMocks,
      logActionMock: vi.fn().mockResolvedValue(undefined),
      sendTelegramMessageMock: vi.fn().mockResolvedValue(undefined),
      sendWhatsAppTextMock: vi.fn().mockResolvedValue(undefined),
      sendWhatsAppConfirmButtonsMock: vi.fn().mockResolvedValue(undefined),
      assertSafeToRevealMock: vi.fn().mockResolvedValue({ allowed: true }),
      openSupportCaseMock: vi.fn().mockResolvedValue({}),
      // Default: no PassengerLoopRun exists for the tripRequestId under test,
      // so every `if (loopRun)` guard at orchestrate.ts's new hook points is
      // skipped and none of these mocks fire — existing tests below stay
      // byte-for-byte unaffected by the loop's addition. Dedicated tests for
      // the wiring itself override getLoopRunByTripRequestId per-case.
      passengerLoopMocks: {
        getLoopRunByTripRequestId: vi.fn().mockResolvedValue(null),
        recordDriverDeclined: vi.fn().mockResolvedValue({}),
        recordOfferReady: vi.fn().mockResolvedValue({}),
        recordOfferSent: vi.fn().mockResolvedValue({}),
        recordPassengerAccepted: vi.fn().mockResolvedValue({}),
        recordPassengerDeclined: vi.fn().mockResolvedValue({}),
        recordOfferInvalidatedBySeatRace: vi.fn().mockResolvedValue({}),
        cancelPassengerLoop: vi.fn().mockResolvedValue(null),
      },
      // CRM Auto's operational-eligibility boundary (spec: "CRM Auto stores
      // the driver operational contour") — proposeMatchesForRequest consults
      // this before the pure scoring engine. Defaults to "no open breakdown
      // anywhere" so every pre-existing test (none of which ever reach past
      // the request.status guard) stays unaffected; the one wiring test that
      // genuinely drives a full rematch through the real engine overrides it.
      openBreakdownForDriversMock: vi.fn().mockResolvedValue(new Map()),
      latestOpenBreakdownForDriverMock: vi.fn().mockResolvedValue({ hasOpenBreakdown: false }),
    };
  });

vi.mock("@/lib/db", () => ({ db: dbMocks }));
vi.mock("@/lib/rt-office/passenger-loop", () => passengerLoopMocks);
vi.mock("@/lib/audit", () => ({ logAction: logActionMock }));
vi.mock("@/lib/crm-auto/bridge", () => ({
  openBreakdownForDrivers: openBreakdownForDriversMock,
  latestOpenBreakdownForDriver: latestOpenBreakdownForDriverMock,
}));
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
import { CANCEL_REASON } from "./booking-state";
import {
  cancelPendingDemand,
  cancelTrip,
  handleDriverBreakdown,
  handleDriverResponse,
  handlePassengerResponse,
  markTripCompletedByDriverReport,
  markTripDeparted,
  setDriverReportedSeatsAvailable,
} from "./orchestrate";

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

  it("Test 3/17 — never overbooks when seats are exhausted by a concurrent confirmation, and automatically self-heals by rematching instead of waiting on a human", async () => {
    dbMocks.match.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.driverOffer.updateMany.mockResolvedValue({ count: 0 });

    await handlePassengerResponse("match-1", true);

    // The dangling CONFIRMED Match is unwound to CANCELLED (CAS-guarded, so
    // this can only ever happen once) with a SEAT_UNAVAILABLE reason...
    expect(dbMocks.match.updateMany).toHaveBeenCalledWith({
      where: { id: "match-1", status: "CONFIRMED" },
      data: expect.objectContaining({ status: "CANCELLED" }),
    });
    expect(logActionMock).toHaveBeenCalledWith(expect.objectContaining({ action: "match.seat_decrement_failed" }));
    // ...the demand goes back up for search rather than being left dangling...
    expect(dbMocks.tripRequest.update).toHaveBeenCalledWith({ where: { id: "req-1" }, data: { status: "PENDING" } });
    // ...and no Trip/booking is ever created off the back of a failed hold.
    expect(dbMocks.trip.create).not.toHaveBeenCalled();
    expect(openSupportCaseMock).not.toHaveBeenCalled();
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

describe("handlePassengerResponse — passenger loop wiring", () => {
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
    passengerLoopMocks.getLoopRunByTripRequestId.mockResolvedValue({ id: "loop-1" });
  });

  it("terminal acceptance records PASSENGER_ACCEPTED on the loop (spec A)", async () => {
    dbMocks.match.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.driverOffer.updateMany.mockResolvedValue({ count: 1 });

    await handlePassengerResponse("match-1", true);

    expect(passengerLoopMocks.recordPassengerAccepted).toHaveBeenCalledWith(expect.anything(), "loop-1", "match-1");
  });

  it("does not touch the loop when no PassengerLoopRun exists for this TripRequest (pre-loop-feature demand)", async () => {
    passengerLoopMocks.getLoopRunByTripRequestId.mockResolvedValue(null);
    dbMocks.match.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.driverOffer.updateMany.mockResolvedValue({ count: 1 });

    await handlePassengerResponse("match-1", true);

    expect(passengerLoopMocks.recordPassengerAccepted).not.toHaveBeenCalled();
  });

  it("Test 3/17 — seat race loss invalidates the loop offer and rematches into a fresh OFFER_READY (spec F)", async () => {
    dbMocks.match.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.driverOffer.updateMany.mockResolvedValue({ count: 0 });
    // proposeMatchesForRequest re-reads db.match.findMany for exclusion sets and
    // db.driverOffer.findUniqueOrThrow for candidate scoring; letting it fall
    // through to its own "no candidate" path keeps this test focused on the
    // loop bookkeeping rather than the matching engine's internals.
    dbMocks.match.count.mockResolvedValue(1); // active match already exists -> proposeMatchesForRequest bails with null

    await handlePassengerResponse("match-1", true);

    expect(passengerLoopMocks.recordOfferInvalidatedBySeatRace).toHaveBeenCalledWith(expect.anything(), "loop-1", "match-1", false);
    expect(passengerLoopMocks.recordOfferReady).not.toHaveBeenCalled();
  });

  it("Test 6 — passenger decline records PASSENGER_DECLINED then OFFER_READY when a next candidate is found", async () => {
    // proposeMatchesForRequest/proposeToDriver never call db.match.findFirst —
    // their real call chain is hasActiveMatch (match.count) ->
    // tripRequest.findUniqueOrThrow -> driverOffer.findMany ->
    // openBreakdownForDrivers -> the pure scoring engine -> proposeToDriver's
    // own transaction. A genuine "next candidate found" scenario has to flow
    // through that real chain, not stub a function it never calls.
    const rematchRequest = {
      id: "req-1",
      status: "PENDING",
      seats: 1,
      travelDate: new Date("2026-09-20T00:00:00+06:00"),
      timeWindowStart: null,
      timeWindowEnd: null,
      origin: { id: "o1", corridorId: "corridor-1", order: 0, nameRu: "А", nameKy: "А", nameEn: "A" },
      destination: { id: "d1", corridorId: "corridor-1", order: 10, nameRu: "Б", nameKy: "Б", nameEn: "B" },
      passenger: { whatsappId: "wa-pax-1", preferredLang: "RU" },
    };
    const rematchOffer = {
      id: "offer-next",
      driverId: "driver-next",
      driver: { status: "ACTIVE", category: "REGULAR" },
      origin: { id: "o1", corridorId: "corridor-1", order: 0 },
      destination: { id: "d1", corridorId: "corridor-1", order: 10 },
      travelDate: rematchRequest.travelDate,
      timeWindowStart: null,
      timeWindowEnd: null,
      seatsAvailable: 2,
      status: "OPEN",
      createdAt: new Date("2026-09-01T00:00:00Z"),
    };

    dbMocks.match.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.match.count.mockResolvedValue(0); // no active match anywhere -> both hasActiveMatch checks pass
    dbMocks.tripRequest.findUniqueOrThrow.mockResolvedValue(rematchRequest);
    dbMocks.driverOffer.findMany.mockResolvedValue([rematchOffer]);
    dbMocks.driverOffer.findUniqueOrThrow.mockResolvedValue({
      id: "offer-next",
      seatsAvailable: 2,
      status: "OPEN",
      driver: { preferredLang: "RU", telegramUserId: "tg-driver-x" },
    });
    dbMocks.match.create.mockResolvedValue({
      id: "match-next",
      tripRequestId: "req-1",
      driverOfferId: "offer-next",
      status: "AWAITING_DRIVER",
    });

    await handlePassengerResponse("match-1", false);

    expect(passengerLoopMocks.recordPassengerDeclined).toHaveBeenCalledWith(expect.anything(), "loop-1", "match-1", true);
    expect(passengerLoopMocks.recordOfferReady).toHaveBeenCalledWith(expect.anything(), "loop-1", "match-next", "offer-next");
  });

  it("passenger decline with no next candidate records PASSENGER_DECLINED without a spurious OFFER_READY", async () => {
    dbMocks.match.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.match.count.mockResolvedValue(1); // active match guard makes proposeMatchesForRequest bail with null

    await handlePassengerResponse("match-1", false);

    expect(passengerLoopMocks.recordPassengerDeclined).toHaveBeenCalledWith(expect.anything(), "loop-1", "match-1", false);
    expect(passengerLoopMocks.recordOfferReady).not.toHaveBeenCalled();
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
    dbMocks.match.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.match.count.mockResolvedValue(0);
    dbMocks.tripRequest.update.mockResolvedValue({});
    // Status deliberately outside {PENDING, MATCHING} so proposeMatchesForRequest's
    // re-trigger exits cleanly right after the active-match guard we assert on,
    // without needing to also stub the downstream offer-candidate query.
    dbMocks.tripRequest.findUniqueOrThrow.mockResolvedValue({ id: "req-2", status: "CONFIRMED" });
  });

  it("Test 4 — driver declines: marks the match DECLINED_BY_DRIVER (CAS-guarded) and re-triggers matching for the same request, never a new one", async () => {
    const updated = await handleDriverResponse("match-2", false);

    expect(dbMocks.match.updateMany).toHaveBeenCalledWith({
      where: { id: "match-2", status: "AWAITING_DRIVER" },
      data: expect.objectContaining({ status: "DECLINED_BY_DRIVER" }),
    });
    expect(logActionMock).toHaveBeenCalledWith(expect.objectContaining({ action: "match.declined_by_driver", entityId: "match-2" }));
    // proposeMatchesForRequest is the real, single MATCH engine (no parallel
    // engine) — its first read is the active-match guard for this request.
    expect(dbMocks.match.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tripRequestId: "req-2" }) }));
    expect(sendWhatsAppConfirmButtonsMock).not.toHaveBeenCalled();
    expect(updated).toEqual(driverResponseMatchRecord);
  });

  it("Test 4b — a lost CAS race (match already settled elsewhere) is a clean no-op, not a duplicate decline", async () => {
    dbMocks.match.updateMany.mockResolvedValue({ count: 0 });

    await handleDriverResponse("match-2", false);

    expect(logActionMock).not.toHaveBeenCalledWith(expect.objectContaining({ action: "match.declined_by_driver" }));
  });

  it("Test 5 — driver accepts: moves the match to AWAITING_PASSENGER (CAS-guarded) and asks the passenger to confirm", async () => {
    dbMocks.match.findUniqueOrThrow
      .mockResolvedValueOnce(driverResponseMatchRecord)
      .mockResolvedValueOnce({ ...driverResponseMatchRecord, status: "AWAITING_PASSENGER" });

    const updated = await handleDriverResponse("match-2", true);

    expect(dbMocks.match.updateMany).toHaveBeenCalledWith({
      where: { id: "match-2", status: "AWAITING_DRIVER" },
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
    expect(dbMocks.match.updateMany).not.toHaveBeenCalled();
    expect(sendWhatsAppConfirmButtonsMock).not.toHaveBeenCalled();
  });

  it("Test 2 — double ACCEPT from the same driver: the second call is a safe no-op, never re-sending the passenger confirmation twice", async () => {
    dbMocks.match.findUniqueOrThrow
      .mockResolvedValueOnce(driverResponseMatchRecord) // 1st ACCEPT's initial read: still AWAITING_DRIVER
      .mockResolvedValueOnce({ ...driverResponseMatchRecord, status: "AWAITING_PASSENGER" }) // 1st ACCEPT's final re-read
      .mockResolvedValueOnce({ ...driverResponseMatchRecord, status: "AWAITING_PASSENGER" }); // 2nd ACCEPT's initial read: already advanced

    await handleDriverResponse("match-2", true);
    await handleDriverResponse("match-2", true);

    expect(dbMocks.match.updateMany).toHaveBeenCalledTimes(1);
    expect(sendWhatsAppConfirmButtonsMock).toHaveBeenCalledTimes(1);
  });
});

describe("handleDriverResponse — passenger loop wiring (spec K)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.match.findUniqueOrThrow.mockResolvedValue(driverResponseMatchRecord);
    dbMocks.match.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.match.count.mockResolvedValue(0);
    dbMocks.tripRequest.update.mockResolvedValue({});
    dbMocks.tripRequest.findUniqueOrThrow.mockResolvedValue({ id: "req-2", status: "CONFIRMED" });
    passengerLoopMocks.getLoopRunByTripRequestId.mockResolvedValue({ id: "loop-1" });
  });

  it("driver decline with no next candidate records DRIVER_DECLINED without a spurious OFFER_READY", async () => {
    await handleDriverResponse("match-2", false);

    expect(passengerLoopMocks.recordDriverDeclined).toHaveBeenCalledWith(expect.anything(), "loop-1", "match-2", false);
    expect(passengerLoopMocks.recordOfferReady).not.toHaveBeenCalled();
  });

  it("driver decline records DRIVER_DECLINED then OFFER_READY when a next candidate is genuinely found", async () => {
    // Same real-engine fixture shape as the handlePassengerResponse decline
    // wiring test above — proposeMatchesForRequest/proposeToDriver's real
    // call chain has to actually produce a match, not a stubbed shortcut.
    const rematchRequest = {
      id: "req-2",
      status: "PENDING",
      seats: 1,
      travelDate: new Date("2026-09-20T00:00:00+06:00"),
      timeWindowStart: null,
      timeWindowEnd: null,
      origin: { id: "o1", corridorId: "corridor-1", order: 0, nameRu: "А", nameKy: "А", nameEn: "A" },
      destination: { id: "d1", corridorId: "corridor-1", order: 10, nameRu: "Б", nameKy: "Б", nameEn: "B" },
      passenger: { whatsappId: "wa-pax-2", preferredLang: "RU" },
    };
    const rematchOffer = {
      id: "offer-next",
      driverId: "driver-next",
      driver: { status: "ACTIVE", category: "REGULAR" },
      origin: { id: "o1", corridorId: "corridor-1", order: 0 },
      destination: { id: "d1", corridorId: "corridor-1", order: 10 },
      travelDate: rematchRequest.travelDate,
      timeWindowStart: null,
      timeWindowEnd: null,
      seatsAvailable: 2,
      status: "OPEN",
      createdAt: new Date("2026-09-01T00:00:00Z"),
    };

    dbMocks.tripRequest.findUniqueOrThrow.mockResolvedValue(rematchRequest);
    dbMocks.driverOffer.findMany.mockResolvedValue([rematchOffer]);
    dbMocks.driverOffer.findUniqueOrThrow.mockResolvedValue({
      id: "offer-next",
      seatsAvailable: 2,
      status: "OPEN",
      driver: { preferredLang: "RU", telegramUserId: "tg-driver-x" },
    });
    dbMocks.match.create.mockResolvedValue({
      id: "match-next",
      tripRequestId: "req-2",
      driverOfferId: "offer-next",
      status: "AWAITING_DRIVER",
    });

    await handleDriverResponse("match-2", false);

    expect(passengerLoopMocks.recordDriverDeclined).toHaveBeenCalledWith(expect.anything(), "loop-1", "match-2", true);
    expect(passengerLoopMocks.recordOfferReady).toHaveBeenCalledWith(expect.anything(), "loop-1", "match-next", "offer-next");
  });

  it("does not touch the loop on decline when no PassengerLoopRun exists (pre-loop-feature demand)", async () => {
    passengerLoopMocks.getLoopRunByTripRequestId.mockResolvedValue(null);

    await handleDriverResponse("match-2", false);

    expect(passengerLoopMocks.recordDriverDeclined).not.toHaveBeenCalled();
    expect(passengerLoopMocks.recordOfferReady).not.toHaveBeenCalled();
  });

  it("driver accept records OFFER_SENT on the loop (spec A)", async () => {
    dbMocks.match.findUniqueOrThrow
      .mockResolvedValueOnce(driverResponseMatchRecord)
      .mockResolvedValueOnce({ ...driverResponseMatchRecord, status: "AWAITING_PASSENGER" });

    await handleDriverResponse("match-2", true);

    expect(passengerLoopMocks.recordOfferSent).toHaveBeenCalledWith(expect.anything(), "loop-1", "match-2");
  });

  it("does not touch the loop on accept when no PassengerLoopRun exists (pre-loop-feature demand)", async () => {
    passengerLoopMocks.getLoopRunByTripRequestId.mockResolvedValue(null);
    dbMocks.match.findUniqueOrThrow
      .mockResolvedValueOnce(driverResponseMatchRecord)
      .mockResolvedValueOnce({ ...driverResponseMatchRecord, status: "AWAITING_PASSENGER" });

    await handleDriverResponse("match-2", true);

    expect(passengerLoopMocks.recordOfferSent).not.toHaveBeenCalled();
  });
});

// Driver Live Signals / Telemetry — coverage for the three new exclusive
// Trip/DriverOffer mutation functions RT OFFICE's telemetry module calls
// into. Each guards its transition with an atomic, condition-scoped
// updateMany, so these tests exercise both the normal (first-delivery) path
// and the duplicate/out-of-order-delivery no-op path directly, without
// needing to go through the not-yet-written RT OFFICE orchestration layer.
describe("markTripDeparted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("transitions a SCHEDULED trip to IN_PROGRESS and logs the report", async () => {
    dbMocks.trip.updateMany.mockResolvedValue({ count: 1 });

    const result = await markTripDeparted("trip-1");

    expect(dbMocks.trip.updateMany).toHaveBeenCalledWith({
      where: { id: "trip-1", status: "SCHEDULED" },
      data: { status: "IN_PROGRESS" },
    });
    expect(logActionMock).toHaveBeenCalledWith(expect.objectContaining({ action: "trip.departed_reported_by_driver", entityId: "trip-1" }));
    expect(result).toEqual({ tripId: "trip-1", transitioned: true });
  });

  it("is a safe no-op for a duplicate or out-of-order departure report against a trip that is no longer SCHEDULED", async () => {
    dbMocks.trip.updateMany.mockResolvedValue({ count: 0 });

    const result = await markTripDeparted("trip-1");

    expect(logActionMock).not.toHaveBeenCalled();
    expect(result).toEqual({ tripId: "trip-1", transitioned: false });
  });
});

describe("setDriverReportedSeatsAvailable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bounds a driver-reported seat count to the vehicle's real capacity and updates status", async () => {
    dbMocks.driverOffer.findUniqueOrThrow.mockResolvedValue({ id: "offer-1", seatsTotal: 4, status: "FULL" });
    dbMocks.driverOffer.updateMany.mockResolvedValue({ count: 1 });

    const result = await setDriverReportedSeatsAvailable("offer-1", 99);

    expect(dbMocks.driverOffer.updateMany).toHaveBeenCalledWith({
      where: { id: "offer-1", status: { in: ["OPEN", "PARTIALLY_FILLED", "FULL"] } },
      data: { seatsAvailable: 4, status: "PARTIALLY_FILLED" },
    });
    expect(result).toEqual({ offerId: "offer-1", seatsAvailable: 4, updated: true });
  });

  it("never trusts a negative driver-reported count — floors at zero and marks the offer FULL", async () => {
    dbMocks.driverOffer.findUniqueOrThrow.mockResolvedValue({ id: "offer-1", seatsTotal: 4, status: "OPEN" });
    dbMocks.driverOffer.updateMany.mockResolvedValue({ count: 1 });

    const result = await setDriverReportedSeatsAvailable("offer-1", -3);

    expect(dbMocks.driverOffer.updateMany).toHaveBeenCalledWith({
      where: { id: "offer-1", status: { in: ["OPEN", "PARTIALLY_FILLED", "FULL"] } },
      data: { seatsAvailable: 0, status: "FULL" },
    });
    expect(result.seatsAvailable).toBe(0);
  });

  it("is a safe no-op once the offer is no longer open (CLOSED/CANCELLED)", async () => {
    dbMocks.driverOffer.findUniqueOrThrow.mockResolvedValue({ id: "offer-1", seatsTotal: 4, status: "OPEN" });
    dbMocks.driverOffer.updateMany.mockResolvedValue({ count: 0 });

    const result = await setDriverReportedSeatsAvailable("offer-1", 2);

    expect(logActionMock).not.toHaveBeenCalled();
    expect(result.updated).toBe(false);
  });
});

describe("markTripCompletedByDriverReport", () => {
  const tripWithOffer = {
    id: "trip-1",
    driverId: "driver-1",
    driverOffer: {
      destinationStopId: "stop-dest",
      originStopId: "stop-origin",
      travelDate: new Date("2026-09-20T00:00:00+06:00"),
      seatsTotal: 4,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.trip.findUniqueOrThrow.mockResolvedValue(tripWithOffer);
    dbMocks.driverOffer.create.mockResolvedValue({ id: "return-offer-1" });
    dbMocks.match.count.mockResolvedValue(0);
    // The return-leg offer's driver is deliberately not ACTIVE, so
    // proposeMatchesForOffer bails out immediately after the status checks —
    // this test is about markTripCompletedByDriverReport's own idempotency,
    // not re-matching, and must not need to also stub CRM Auto's breakdown
    // lookup (bridge.ts) just to reach that bail-out.
    dbMocks.driverOffer.findUniqueOrThrow.mockResolvedValue({
      id: "return-offer-1",
      status: "OPEN",
      driverId: "driver-1",
      driver: { status: "SUSPENDED" },
    });
  });

  it("claims a SCHEDULED/IN_PROGRESS trip exactly once, charges commission, and opens the return-leg offer", async () => {
    dbMocks.trip.updateMany.mockResolvedValue({ count: 1 });

    const result = await markTripCompletedByDriverReport("trip-1");

    expect(dbMocks.trip.updateMany).toHaveBeenCalledWith({
      where: { id: "trip-1", status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      data: expect.objectContaining({ status: "COMPLETED" }),
    });
    expect(dbMocks.driverOffer.create).toHaveBeenCalledTimes(1);
    expect(logActionMock).toHaveBeenCalledWith(expect.objectContaining({ action: "trip.completed", entityId: "trip-1" }));
    expect(result.alreadyCompleted).toBe(false);
    expect(result.returnOffer).toEqual({ id: "return-offer-1" });
  });

  it("is a safe no-op for a duplicate driver completion report — never creates a second return-leg offer", async () => {
    dbMocks.trip.updateMany.mockResolvedValue({ count: 0 });
    dbMocks.trip.findUniqueOrThrow.mockResolvedValue({ ...tripWithOffer, status: "COMPLETED" });

    const result = await markTripCompletedByDriverReport("trip-1");

    expect(dbMocks.driverOffer.create).not.toHaveBeenCalled();
    expect(logActionMock).not.toHaveBeenCalledWith(expect.objectContaining({ action: "trip.completed" }));
    expect(result).toEqual({ returnOffer: null, alreadyCompleted: true });
  });
});

describe("cancelPendingDemand — passenger loop wiring (spec L)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.match.findFirst.mockResolvedValue(null); // no active match to unwind for this demand
  });

  it("cancels the loop once the claim actually wins (spec: passenger cancels their own demand)", async () => {
    dbMocks.tripRequest.updateMany.mockResolvedValue({ count: 1 });

    const result = await cancelPendingDemand("req-1");

    expect(passengerLoopMocks.cancelPassengerLoop).toHaveBeenCalledWith(expect.anything(), "req-1");
    expect(result).toEqual({ tripRequestId: "req-1", cancelled: true });
  });

  it("never touches the loop when the claim loses — an already-terminal/nonexistent demand is a clean no-op", async () => {
    dbMocks.tripRequest.updateMany.mockResolvedValue({ count: 0 });

    const result = await cancelPendingDemand("req-1");

    expect(passengerLoopMocks.cancelPassengerLoop).not.toHaveBeenCalled();
    expect(result).toEqual({ tripRequestId: "req-1", cancelled: false });
  });
});

describe("cancelTrip", () => {
  const tripFixture = {
    id: "trip-1",
    matchId: "match-1",
    driverOfferId: "offer-1",
    seats: 2,
    driver: { telegramUserId: "tg-driver-1", preferredLang: "RU" },
    passenger: { whatsappId: "wa-pax-1", preferredLang: "RU" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.trip.findUniqueOrThrow.mockResolvedValue(tripFixture);
    // Released seats stay within capacity and the offer isn't FULL/CLOSED, so
    // the "clamp to capacity" branch inside cancelTrip never fires — keeps
    // these tests focused on the cancellation/rematch behavior itself.
    dbMocks.driverOffer.update.mockResolvedValue({ id: "offer-1", seatsAvailable: 2, seatsTotal: 4, status: "PARTIALLY_FILLED" });
    dbMocks.match.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.match.findUniqueOrThrow.mockResolvedValue({ id: "match-1", tripRequestId: "req-1" });
    dbMocks.tripRequest.update.mockResolvedValue({});
    dbMocks.match.count.mockResolvedValue(0);
    // Bails proposeMatchesForRequest's re-trigger out immediately after the
    // active-match guard — this describe block is about cancelTrip's own
    // behavior, not the downstream MATCH engine.
    dbMocks.tripRequest.findUniqueOrThrow.mockResolvedValue({ id: "req-1", status: "CONFIRMED" });
  });

  it("Test 9 — passenger cancellation releases the held seat back to the driver's offer, without resurrecting the passenger's own demand", async () => {
    dbMocks.trip.updateMany.mockResolvedValue({ count: 1 });

    const result = await cancelTrip("trip-1", "PASSENGER", CANCEL_REASON.PASSENGER_CANCELLED);

    expect(dbMocks.trip.updateMany).toHaveBeenCalledWith({
      where: { id: "trip-1", status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      data: expect.objectContaining({ status: "CANCELLED" }),
    });
    expect(dbMocks.driverOffer.update).toHaveBeenCalledWith({
      where: { id: "offer-1" },
      data: { seatsAvailable: { increment: 2 } },
    });
    expect(sendTelegramMessageMock).toHaveBeenCalledWith("tg-driver-1", messages.tripCancelledByPassengerForDriver.RU);
    // A passenger cancelling their own trip must not re-trigger a search for themselves.
    expect(dbMocks.tripRequest.update).not.toHaveBeenCalled();
    expect(sendWhatsAppTextMock).not.toHaveBeenCalled();
    expect(result).toEqual({ tripId: "trip-1", cancelled: true });
  });

  it("Test 8 — driver cancellation after BOOKED releases the seat and automatically re-searches a new driver for the stranded passenger", async () => {
    dbMocks.trip.updateMany.mockResolvedValue({ count: 1 });

    const result = await cancelTrip("trip-1", "DRIVER", CANCEL_REASON.DRIVER_CANCELLED);

    expect(dbMocks.driverOffer.update).toHaveBeenCalledWith({
      where: { id: "offer-1" },
      data: { seatsAvailable: { increment: 2 } },
    });
    expect(sendWhatsAppTextMock).toHaveBeenCalledWith("wa-pax-1", messages.tripCancelledByDriverForPassenger.RU);
    // The passenger did nothing wrong — their demand goes back to PENDING and
    // the real, single MATCH engine is re-triggered for the same request.
    expect(dbMocks.tripRequest.update).toHaveBeenCalledWith({ where: { id: "req-1" }, data: { status: "PENDING" } });
    expect(dbMocks.match.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tripRequestId: "req-1" }) }));
    expect(result).toEqual({ tripId: "trip-1", cancelled: true });
  });

  it("Test 20 — illegal state transition: cancelling a trip that is no longer SCHEDULED/IN_PROGRESS is a safe no-op, never a second seat release", async () => {
    // Simulates a duplicate/redelivered cancel (or a stale actor) racing
    // against a trip that already finished, or was already cancelled.
    dbMocks.trip.updateMany.mockResolvedValue({ count: 0 });

    const result = await cancelTrip("trip-1", "SYSTEM", CANCEL_REASON.BREAKDOWN);

    expect(dbMocks.driverOffer.update).not.toHaveBeenCalled();
    expect(logActionMock).not.toHaveBeenCalled();
    expect(dbMocks.tripRequest.update).not.toHaveBeenCalled();
    expect(result).toEqual({ tripId: "trip-1", cancelled: false });
  });
});

describe("handleDriverBreakdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.match.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.match.count.mockResolvedValue(0);
    dbMocks.tripRequest.update.mockResolvedValue({});
    dbMocks.tripRequest.findUniqueOrThrow.mockResolvedValue({ id: "req-x", status: "CONFIRMED" });
  });

  it("cancels every active Trip for the driver and every still-negotiating Match, rematching each affected demand", async () => {
    dbMocks.trip.findMany.mockResolvedValueOnce([{ id: "trip-1" }]); // activeTrips snapshot
    dbMocks.trip.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.trip.findUniqueOrThrow.mockResolvedValue({
      id: "trip-1",
      matchId: "match-1",
      driverOfferId: "offer-1",
      seats: 2,
      driver: { telegramUserId: "tg-driver-1", preferredLang: "RU" },
      passenger: { whatsappId: "wa-pax-1", preferredLang: "RU" },
    });
    dbMocks.driverOffer.update.mockResolvedValue({ id: "offer-1", seatsAvailable: 2, seatsTotal: 4, status: "PARTIALLY_FILLED" });
    dbMocks.match.findUniqueOrThrow.mockResolvedValue({ id: "match-1", tripRequestId: "req-1" });

    dbMocks.match.findMany.mockResolvedValueOnce([{ tripRequestId: "req-2" }]); // activeMatches snapshot
    dbMocks.match.findFirst.mockResolvedValueOnce({
      id: "match-2",
      status: "AWAITING_DRIVER",
      tripRequestId: "req-2",
      driverOffer: { driver: { preferredLang: "RU", telegramUserId: "tg-driver-1" } },
      tripRequest: { passenger: { whatsappId: "wa-pax-2", preferredLang: "RU" } },
    });

    const result = await handleDriverBreakdown("driver-1");

    expect(dbMocks.driverOffer.update).toHaveBeenCalledWith({
      where: { id: "offer-1" },
      data: { seatsAvailable: { increment: 2 } },
    });
    expect(sendTelegramMessageMock).toHaveBeenCalledWith("tg-driver-1", messages.pendingMatchCancelledForDriver.RU);
    expect(sendWhatsAppTextMock).toHaveBeenCalledWith("wa-pax-2", messages.driverBreakdownForPassenger.RU);
    // db.trip.findFirst (the race-compensation lookup) must not fire when the
    // match cancellation cleanly won its own CAS race.
    expect(dbMocks.trip.findFirst).not.toHaveBeenCalled();
    expect(result).toEqual({ cancelledTrips: 1, cancelledMatches: 1 });
  });

  it("Test 7 — a match still negotiating in the breakdown snapshot but that raced to a real Trip a moment later is cancelled too, never left silently active against a broken-down driver", async () => {
    dbMocks.trip.findMany.mockResolvedValueOnce([]); // nothing had become a Trip yet at the top-level snapshot
    dbMocks.match.findMany.mockResolvedValueOnce([{ tripRequestId: "req-3" }]); // still negotiating in this snapshot
    // cancelActiveMatchForTripRequest's own re-read loses: the match is no
    // longer in ACTIVE_MATCH_STATUSES because a passenger CONFIRM landed a
    // moment ago and turned it into a real Trip.
    dbMocks.match.findFirst.mockResolvedValueOnce(null);

    dbMocks.trip.findFirst.mockResolvedValueOnce({ id: "trip-race" });
    dbMocks.trip.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.trip.findUniqueOrThrow.mockResolvedValue({
      id: "trip-race",
      matchId: "match-3",
      driverOfferId: "offer-3",
      seats: 1,
      driver: { telegramUserId: "tg-driver-1", preferredLang: "RU" },
      passenger: { whatsappId: "wa-pax-3", preferredLang: "RU" },
    });
    dbMocks.driverOffer.update.mockResolvedValue({ id: "offer-3", seatsAvailable: 1, seatsTotal: 4, status: "PARTIALLY_FILLED" });
    dbMocks.match.findUniqueOrThrow.mockResolvedValue({ id: "match-3", tripRequestId: "req-3" });

    const result = await handleDriverBreakdown("driver-1");

    expect(dbMocks.trip.findFirst).toHaveBeenCalledWith({
      where: { driverId: "driver-1", match: { tripRequestId: "req-3" }, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
    });
    expect(dbMocks.trip.updateMany).toHaveBeenCalledWith({
      where: { id: "trip-race", status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      data: expect.objectContaining({ status: "CANCELLED" }),
    });
    expect(dbMocks.driverOffer.update).toHaveBeenCalledWith({
      where: { id: "offer-3" },
      data: { seatsAvailable: { increment: 1 } },
    });
    expect(sendWhatsAppTextMock).toHaveBeenCalledWith("wa-pax-3", messages.driverBreakdownForPassenger.RU);
    // Neither the top-level activeTrips snapshot nor the match-cancellation
    // CAS itself "won" here — the race-compensation branch is what caught it.
    expect(result).toEqual({ cancelledTrips: 0, cancelledMatches: 0 });
  });
});
