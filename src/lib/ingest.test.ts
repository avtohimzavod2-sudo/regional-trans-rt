import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { messages } from "@/lib/i18n/messages";

function p2002Error() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });
}

// Spec s.7 — REMOVE THE PILOT-ONLY INGEST ASSUMPTION: ingest.ts must no
// longer hardcode a single "bishkek-karakol" corridor. It should read every
// active corridor's stops, and resolve a matched stop back to a DB id using
// whichever corridor it actually came from — never silently mapping a real,
// non-pilot route onto the pilot corridor.
//
// Spec s.8 — RT OFFICE MUST PARTICIPATE IN THE REAL LOOP: ingest.ts must
// route both "no supply found yet" and "supply just became available"
// through RT OFFICE's existing entrypoints (resolveSupplyForDispatcher,
// notifySupplyAvailable) instead of calling matching/orchestrate.ts's
// proposeMatchesForOffer directly or leaving the demand-side gap unaudited.

const dbMocks = {
  corridor: { findMany: vi.fn() },
  stop: { findFirst: vi.fn() },
  passenger: { upsert: vi.fn() },
  driver: { upsert: vi.fn(), update: vi.fn() },
  tripRequest: { create: vi.fn(), findUniqueOrThrow: vi.fn() },
  driverOffer: { create: vi.fn(), findUniqueOrThrow: vi.fn() },
  rawMessage: { create: vi.fn(), upsert: vi.fn() },
};
vi.mock("@/lib/db", () => ({ db: dbMocks }));

const logActionMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/audit", () => ({ logAction: logActionMock }));

const extractTripMessageMock = vi.fn();
vi.mock("@/lib/nlp/extract", () => ({ extractTripMessage: extractTripMessageMock }));

const sendWhatsAppTextMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/messaging/whatsapp", () => ({ sendWhatsAppText: sendWhatsAppTextMock }));

const sendTelegramMessageMock = vi.fn().mockResolvedValue(undefined);
const sendTelegramDirectMessageMock = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/messaging/telegram", () => ({
  sendTelegramMessage: sendTelegramMessageMock,
  sendTelegramDirectMessage: sendTelegramDirectMessageMock,
}));

const proposeMatchesForRequestMock = vi.fn();
vi.mock("@/lib/matching/orchestrate", () => ({ proposeMatchesForRequest: proposeMatchesForRequestMock }));

const notifySupplyAvailableMock = vi.fn().mockResolvedValue({ offerId: "offer_1", rematchTriggered: false, matchId: null });
const resolveSupplyForDispatcherMock = vi.fn().mockResolvedValue({ tripRequestId: "req_1", hasCandidateSupply: false, candidates: [] });
vi.mock("@/lib/rt-office/orchestrator", () => ({
  notifySupplyAvailable: notifySupplyAvailableMock,
  resolveSupplyForDispatcher: resolveSupplyForDispatcherMock,
}));

const startPassengerDemandLoopMock = vi.fn().mockResolvedValue({ id: "loop_1", status: "SUPPLY_REQUESTED" });
const advanceLoopToMatchingMock = vi.fn().mockResolvedValue(undefined);
const recordOfferReadyMock = vi.fn().mockResolvedValue(undefined);
const recordNoSupplyMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/rt-office/passenger-loop", () => ({
  startPassengerDemandLoop: startPassengerDemandLoopMock,
  advanceLoopToMatching: advanceLoopToMatchingMock,
  recordOfferReady: recordOfferReadyMock,
  recordNoSupply: recordNoSupplyMock,
}));

const resolvePickupRouteFactsMock = vi.fn().mockResolvedValue({ ok: true, route: null });
vi.mock("@/lib/rt-office/route-facts", () => ({
  resolvePickupRouteFacts: resolvePickupRouteFactsMock,
}));

const logAgentActionMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/agents/trace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/trace")>();
  return { ...actual, logAgentAction: logAgentActionMock };
});

