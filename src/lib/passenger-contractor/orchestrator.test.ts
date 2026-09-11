import { beforeEach, describe, expect, it, vi } from "vitest";

const { findExistingProspectMock, createPassengerProspectMock, markProspectContactedMock, logAgentActionMock, classifyMarketRoleMock, sendAcquisitionOutreachMock, computeMarketGapMock, createProspectHandoffMock } = vi.hoisted(() => ({
  findExistingProspectMock: vi.fn(),
  createPassengerProspectMock: vi.fn(),
  markProspectContactedMock: vi.fn(),
  logAgentActionMock: vi.fn().mockResolvedValue(undefined),
  classifyMarketRoleMock: vi.fn(),
  sendAcquisitionOutreachMock: vi.fn(),
  computeMarketGapMock: vi.fn(),
  createProspectHandoffMock: vi.fn(),
}));

vi.mock("./prospect", () => ({
  findExistingProspect: findExistingProspectMock,
  createPassengerProspect: createPassengerProspectMock,
  markProspectContacted: markProspectContactedMock,
}));
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

import { processPassengerMarketSighting } from "./orchestrator";

const CTX = { traceId: "trace-1", hop: 0 };

function passengerClassification(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    role: "PASSENGER",
    language: "RU",
    confidence: 0.9,
    originText: "Бишкек",
    destinationText: "Ош",
    departureTimeText: null,
    passengerCount: 1,
    seatsAvailable: null,
    vehicleText: null,
    cargoDescription: null,
    businessCategoryGuess: null,
    ...overrides,
  };
}

