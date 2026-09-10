import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMocks, crmAutoMocks, matchingMocks, jolchuMocks, traceMocks } = vi.hoisted(() => ({
  dbMocks: {
    driver: { findUnique: vi.fn() },
    trip: { findFirst: vi.fn() },
    driverOffer: { findFirst: vi.fn() },
    driveCrmEvent: { findMany: vi.fn() },
    auditLogEntry: { create: vi.fn() },
  },
  crmAutoMocks: {
    findEventByIdempotencyKey: vi.fn(),
    recordOperationalEvent: vi.fn(),
    openBreakdownIncident: vi.fn(),
    resolveBreakdownIncident: vi.fn(),
  },
  matchingMocks: {
    markTripDeparted: vi.fn(),
    setDriverReportedSeatsAvailable: vi.fn(),
    markTripCompletedByDriverReport: vi.fn(),
  },
  jolchuMocks: {
    resolveRouteIntelligence: vi.fn(),
  },
  traceMocks: {
    logAgentAction: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ db: dbMocks }));
vi.mock("@/lib/crm-auto/orchestrator", () => ({
  recordOperationalEvent: crmAutoMocks.recordOperationalEvent,
  openBreakdownIncident: crmAutoMocks.openBreakdownIncident,
  resolveBreakdownIncident: crmAutoMocks.resolveBreakdownIncident,
}));
vi.mock("@/lib/crm-auto/bridge", () => ({
  findEventByIdempotencyKey: crmAutoMocks.findEventByIdempotencyKey,
  operationalHistoryForArtur: (driverId: string, limit?: number) => dbMocks.driveCrmEvent.findMany({ driverId, limit }),
}));
vi.mock("@/lib/matching/orchestrate", () => matchingMocks);
vi.mock("@/lib/jolchu/orchestrator", () => jolchuMocks);
vi.mock("@/lib/agents/trace", () => ({
  rootContext: () => ({ traceId: "trace-1", hop: 0 }),
  logAgentAction: traceMocks.logAgentAction,
}));

import { ingestDriverTelemetryText } from "./telemetry";

const DRIVER = {
  id: "driver-1",
  telegramUserId: "tg-1",
  preferredLang: "RU" as const,
  status: "VERIFIED",
};

function noContext() {
  dbMocks.trip.findFirst.mockResolvedValue(null);
  dbMocks.driverOffer.findFirst.mockResolvedValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.driver.findUnique.mockResolvedValue(DRIVER);
  crmAutoMocks.findEventByIdempotencyKey.mockResolvedValue(null);
  crmAutoMocks.recordOperationalEvent.mockResolvedValue({ eventId: "evt-1", deduplicated: false });
  dbMocks.driveCrmEvent.findMany.mockResolvedValue([]);
  noContext();
});

describe("ingestDriverTelemetryText — signal classification boundary", () => {
  it("never invents an operational fact for unrelated/silent text — no CRM Auto write, no driver lookup consequence", async () => {
    const result = await ingestDriverTelemetryText({ telegramUserId: "tg-1", rawText: "Привет, как дела?" });

    expect(result).toBeNull();
    expect(crmAutoMocks.recordOperationalEvent).not.toHaveBeenCalled();
    expect(crmAutoMocks.openBreakdownIncident).not.toHaveBeenCalled();
  });

  it("never treats an unknown sender as a driver — no signal is ever applied without an already-verified Driver record", async () => {
    dbMocks.driver.findUnique.mockResolvedValue(null);

    const result = await ingestDriverTelemetryText({ telegramUserId: "unknown", rawText: "Выехал" });

    expect(result).toBeNull();
    expect(crmAutoMocks.recordOperationalEvent).not.toHaveBeenCalled();
  });
});

describe("ingestDriverTelemetryText — duplicate event delivery", () => {
  it("is a safe no-op on a duplicate delivery of the same message: no second CRM Auto write, no second Trip mutation", async () => {
    crmAutoMocks.findEventByIdempotencyKey.mockResolvedValue({ id: "evt-existing" });

    const result = await ingestDriverTelemetryText({ telegramUserId: "tg-1", rawText: "Выехал", rawMessageId: "msg-1" });

    expect(result).toEqual(expect.objectContaining({ signalType: "DEPARTED", deduplicated: true }));
    expect(crmAutoMocks.recordOperationalEvent).not.toHaveBeenCalled();
    expect(matchingMocks.markTripDeparted).not.toHaveBeenCalled();
  });

  it("scopes idempotency to the real channel message id, so the same text delivered under two different message ids is treated as two distinct reports", async () => {
    dbMocks.trip.findFirst.mockResolvedValue({
      id: "trip-1",
      status: "SCHEDULED",
      driverOffer: { id: "offer-1", origin: {}, destination: {} },
    });
    matchingMocks.markTripDeparted.mockResolvedValue({ tripId: "trip-1", transitioned: true });

    await ingestDriverTelemetryText({ telegramUserId: "tg-1", rawText: "Выехал", rawMessageId: "msg-1" });
    await ingestDriverTelemetryText({ telegramUserId: "tg-1", rawText: "Выехал", rawMessageId: "msg-2" });

    const keys = crmAutoMocks.findEventByIdempotencyKey.mock.calls.map((c) => c[0]);
    expect(new Set(keys).size).toBe(2);
  });
});