const { getActiveCorridorStops, ingestPassengerMessage, ingestDriverPrivateMessage, ingestAllowedGroupMessage } = await import("./ingest");

const BASE_EXTRACTION = {
  language: "RU" as const,
  originStopKey: null,
  destinationStopKey: null,
  travelDate: "2026-09-15",
  timeWindowStart: null,
  timeWindowEnd: null,
  seats: 2,
  luggage: null,
  pickupPoint: null,
  carInfo: null,
  confidence: 0.9,
};

function stopFixture(corridorKey: string, key: string, order: number) {
  return { key, nameRu: key, nameKy: key, nameEn: key, order, aliases: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.corridor.findMany.mockResolvedValue([]);
  dbMocks.passenger.upsert.mockResolvedValue({ id: "pax_1" });
  dbMocks.driver.upsert.mockResolvedValue({ id: "driver_1", status: "ACTIVE", carModel: null });
  proposeMatchesForRequestMock.mockResolvedValue(null);
  resolveSupplyForDispatcherMock.mockResolvedValue({ tripRequestId: "req_1", hasCandidateSupply: false, candidates: [] });
});

describe("getActiveCorridorStops (spec s.7)", () => {
  it("queries all active corridors, not a single hardcoded pilot corridor", async () => {
    dbMocks.corridor.findMany.mockResolvedValue([
      { key: "bishkek-karakol", stops: [stopFixture("bishkek-karakol", "bishkek", 1)] },
      { key: "osh-jalalabad", stops: [stopFixture("osh-jalalabad", "osh", 1)] },
    ]);

    const stops = await getActiveCorridorStops();

    expect(dbMocks.corridor.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
    expect(stops.map((s) => s.key)).toEqual(["bishkek-karakol:bishkek", "osh-jalalabad:osh"]);
  });

  it("disambiguates a stop key that is reused across two different corridors", async () => {
    dbMocks.corridor.findMany.mockResolvedValue([
      { key: "bishkek-karakol", stops: [stopFixture("bishkek-karakol", "bishkek", 1)] },
      { key: "bishkek-osh", stops: [stopFixture("bishkek-osh", "bishkek", 1)] },
    ]);

    const stops = await getActiveCorridorStops();

    expect(stops.map((s) => s.key)).toEqual(["bishkek-karakol:bishkek", "bishkek-osh:bishkek"]);
  });
});

describe("ingestPassengerMessage — corridor generalization (spec s.7)", () => {
  it("resolves a matched stop against a real, non-pilot corridor rather than failing or mismapping it", async () => {
    dbMocks.corridor.findMany.mockResolvedValue([{ key: "osh-jalalabad", stops: [] }]);
    extractTripMessageMock.mockResolvedValue({
      result: { ...BASE_EXTRACTION, kind: "PASSENGER_REQUEST", originStopKey: "osh-jalalabad:osh", destinationStopKey: "osh-jalalabad:jalalabad" },
      origin: { key: "osh-jalalabad:osh", nameRu: "Ош", nameKy: "Ош", nameEn: "Osh", aliases: [] },
      destination: { key: "osh-jalalabad:jalalabad", nameRu: "Жалал-Абад", nameKy: "Жалал-Абад", nameEn: "Jalal-Abad", aliases: [] },
    });
    dbMocks.stop.findFirst.mockImplementation(({ where }: { where: { key: string; corridor: { key: string } } }) =>
      Promise.resolve({ id: `stop_${where.corridor.key}_${where.key}` }),
    );
    dbMocks.tripRequest.create.mockResolvedValue({
      id: "req_1",
      origin: { nameRu: "Ош", nameKy: "Ош", nameEn: "Osh" },
      destination: { nameRu: "Жалал-Абад", nameKy: "Жалал-Абад", nameEn: "Jalal-Abad" },
    });

    const request = await ingestPassengerMessage("+996700000001", "Ош-Жалал-Абад эртен 2 орун");

    expect(dbMocks.stop.findFirst).toHaveBeenCalledWith({ where: { key: "osh", corridor: { key: "osh-jalalabad", isActive: true } } });
    expect(dbMocks.stop.findFirst).toHaveBeenCalledWith({ where: { key: "jalalabad", corridor: { key: "osh-jalalabad", isActive: true } } });
    expect(dbMocks.tripRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ originStopId: "stop_osh-jalalabad_osh", destinationStopId: "stop_osh-jalalabad_jalalabad" }) }),
    );
    expect(request).not.toBeNull();
  });

  it("honestly reports unrecognized (never fabricates a stop id) when the extracted key can't be resolved to any active corridor", async () => {
    extractTripMessageMock.mockResolvedValue({
      result: { ...BASE_EXTRACTION, kind: "PASSENGER_REQUEST", originStopKey: "ghost:town", destinationStopKey: "ghost:village" },
      origin: { key: "ghost:town", nameRu: "?", nameKy: "?", nameEn: "?", aliases: [] },
      destination: { key: "ghost:village", nameRu: "?", nameKy: "?", nameEn: "?", aliases: [] },
    });
    dbMocks.stop.findFirst.mockResolvedValue(null);

    const request = await ingestPassengerMessage("+996700000001", "text");

    expect(request).toBeNull();
    expect(dbMocks.tripRequest.create).not.toHaveBeenCalled();
    expect(sendWhatsAppTextMock).toHaveBeenCalledTimes(1);
  });
});