describe("processPassengerMarketSighting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findExistingProspectMock.mockResolvedValue(null);
    createPassengerProspectMock.mockResolvedValue({ id: "prospect-1", status: "NEW" });
    computeMarketGapMock.mockResolvedValue({
      demandSeats: 20,
      supplySeats: 5,
      gapSeats: -15,
      priority: "HIGH_DRIVER_ACQUISITION_NEED",
      windowDays: 14,
      corridorId: null,
      asOf: "2026-09-09T00:00:00.000Z",
    });
    createProspectHandoffMock.mockResolvedValue({ handoff: { id: "handoff-1", status: "READY" }, deduplicated: false });
  });

  it("skips a non-passenger sighting without ever creating a prospect", async () => {
    classifyMarketRoleMock.mockResolvedValue({ role: "DRIVER", language: "KY", confidence: 0.9, originText: null, destinationText: null, departureTimeText: null, passengerCount: null, seatsAvailable: 2, vehicleText: null, cargoDescription: null, businessCategoryGuess: null });

    const outcome = await processPassengerMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "2 орун бар" });

    expect(outcome.outcome).toBe("SKIPPED_NOT_A_PASSENGER_SIGHTING");
    expect(createPassengerProspectMock).not.toHaveBeenCalled();
  });

  it("M: skips a DELIVERY_EXECUTOR-classified sighting — a courier offering is not passenger demand", async () => {
    classifyMarketRoleMock.mockResolvedValue({ role: "DELIVERY_EXECUTOR", language: "RU", confidence: 0.9, originText: null, destinationText: null, departureTimeText: null, passengerCount: null, seatsAvailable: null, vehicleText: null, cargoDescription: null, businessCategoryGuess: null, capacityText: null, temperatureCapability: null, backhaulText: null, zonesText: "по городу" });

    const outcome = await processPassengerMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "Курьер, доставлю документы/посылки по городу" });

    expect(outcome.outcome).toBe("SKIPPED_NOT_A_PASSENGER_SIGHTING");
    expect(createPassengerProspectMock).not.toHaveBeenCalled();
  });

  it("N: skips a CARGO_CARRIER-classified sighting — freight capacity is not passenger demand", async () => {
    classifyMarketRoleMock.mockResolvedValue({ role: "CARGO_CARRIER", language: "RU", confidence: 0.9, originText: "Бишкек", destinationText: "Ош", departureTimeText: null, passengerCount: null, seatsAvailable: null, vehicleText: null, cargoDescription: null, businessCategoryGuess: null, capacityText: "20 тонн", temperatureCapability: false, backhaulText: "есть обратка", zonesText: null });

    const outcome = await processPassengerMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "Фура 20 тонн Бишкек–Ош, есть обратка" });

    expect(outcome.outcome).toBe("SKIPPED_NOT_A_PASSENGER_SIGHTING");
    expect(createPassengerProspectMock).not.toHaveBeenCalled();
  });

  it("Q: skips an AMBIGUOUS-classified sighting even at high stated confidence — never guesses", async () => {
    classifyMarketRoleMock.mockResolvedValue({ role: "AMBIGUOUS", language: "KY", confidence: 0.9, originText: "Каракол", destinationText: "Бишкек", departureTimeText: "эрте", passengerCount: null, seatsAvailable: null, vehicleText: null, cargoDescription: null, businessCategoryGuess: null, capacityText: null, temperatureCapability: null, backhaulText: null, zonesText: null });

    const outcome = await processPassengerMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "каракол бишкек эрте" });

    expect(outcome.outcome).toBe("SKIPPED_NOT_A_PASSENGER_SIGHTING");
    expect(createPassengerProspectMock).not.toHaveBeenCalled();
    expect(sendAcquisitionOutreachMock).not.toHaveBeenCalled();
  });

  it("never creates a duplicate prospect for a contact signal already on file", async () => {
    classifyMarketRoleMock.mockResolvedValue(passengerClassification());
    findExistingProspectMock.mockResolvedValue({ id: "prospect-existing", status: "CONTACTED" });

    const outcome = await processPassengerMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "попутчик керек", rawPhone: "0700123456" });

    expect(outcome).toEqual({ outcome: "ALREADY_KNOWN", prospect: { id: "prospect-existing", status: "CONTACTED" } });
    expect(createPassengerProspectMock).not.toHaveBeenCalled();
  });

  it("creates a new prospect and logs it when genuinely new", async () => {
    classifyMarketRoleMock.mockResolvedValue(passengerClassification());

    const outcome = await processPassengerMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "попутчик керек" });

    expect(outcome.outcome).toBe("PROSPECT_CREATED");
    expect(createPassengerProspectMock).toHaveBeenCalledTimes(1);
    expect(logAgentActionMock).toHaveBeenCalledWith(expect.objectContaining({ agent: "PASSENGER_CONTRACTOR", entityId: "prospect-1" }));
  });

  it("never sends outreach when Market Gap does not signal a passenger shortfall in supply utilization, even with a phone present", async () => {
    classifyMarketRoleMock.mockResolvedValue(passengerClassification());
    computeMarketGapMock.mockResolvedValue({ demandSeats: 20, supplySeats: 5, gapSeats: -15, priority: "HIGH_DRIVER_ACQUISITION_NEED", windowDays: 14, corridorId: null, asOf: "x" });

    const outcome = await processPassengerMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "text", rawPhone: "0700123456" });

    expect(outcome.outcome).toBe("PROSPECT_CREATED");
    if (outcome.outcome === "PROSPECT_CREATED") expect(outcome.outreach).toBeNull();
    expect(sendAcquisitionOutreachMock).not.toHaveBeenCalled();
    expect(markProspectContactedMock).not.toHaveBeenCalled();
  });

  it("never sends outreach when no real phone number was present, even under a high passenger-need signal", async () => {
    classifyMarketRoleMock.mockResolvedValue(passengerClassification());
    computeMarketGapMock.mockResolvedValue({ demandSeats: 2, supplySeats: 20, gapSeats: 18, priority: "PASSENGER_ACQUISITION_NEED", windowDays: 14, corridorId: null, asOf: "x" });

    const outcome = await processPassengerMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "text", rawTelegramUsername: "someuser" });

    expect(outcome.outcome).toBe("PROSPECT_CREATED");
    if (outcome.outcome === "PROSPECT_CREATED") expect(outcome.outreach).toBeNull();
    expect(sendAcquisitionOutreachMock).not.toHaveBeenCalled();
  });

  it("sends exactly one gated outreach and marks the prospect CONTACTED when supply genuinely exceeds demand and a phone is present", async () => {
    classifyMarketRoleMock.mockResolvedValue(passengerClassification());
    computeMarketGapMock.mockResolvedValue({ demandSeats: 2, supplySeats: 20, gapSeats: 18, priority: "PASSENGER_ACQUISITION_NEED", windowDays: 14, corridorId: null, asOf: "x" });
    sendAcquisitionOutreachMock.mockResolvedValue({ status: "DRY_RUN", eventId: "evt-1", deduplicated: false });

    const outcome = await processPassengerMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "text", rawPhone: "0700123456" });

    expect(outcome.outcome).toBe("PROSPECT_CREATED");
    if (outcome.outcome === "PROSPECT_CREATED") expect(outcome.outreach).toEqual({ status: "DRY_RUN", eventId: "evt-1", deduplicated: false });
    expect(sendAcquisitionOutreachMock).toHaveBeenCalledTimes(1);
    expect(sendAcquisitionOutreachMock).toHaveBeenCalledWith(
      expect.objectContaining({ contractorAgent: "PASSENGER_CONTRACTOR", prospectType: "PASSENGER", prospectRef: "prospect-1", channel: "WHATSAPP", to: "996700123456", contactFingerprint: "phone:996700123456" }),
    );
    expect(markProspectContactedMock).toHaveBeenCalledWith("prospect-1");
    expect(createProspectHandoffMock).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ prospectType: "PASSENGER_DEMAND", prospectRef: "prospect-1", sourceAgent: "PASSENGER_CONTRACTOR", targetAgentOrDepartment: "MIRA", contactFingerprint: "phone:996700123456" }),
    );
  });

  it("never creates a ProspectHandoff when outreach never fires (no market-gap need)", async () => {
    classifyMarketRoleMock.mockResolvedValue(passengerClassification());
    computeMarketGapMock.mockResolvedValue({ demandSeats: 20, supplySeats: 5, gapSeats: -15, priority: "HIGH_DRIVER_ACQUISITION_NEED", windowDays: 14, corridorId: null, asOf: "x" });

    await processPassengerMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "text", rawPhone: "0700123456" });

    expect(createProspectHandoffMock).not.toHaveBeenCalled();
  });
});