describe("ingestDriverTelemetryText — out-of-order events", () => {
  it("a completion report with no active/known trip is recorded as history but never fabricates a Trip transition", async () => {
    noContext(); // no non-terminal, open-offer, or fallback trip at all

    const result = await ingestDriverTelemetryText({ telegramUserId: "tg-1", rawText: "Рейс завершен" });

    expect(result?.signalType).toBe("TRIP_COMPLETED");
    expect(crmAutoMocks.recordOperationalEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "OPERATIONAL_HISTORY" }));
    expect(matchingMocks.markTripCompletedByDriverReport).not.toHaveBeenCalled();
    expect(result?.replyText).toMatch(/не найден|табылган жок|not.*found/i);
  });

  it("a departure report against an out-of-order/already-progressed trip is delegated to matching/orchestrate.ts's own idempotent CAS, never double-applied here", async () => {
    dbMocks.trip.findFirst.mockResolvedValue({
      id: "trip-1",
      status: "IN_PROGRESS", // already departed
      driverOffer: { id: "offer-1", origin: {}, destination: {} },
    });
    matchingMocks.markTripDeparted.mockResolvedValue({ tripId: "trip-1", transitioned: false });

    const result = await ingestDriverTelemetryText({ telegramUserId: "tg-1", rawText: "Выехал" });

    expect(matchingMocks.markTripDeparted).toHaveBeenCalledWith("trip-1");
    expect(result?.signalType).toBe("DEPARTED");
  });
});

describe("ingestDriverTelemetryText — ETA_REQUEST / stale-ETA safety", () => {
  const contextWithOffer = () => {
    dbMocks.driverOffer.findFirst.mockResolvedValue({
      id: "offer-1",
      origin: { nameRu: "Бишкек" },
      destination: { nameRu: "Ош" },
      status: "OPEN",
    });
  };

  it("never fabricates an ETA when Jolchu cannot resolve one — no OPERATIONAL_ETA event is recorded", async () => {
    contextWithOffer();
    dbMocks.driveCrmEvent.findMany.mockResolvedValue([
      { details: { signalType: "LOCATION_UPDATE", freeText: "Токмок" } },
    ]);
    jolchuMocks.resolveRouteIntelligence.mockResolvedValue({ status: "FAILED", route: null });

    const result = await ingestDriverTelemetryText({ telegramUserId: "tg-1", rawText: "Сколько ехать до Оша?" });

    expect(result?.signalType).toBe("ETA_REQUEST");
    expect(crmAutoMocks.recordOperationalEvent).not.toHaveBeenCalled();
    expect(result?.replyText).toMatch(/не смог|эсептей алган жок|could not/i);
  });

  it("records a verified OPERATIONAL_ETA only once Jolchu actually resolves the route, deriving minutes from trafficAwareDurationMin first", async () => {
    contextWithOffer();
    dbMocks.driveCrmEvent.findMany.mockResolvedValue([
      { details: { signalType: "LOCATION_UPDATE", freeText: "Токмок" } },
    ]);
    jolchuMocks.resolveRouteIntelligence.mockResolvedValue({
      status: "RESOLVED",
      route: { estimatedDurationMin: 200, trafficAwareDurationMin: 230 },
    });

    const result = await ingestDriverTelemetryText({ telegramUserId: "tg-1", rawText: "Сколько ехать до Оша?" });

    expect(crmAutoMocks.recordOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "OPERATIONAL_ETA", etaMinutes: 230, source: "JOLCHU" }),
    );
    expect(result?.replyText).toContain("230");
  });

  it("asks for a location instead of guessing one when no verified last-known location exists yet", async () => {
    contextWithOffer();
    dbMocks.driveCrmEvent.findMany.mockResolvedValue([]); // no LOCATION_UPDATE on file

    const result = await ingestDriverTelemetryText({ telegramUserId: "tg-1", rawText: "Сколько ехать до Оша?" });

    expect(jolchuMocks.resolveRouteIntelligence).not.toHaveBeenCalled();
    expect(result?.replyText).toMatch(/геолокац|жайгашкан|location/i);
  });
});