describe("ingestPassengerMessage — RT OFFICE demand-side wiring (spec s.8)", () => {
  it("calls RT OFFICE's resolveSupplyForDispatcher and logs an auditable RT_OFFICE action when MATCH finds no candidate", async () => {
    extractTripMessageMock.mockResolvedValue({
      result: { ...BASE_EXTRACTION, kind: "PASSENGER_REQUEST", originStopKey: "c:a", destinationStopKey: "c:b" },
      origin: { key: "c:a", nameRu: "A", nameKy: "A", nameEn: "A", aliases: [] },
      destination: { key: "c:b", nameRu: "B", nameKy: "B", nameEn: "B", aliases: [] },
    });
    dbMocks.stop.findFirst.mockResolvedValue({ id: "stop_x" });
    dbMocks.tripRequest.create.mockResolvedValue({
      id: "req_1",
      origin: { nameRu: "A", nameKy: "A", nameEn: "A" },
      destination: { nameRu: "B", nameKy: "B", nameEn: "B" },
    });
    proposeMatchesForRequestMock.mockResolvedValue(null);
    resolveSupplyForDispatcherMock.mockResolvedValue({ tripRequestId: "req_1", hasCandidateSupply: false, candidates: [] });

    await ingestPassengerMessage("+996700000001", "text");

    expect(resolveSupplyForDispatcherMock).toHaveBeenCalledWith("req_1");
    expect(logAgentActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "RT_OFFICE",
        action: "rt_office.no_verified_supply_yet",
        entityType: "TripRequest",
        entityId: "req_1",
        details: expect.objectContaining({ hasCandidateSupply: false }),
      }),
    );
  });

  it("does not call resolveSupplyForDispatcher when MATCH already found a candidate", async () => {
    extractTripMessageMock.mockResolvedValue({
      result: { ...BASE_EXTRACTION, kind: "PASSENGER_REQUEST", originStopKey: "c:a", destinationStopKey: "c:b" },
      origin: { key: "c:a", nameRu: "A", nameKy: "A", nameEn: "A", aliases: [] },
      destination: { key: "c:b", nameRu: "B", nameKy: "B", nameEn: "B", aliases: [] },
    });
    dbMocks.stop.findFirst.mockResolvedValue({ id: "stop_x" });
    dbMocks.tripRequest.create.mockResolvedValue({
      id: "req_1",
      origin: { nameRu: "A", nameKy: "A", nameEn: "A" },
      destination: { nameRu: "B", nameKy: "B", nameEn: "B" },
    });
    proposeMatchesForRequestMock.mockResolvedValue({ id: "match_1" });

    await ingestPassengerMessage("+996700000001", "text");

    expect(resolveSupplyForDispatcherMock).not.toHaveBeenCalled();
    expect(logAgentActionMock).not.toHaveBeenCalledWith(expect.objectContaining({ action: "rt_office.no_verified_supply_yet" }));
  });
});

