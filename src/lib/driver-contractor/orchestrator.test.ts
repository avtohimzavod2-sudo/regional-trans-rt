import { beforeEach, describe, expect, it, vi } from "vitest";

const { importScoutCandidateMock, logAgentActionMock, classifyMarketRoleMock, sendAcquisitionOutreachMock, computeMarketGapMock, createProspectHandoffMock } = vi.hoisted(() => ({
  importScoutCandidateMock: vi.fn(),
  logAgentActionMock: vi.fn().mockResolvedValue(undefined),
  classifyMarketRoleMock: vi.fn(),
  sendAcquisitionOutreachMock: vi.fn(),
  computeMarketGapMock: vi.fn(),
  createProspectHandoffMock: vi.fn(),
}));

vi.mock("@/lib/agents/scout", async () => {
  const actual = await vi.importActual<typeof import("@/lib/agents/scout")>("@/lib/agents/scout");
  return { ...actual, importScoutCandidate: importScoutCandidateMock };
});
vi.mock("@/lib/agents/trace", () => ({ logAgentAction: logAgentActionMock }));
vi.mock("@/lib/acquisition/role-classifier", async () => {
  const actual = await vi.importActual<typeof import("@/lib/acquisition/role-classifier")>("@/lib/acquisition/role-classifier");
  return { ...actual, classifyMarketRole: classifyMarketRoleMock };
});
vi.mock("@/lib/acquisition/outreach-log", () => ({ sendAcquisitionOutreach: sendAcquisitionOutreachMock }));
vi.mock("@/lib/rt-office/market-gap", () => ({ computeMarketGap: computeMarketGapMock }));
vi.mock("@/lib/prospecting/handoff", async () => {
  const actual = await vi.importActual<typeof import("@/lib/prospecting/handoff")>("@/lib/prospecting/handoff");
  return { ...actual, createProspectHandoff: createProspectHandoffMock };
});

import { processDriverMarketSighting } from "./orchestrator";

const CTX = { traceId: "trace-1", hop: 0 };

function driverClassification(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    role: "DRIVER",
    language: "KY",
    confidence: 0.9,
    originText: "Ош",
    destinationText: "Бишкек",
    departureTimeText: null,
    passengerCount: null,
    seatsAvailable: 2,
    vehicleText: null,
    cargoDescription: null,
    businessCategoryGuess: null,
    ...overrides,
  };
}