describe("ingestDriverTelemetryText — breakdown open/resolved", () => {
  it("records a new breakdown when none is currently open", async () => {
    crmAutoMocks.openBreakdownIncident.mockResolvedValue({ eventId: "evt-b1", deduplicated: false });

    const result = await ingestDriverTelemetryText({ telegramUserId: "tg-1", rawText: "Машина сломалась" });

    expect(result?.signalType).toBe("BREAKDOWN_OPENED");
    expect(crmAutoMocks.openBreakdownIncident).toHaveBeenCalledWith(expect.objectContaining({ driverId: "driver-1" }));
    expect(result?.replyText).toMatch(/поломку|бузулганды|breakdown/i);
  });

  it("never concludes a second breakdown is valid while one is already open — surfaces the rejection instead of retrying/guessing", async () => {
    crmAutoMocks.openBreakdownIncident.mockRejectedValue(new Error("CRM Auto rejected breakdown open: already open"));

    const result = await ingestDriverTelemetryText({ telegramUserId: "tg-1", rawText: "Машина сломалась" });

    expect(result?.signalType).toBe("BREAKDOWN_OPENED");
    expect(result?.replyText).toMatch(/уже открыта|мурунтан эле|already have/i);
  });

  it("resolves an open breakdown", async () => {
    crmAutoMocks.resolveBreakdownIncident.mockResolvedValue({ eventId: "evt-b2", deduplicated: false });

    const result = await ingestDriverTelemetryText({ telegramUserId: "tg-1", rawText: "Поломка устранена" });

    expect(result?.signalType).toBe("BREAKDOWN_RESOLVED");
    expect(crmAutoMocks.resolveBreakdownIncident).toHaveBeenCalledWith(expect.objectContaining({ driverId: "driver-1" }));
  });

  it("never fabricates a resolution when there is no open breakdown to resolve", async () => {
    crmAutoMocks.resolveBreakdownIncident.mockRejectedValue(new Error("CRM Auto rejected breakdown resolution: no open incident"));

    const result = await ingestDriverTelemetryText({ telegramUserId: "tg-1", rawText: "Поломка устранена" });

    expect(result?.replyText).toMatch(/не найдено|табылган жок|no open breakdown/i);
  });
});

describe("ingestDriverTelemetryText — seat count changes", () => {
  it("passes the driver-reported seat count through to matching/orchestrate.ts's own bounding logic, never re-deriving it here", async () => {
    dbMocks.driverOffer.findFirst.mockResolvedValue({ id: "offer-1", origin: {}, destination: {}, status: "OPEN" });
    matchingMocks.setDriverReportedSeatsAvailable.mockResolvedValue({ offerId: "offer-1", seatsAvailable: 2, updated: true });

    const result = await ingestDriverTelemetryText({ telegramUserId: "tg-1", rawText: "Осталось 2 места свободно" });

    expect(matchingMocks.setDriverReportedSeatsAvailable).toHaveBeenCalledWith("offer-1", 2);
    expect(result?.replyText).toContain("2");
  });

  it("records the report as history even when there is no active offer to apply it to", async () => {
    noContext();

    await ingestDriverTelemetryText({ telegramUserId: "tg-1", rawText: "Осталось 2 места свободно" });

    expect(matchingMocks.setDriverReportedSeatsAvailable).not.toHaveBeenCalled();
    expect(crmAutoMocks.recordOperationalEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "OPERATIONAL_HISTORY" }));
  });
});

describe("ingestDriverTelemetryText — never a false operational conclusion from a delay report alone", () => {
  it("a DELAYED report is recorded as history only — it never opens a breakdown, never completes/departs a trip, never invents an ETA", async () => {
    const result = await ingestDriverTelemetryText({ telegramUserId: "tg-1", rawText: "Задержка, опаздываю на 20 минут" });

    expect(result?.signalType).toBe("DELAYED");
    expect(crmAutoMocks.recordOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "OPERATIONAL_HISTORY", details: expect.objectContaining({ driverReportedDelayMinutes: 20 }) }),
    );
    expect(crmAutoMocks.openBreakdownIncident).not.toHaveBeenCalled();
    expect(matchingMocks.markTripDeparted).not.toHaveBeenCalled();
    expect(matchingMocks.markTripCompletedByDriverReport).not.toHaveBeenCalled();
  });
});