describe("ingestPassengerMessage — passenger loop wiring (spec A/C/H/J)", () => {
  function mockPassengerRequestFlow(overrides: Partial<Record<string, unknown>> = {}) {
    extractTripMessageMock.mockResolvedValue({
      result: { ...BASE_EXTRACTION, kind: "PASSENGER_REQUEST", originStopKey: "c:a", destinationStopKey: "c:b" },
      origin: { key: "c:a", nameRu: "A", nameKy: "A", nameEn: "A", aliases: [] },
      destination: { key: "c:b", nameRu: "B", nameKy: "B", nameEn: "B", aliases: [] },
    });
    dbMocks.stop.findFirst.mockResolvedValue({ id: "stop_x" });
    dbMocks.tripRequest.create.mockResolvedValue({
      id: "req_1",
      pickupPoint: null,
      origin: { nameRu: "A", nameKy: "A", nameEn: "A" },
      destination: { nameRu: "B", nameKy: "B", nameEn: "B" },
      ...overrides,
    });
  }

  it("starts the loop unconditionally and advances it to MATCHING before calling MATCH", async () => {
    mockPassengerRequestFlow();
    proposeMatchesForRequestMock.mockResolvedValue(null);

    await ingestPassengerMessage("+996700000001", "text");

    expect(startPassengerDemandLoopMock).toHaveBeenCalledWith(expect.objectContaining({ traceId: expect.any(String) }), "req_1");
    expect(advanceLoopToMatchingMock).toHaveBeenCalledWith(expect.anything(), "loop_1");
  });

  it("records OFFER_READY on the loop with the real match/offer ids (spec A — one passenger to one driver)", async () => {
    mockPassengerRequestFlow();
    proposeMatchesForRequestMock.mockResolvedValue({ id: "match_1", driverOfferId: "do_1" });

    await ingestPassengerMessage("+996700000001", "text");

    expect(recordOfferReadyMock).toHaveBeenCalledWith(expect.anything(), "loop_1", "match_1", "do_1");
    expect(recordNoSupplyMock).not.toHaveBeenCalled();
  });

  it("records NO_SUPPLY with a diagnostic detail when MATCH finds no candidate (spec C — no drivers)", async () => {
    mockPassengerRequestFlow();
    proposeMatchesForRequestMock.mockResolvedValue(null);
    resolveSupplyForDispatcherMock.mockResolvedValue({ tripRequestId: "req_1", hasCandidateSupply: false, candidates: [] });

    await ingestPassengerMessage("+996700000001", "text");

    expect(recordNoSupplyMock).toHaveBeenCalledWith(expect.anything(), "loop_1", "NO_SUPPLY", "NO_CANDIDATES_ON_FIRST_ATTEMPT");
    expect(recordOfferReadyMock).not.toHaveBeenCalled();
  });

  it("fails closed on an unresolvable pickup point — records the exact Jolchu-reported reason and never reaches matching (spec H/J)", async () => {
    mockPassengerRequestFlow({ pickupPoint: "some vague address" });
    resolvePickupRouteFactsMock.mockResolvedValue({ ok: false, reason: "NEEDS_CLARIFICATION", detail: "JOLCHU_NEEDS_CONFIRMATION" });

    await ingestPassengerMessage("+996700000001", "text");

    expect(recordNoSupplyMock).toHaveBeenCalledWith(expect.anything(), "loop_1", "NEEDS_CLARIFICATION", "JOLCHU_NEEDS_CONFIRMATION");
    expect(advanceLoopToMatchingMock).not.toHaveBeenCalled();
    expect(proposeMatchesForRequestMock).not.toHaveBeenCalled();
    // requestReceived (always sent) + noCandidatesYet (the fail-closed reply) — never a fabricated success message.
    expect(sendWhatsAppTextMock).toHaveBeenCalledTimes(2);
    expect(sendWhatsAppTextMock).toHaveBeenLastCalledWith("+996700000001", messages.noCandidatesYet.RU);
  });

  it("fails closed on a Jolchu timeout for the pickup point the same way (spec H)", async () => {
    mockPassengerRequestFlow({ pickupPoint: "slow address" });
    resolvePickupRouteFactsMock.mockResolvedValue({ ok: false, reason: "TEMPORARILY_UNAVAILABLE", detail: "JOLCHU_TIMEOUT" });

    await ingestPassengerMessage("+996700000001", "text");

    expect(recordNoSupplyMock).toHaveBeenCalledWith(expect.anything(), "loop_1", "TEMPORARILY_UNAVAILABLE", "JOLCHU_TIMEOUT");
    expect(proposeMatchesForRequestMock).not.toHaveBeenCalled();
  });

  it("proceeds to matching when the pickup point resolves cleanly", async () => {
    mockPassengerRequestFlow({ pickupPoint: "clean address" });
    resolvePickupRouteFactsMock.mockResolvedValue({ ok: true, route: null });
    proposeMatchesForRequestMock.mockResolvedValue({ id: "match_1", driverOfferId: "do_1" });

    await ingestPassengerMessage("+996700000001", "text");

    expect(advanceLoopToMatchingMock).toHaveBeenCalled();
    expect(recordOfferReadyMock).toHaveBeenCalledWith(expect.anything(), "loop_1", "match_1", "do_1");
  });
});