describe("processDriverMarketSighting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    importScoutCandidateMock.mockResolvedValue({ id: "candidate-1" });
    computeMarketGapMock.mockResolvedValue({
      demandSeats: 5,
      supplySeats: 20,
      gapSeats: 15,
      priority: "PASSENGER_ACQUISITION_NEED",
      windowDays: 14,
      corridorId: null,
      asOf: "2026-09-09T00:00:00.000Z",
    });
    createProspectHandoffMock.mockResolvedValue({ handoff: { id: "handoff-1", status: "READY" }, deduplicated: false });
  });

  it("skips a non-driver sighting without ever calling SCOUT's import path", async () => {
    classifyMarketRoleMock.mockResolvedValue({ role: "PASSENGER", language: "RU", confidence: 0.9, originText: null, destinationText: null, departureTimeText: null, passengerCount: 1, seatsAvailable: null, vehicleText: null, cargoDescription: null, businessCategoryGuess: null });

    const outcome = await processDriverMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "попутчик керек" });

    expect(outcome.outcome).toBe("SKIPPED_NOT_A_DRIVER_SIGHTING");
    expect(importScoutCandidateMock).not.toHaveBeenCalled();
  });

  it("M: skips a DELIVERY_EXECUTOR-classified sighting — a courier offering is not a driver-supply prospect", async () => {
    classifyMarketRoleMock.mockResolvedValue({ role: "DELIVERY_EXECUTOR", language: "RU", confidence: 0.9, originText: null, destinationText: null, departureTimeText: null, passengerCount: null, seatsAvailable: null, vehicleText: null, cargoDescription: null, businessCategoryGuess: null, capacityText: null, temperatureCapability: null, backhaulText: null, zonesText: "по городу" });

    const outcome = await processDriverMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "Курьер, доставлю документы/посылки по городу" });

    expect(outcome.outcome).toBe("SKIPPED_NOT_A_DRIVER_SIGHTING");
    expect(importScoutCandidateMock).not.toHaveBeenCalled();
  });

  it("N: skips a CARGO_CARRIER-classified sighting — freight capacity is not a driver-supply prospect", async () => {
    classifyMarketRoleMock.mockResolvedValue({ role: "CARGO_CARRIER", language: "RU", confidence: 0.9, originText: "Бишкек", destinationText: "Ош", departureTimeText: null, passengerCount: null, seatsAvailable: null, vehicleText: null, cargoDescription: null, businessCategoryGuess: null, capacityText: "20 тонн", temperatureCapability: false, backhaulText: "есть обратка", zonesText: null });

    const outcome = await processDriverMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "Фура 20 тонн Бишкек–Ош, есть обратка" });

    expect(outcome.outcome).toBe("SKIPPED_NOT_A_DRIVER_SIGHTING");
    expect(importScoutCandidateMock).not.toHaveBeenCalled();
  });

  it("Q: skips an AMBIGUOUS-classified sighting even at high stated confidence — never guesses", async () => {
    classifyMarketRoleMock.mockResolvedValue({ role: "AMBIGUOUS", language: "KY", confidence: 0.9, originText: "Каракол", destinationText: "Бишкек", departureTimeText: "эрте", passengerCount: null, seatsAvailable: null, vehicleText: null, cargoDescription: null, businessCategoryGuess: null, capacityText: null, temperatureCapability: null, backhaulText: null, zonesText: null });

    const outcome = await processDriverMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "каракол бишкек эрте" });

    expect(outcome.outcome).toBe("SKIPPED_NOT_A_DRIVER_SIGHTING");
    expect(importScoutCandidateMock).not.toHaveBeenCalled();
    expect(sendAcquisitionOutreachMock).not.toHaveBeenCalled();
  });

  it("skips a low-confidence classification even if it guesses DRIVER — never imports on an unreliable guess", async () => {
    classifyMarketRoleMock.mockResolvedValue(driverClassification({ confidence: 0.2 }));

    const outcome = await processDriverMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "ambiguous text" });

    expect(outcome.outcome).toBe("SKIPPED_NOT_A_DRIVER_SIGHTING");
    expect(importScoutCandidateMock).not.toHaveBeenCalled();
  });

  it("imports an actionable driver sighting through SCOUT's real pipeline and logs it", async () => {
    classifyMarketRoleMock.mockResolvedValue(driverClassification());

    const outcome = await processDriverMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "ошко кетем 2 орун бар" });

    expect(outcome.outcome).toBe("IMPORTED");
    expect(importScoutCandidateMock).toHaveBeenCalledWith(CTX, expect.objectContaining({ sourceType: "TELEGRAM_GROUP", sourceText: "ошко кетем 2 орун бар" }));
    expect(logAgentActionMock).toHaveBeenCalledWith(expect.objectContaining({ agent: "DRIVER_CONTRACTOR", entityId: "candidate-1" }));
  });

  it("never sends outreach when Market Gap does not signal a driver shortage, even with a phone present", async () => {
    classifyMarketRoleMock.mockResolvedValue(driverClassification());
    computeMarketGapMock.mockResolvedValue({ demandSeats: 5, supplySeats: 6, gapSeats: 1, priority: "BALANCED", windowDays: 14, corridorId: null, asOf: "x" });

    const outcome = await processDriverMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "text", rawPhone: "0700123456" });

    expect(outcome.outcome).toBe("IMPORTED");
    if (outcome.outcome === "IMPORTED") expect(outcome.outreach).toBeNull();
    expect(sendAcquisitionOutreachMock).not.toHaveBeenCalled();
  });

  it("never sends outreach when no real phone number was present in the source text, even under a high-need signal", async () => {
    classifyMarketRoleMock.mockResolvedValue(driverClassification());
    computeMarketGapMock.mockResolvedValue({ demandSeats: 20, supplySeats: 2, gapSeats: -18, priority: "HIGH_DRIVER_ACQUISITION_NEED", windowDays: 14, corridorId: null, asOf: "x" });

    const outcome = await processDriverMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "text", rawTelegramUsername: "someuser" });

    expect(outcome.outcome).toBe("IMPORTED");
    if (outcome.outcome === "IMPORTED") expect(outcome.outreach).toBeNull();
    expect(sendAcquisitionOutreachMock).not.toHaveBeenCalled();
  });

  it("sends exactly one gated outreach via the shared entrypoint when the shortage is real and a phone is present", async () => {
    classifyMarketRoleMock.mockResolvedValue(driverClassification());
    computeMarketGapMock.mockResolvedValue({ demandSeats: 20, supplySeats: 2, gapSeats: -18, priority: "HIGH_DRIVER_ACQUISITION_NEED", windowDays: 14, corridorId: null, asOf: "x" });
    sendAcquisitionOutreachMock.mockResolvedValue({ status: "DRY_RUN", eventId: "evt-1", deduplicated: false });

    const outcome = await processDriverMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "text", rawPhone: "0700123456" });

    expect(outcome.outcome).toBe("IMPORTED");
    if (outcome.outcome === "IMPORTED") expect(outcome.outreach).toEqual({ status: "DRY_RUN", eventId: "evt-1", deduplicated: false });
    expect(sendAcquisitionOutreachMock).toHaveBeenCalledTimes(1);
    expect(sendAcquisitionOutreachMock).toHaveBeenCalledWith(
      expect.objectContaining({ contractorAgent: "DRIVER_CONTRACTOR", prospectType: "DRIVER", prospectRef: "candidate-1", channel: "WHATSAPP", to: "996700123456", contactFingerprint: "phone:996700123456" }),
    );
    expect(createProspectHandoffMock).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ prospectType: "DRIVER_SUPPLY", prospectRef: "candidate-1", sourceAgent: "DRIVER_CONTRACTOR", targetAgentOrDepartment: "RT_OFFICE", contactFingerprint: "phone:996700123456" }),
    );
  });

  it("never creates a ProspectHandoff when outreach never fires (no real shortage)", async () => {
    classifyMarketRoleMock.mockResolvedValue(driverClassification());
    computeMarketGapMock.mockResolvedValue({ demandSeats: 5, supplySeats: 6, gapSeats: 1, priority: "BALANCED", windowDays: 14, corridorId: null, asOf: "x" });

    await processDriverMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "text", rawPhone: "0700123456" });

    expect(createProspectHandoffMock).not.toHaveBeenCalled();
  });
});