// Spec s.9/s.14 Test 19 — a redelivered inbound message (same rawMessageId,
// e.g. a webhook retry) must never create a second TripRequest/DriverOffer.
// TripRequest.rawMessageId / DriverOffer.rawMessageId now carry a real
// DB-level unique constraint; ingest.ts must catch the resulting P2002 and
// return the original row instead of letting the error propagate.
describe("ingestPassengerMessage — Test 19: duplicate demand does not create a second order", () => {
  it("returns the existing TripRequest instead of creating a duplicate when the same rawMessageId is redelivered", async () => {
    extractTripMessageMock.mockResolvedValue({
      result: { ...BASE_EXTRACTION, kind: "PASSENGER_REQUEST", originStopKey: "c:a", destinationStopKey: "c:b" },
      origin: { key: "c:a", nameRu: "A", nameKy: "A", nameEn: "A", aliases: [] },
      destination: { key: "c:b", nameRu: "B", nameKy: "B", nameEn: "B", aliases: [] },
    });
    dbMocks.stop.findFirst.mockResolvedValue({ id: "stop_x" });
    dbMocks.tripRequest.create.mockRejectedValue(p2002Error());
    dbMocks.tripRequest.findUniqueOrThrow.mockResolvedValue({
      id: "req_existing",
      origin: { nameRu: "A", nameKy: "A", nameEn: "A" },
      destination: { nameRu: "B", nameKy: "B", nameEn: "B" },
    });

    const request = await ingestPassengerMessage("+996700000001", "text", "wamid.same-message");

    // The stored key namespaces the provider's message id by channel and chat:
    // TripRequest.rawMessageId is a foreign key to a RawMessage row ingest now
    // writes, and a bare provider id is not unique across chats.
    expect(dbMocks.rawMessage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "WHATSAPP:+996700000001:wamid.same-message" } }),
    );
    expect(dbMocks.tripRequest.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { rawMessageId: "WHATSAPP:+996700000001:wamid.same-message" } }),
    );
    expect(request).toEqual(expect.objectContaining({ id: "req_existing" }));
    expect(logActionMock).toHaveBeenCalledWith(expect.objectContaining({ action: "request.duplicate_ignored", entityId: "req_existing" }));
    // No second side effect from the duplicate: no re-send, no re-match, no RT OFFICE re-dispatch.
    expect(sendWhatsAppTextMock).not.toHaveBeenCalled();
    expect(proposeMatchesForRequestMock).not.toHaveBeenCalled();
    expect(resolveSupplyForDispatcherMock).not.toHaveBeenCalled();
    // startPassengerDemandLoop is itself idempotent (P2002-safe) — calling it
    // unconditionally on the duplicate path can never spawn a second loop run
    // or re-run its NEW->SUPPLY_REQUESTED transitions (spec G/P).
    expect(startPassengerDemandLoopMock).toHaveBeenCalledWith(expect.anything(), "req_existing");
    expect(advanceLoopToMatchingMock).not.toHaveBeenCalled();
  });

  it("propagates a non-duplicate DB error (not silently swallowed as a dedup)", async () => {
    extractTripMessageMock.mockResolvedValue({
      result: { ...BASE_EXTRACTION, kind: "PASSENGER_REQUEST", originStopKey: "c:a", destinationStopKey: "c:b" },
      origin: { key: "c:a", nameRu: "A", nameKy: "A", nameEn: "A", aliases: [] },
      destination: { key: "c:b", nameRu: "B", nameKy: "B", nameEn: "B", aliases: [] },
    });
    dbMocks.stop.findFirst.mockResolvedValue({ id: "stop_x" });
    dbMocks.tripRequest.create.mockRejectedValue(new Error("connection reset"));

    await expect(ingestPassengerMessage("+996700000001", "text", "wamid.other")).rejects.toThrow("connection reset");
  });
});

describe("ingestDriverPrivateMessage — RT OFFICE supply-side wiring (spec s.8)", () => {
  function mockDriverOfferFlow(driverStatus: string) {
    dbMocks.driver.upsert.mockResolvedValue({ id: "driver_1", status: driverStatus, carModel: "Camry" });
    extractTripMessageMock.mockResolvedValue({
      result: { ...BASE_EXTRACTION, kind: "DRIVER_OFFER", originStopKey: "c:a", destinationStopKey: "c:b" },
      origin: { key: "c:a", nameRu: "A", nameKy: "A", nameEn: "A", aliases: [] },
      destination: { key: "c:b", nameRu: "B", nameKy: "B", nameEn: "B", aliases: [] },
    });
    dbMocks.stop.findFirst.mockResolvedValue({ id: "stop_x" });
    dbMocks.driverOffer.create.mockResolvedValue({
      id: "offer_1",
      seatsAvailable: 3,
      origin: { nameRu: "A", nameKy: "A", nameEn: "A" },
      destination: { nameRu: "B", nameKy: "B", nameEn: "B" },
    });
  }

  it("routes a newly created offer from an ACTIVE driver through RT OFFICE's notifySupplyAvailable, never calling MATCH directly", async () => {
    mockDriverOfferFlow("ACTIVE");

    const offer = await ingestDriverPrivateMessage("tg_1", "user1", "text");

    expect(notifySupplyAvailableMock).toHaveBeenCalledWith({ offerId: "offer_1", reportedBy: "DRIVER_REPORT" });
    expect(offer).not.toBeNull();
  });

  it("does not report supply available for a driver who isn't ACTIVE", async () => {
    mockDriverOfferFlow("PENDING_APPROVAL");

    await ingestDriverPrivateMessage("tg_1", "user1", "text");

    expect(notifySupplyAvailableMock).not.toHaveBeenCalled();
  });
});

describe("ingestDriverPrivateMessage — Test 19: duplicate offer does not create a second order", () => {
  it("returns the existing DriverOffer instead of creating a duplicate when the same rawMessageId is redelivered", async () => {
    dbMocks.driver.upsert.mockResolvedValue({ id: "driver_1", status: "ACTIVE", carModel: "Camry" });
    extractTripMessageMock.mockResolvedValue({
      result: { ...BASE_EXTRACTION, kind: "DRIVER_OFFER", originStopKey: "c:a", destinationStopKey: "c:b" },
      origin: { key: "c:a", nameRu: "A", nameKy: "A", nameEn: "A", aliases: [] },
      destination: { key: "c:b", nameRu: "B", nameKy: "B", nameEn: "B", aliases: [] },
    });
    dbMocks.stop.findFirst.mockResolvedValue({ id: "stop_x" });
    dbMocks.driverOffer.create.mockRejectedValue(p2002Error());
    dbMocks.driverOffer.findUniqueOrThrow.mockResolvedValue({
      id: "offer_existing",
      seatsAvailable: 3,
      origin: { nameRu: "A", nameKy: "A", nameEn: "A" },
      destination: { nameRu: "B", nameKy: "B", nameEn: "B" },
    });

    const offer = await ingestDriverPrivateMessage("tg_1", "user1", "text", "tgmsg.same-message");

    expect(dbMocks.rawMessage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "TELEGRAM_BOT:tg_1:tgmsg.same-message" } }),
    );
    expect(dbMocks.driverOffer.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { rawMessageId: "TELEGRAM_BOT:tg_1:tgmsg.same-message" } }),
    );
    expect(offer).toEqual(expect.objectContaining({ id: "offer_existing" }));
    expect(logActionMock).toHaveBeenCalledWith(expect.objectContaining({ action: "offer.duplicate_ignored", entityId: "offer_existing" }));
    expect(notifySupplyAvailableMock).not.toHaveBeenCalled();
  });
});

describe("ingestAllowedGroupMessage — corridor generalization (spec s.7)", () => {
  it("reads active-corridor stops (not the pilot constant) before classifying the group message", async () => {
    dbMocks.corridor.findMany.mockResolvedValue([{ key: "osh-jalalabad", stops: [] }]);
    extractTripMessageMock.mockResolvedValue({ result: { ...BASE_EXTRACTION, kind: "UNRECOGNIZED" }, origin: null, destination: null });
    dbMocks.rawMessage.create.mockResolvedValue({ id: "raw_1" });

    await ingestAllowedGroupMessage({
      telegramGroupId: "g1",
      chatId: "g1",
      senderId: "sender_1",
      senderUsername: null,
      text: "hi",
    });

    expect(dbMocks.corridor.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
  });
});

// Spec s.8/s.16 — static regression guard for the exact bypass section 8
// fixed: ingest.ts's driver-offer path must go through RT OFFICE
// (notifySupplyAvailable) rather than calling matching/orchestrate.ts's
// proposeMatchesForOffer directly, and must never write Match/Trip rows
// itself. Mirrors the source-text-scan pattern already used by
// src/lib/matching/boundary.test.ts and src/lib/rt-office/boundary.test.ts.
describe("ingest.ts never bypasses RT OFFICE on the supply side (spec s.8/s.16)", () => {
  it("does not import proposeMatchesForOffer directly", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./ingest.ts", import.meta.url), "utf8");
    const importStatements = source.match(/import\s+\{[^}]*\}\s+from\s+["']@\/lib\/matching\/orchestrate["']/g) ?? [];

    for (const statement of importStatements) {
      expect(statement, "ingest.ts must route newly-available driver supply through RT OFFICE's notifySupplyAvailable, not matching/orchestrate.ts's proposeMatchesForOffer directly").not.toMatch(/proposeMatchesForOffer/);
    }
  });

  it("imports notifySupplyAvailable from RT OFFICE's orchestrator", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./ingest.ts", import.meta.url), "utf8");

    expect(source).toMatch(/import\s+\{[^}]*notifySupplyAvailable[^}]*\}\s+from\s+["']@\/lib\/rt-office\/orchestrator["']/);
  });
});
