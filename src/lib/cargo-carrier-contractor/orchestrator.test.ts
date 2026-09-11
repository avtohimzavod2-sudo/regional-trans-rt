import { beforeEach, describe, expect, it, vi } from "vitest";

const { findExistingMock, createProspectMock, transitionStatusMock, logAgentActionMock, classifyMarketRoleMock, sendAcquisitionOutreachMock, createProspectHandoffMock } = vi.hoisted(() => ({
  findExistingMock: vi.fn(),
  createProspectMock: vi.fn(),
  transitionStatusMock: vi.fn(),
  logAgentActionMock: vi.fn().mockResolvedValue(undefined),
  classifyMarketRoleMock: vi.fn(),
  sendAcquisitionOutreachMock: vi.fn(),
  createProspectHandoffMock: vi.fn(),
}));

vi.mock("./prospect", async () => {
  const actual = await vi.importActual<typeof import("./prospect")>("./prospect");
  return {
    ...actual,
    findExistingCargoCarrierProspect: findExistingMock,
    createCargoCarrierProspect: createProspectMock,
    transitionCargoCarrierProspectStatus: transitionStatusMock,
  };
});
vi.mock("@/lib/agents/trace", () => ({ logAgentAction: logAgentActionMock }));
vi.mock("@/lib/acquisition/role-classifier", async () => {
  const actual = await vi.importActual<typeof import("@/lib/acquisition/role-classifier")>("@/lib/acquisition/role-classifier");
  return { ...actual, classifyMarketRole: classifyMarketRoleMock };
});
vi.mock("@/lib/acquisition/outreach-log", () => ({ sendAcquisitionOutreach: sendAcquisitionOutreachMock }));
vi.mock("@/lib/prospecting/handoff", async () => {
  const actual = await vi.importActual<typeof import("@/lib/prospecting/handoff")>("@/lib/prospecting/handoff");
  return { ...actual, createProspectHandoff: createProspectHandoffMock };
});

import { handoffCargoCarrierProspect, processCargoCarrierMarketSighting, qualifyCargoCarrierProspect } from "./orchestrator";

const CTX = { traceId: "trace-1", hop: 0 };

function classification(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    role: "CARGO_CARRIER",
    language: "RU",
    confidence: 0.92,
    originText: "Бишкек",
    destinationText: "Ош",
    departureTimeText: null,
    passengerCount: null,
    seatsAvailable: null,
    vehicleText: "фура",
    cargoDescription: null,
    businessCategoryGuess: null,
    capacityText: "20 тонн",
    temperatureCapability: false,
    backhaulText: "есть обратка",
    zonesText: null,
    ...overrides,
  };
}

function prospect(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "prospect-1",
    sourceType: "TELEGRAM_GROUP",
    sourceGroupId: null,
    sourceRef: null,
    sourceText: "Фура 20 тонн Бишкек–Ош, есть обратка",
    rawPhone: null,
    rawTelegramUsername: null,
    rawVehicleText: "фура",
    rawCapacityText: "20 тонн",
    rawRouteText: "Бишкек-Ош",
    rawTemperatureCapability: false,
    rawBackhaulText: "есть обратка",
    normalizedPhone: null,
    status: "NEW",
    handedOffAt: null,
    createdAt: new Date("2026-09-10T00:00:00.000Z"),
    updatedAt: new Date("2026-09-10T00:00:00.000Z"),
    ...overrides,
  };
}

describe("processCargoCarrierMarketSighting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips a non-cargo-carrier sighting without ever creating a prospect", async () => {
    classifyMarketRoleMock.mockResolvedValue(classification({ role: "DELIVERY_EXECUTOR" }));

    const outcome = await processCargoCarrierMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "Курьер, доставлю документы/посылки по городу" });

    expect(outcome.outcome).toBe("SKIPPED_NOT_A_CARGO_CARRIER_SIGHTING");
    expect(createProspectMock).not.toHaveBeenCalled();
  });

  it("skips a low-confidence classification even if it guesses CARGO_CARRIER", async () => {
    classifyMarketRoleMock.mockResolvedValue(classification({ confidence: 0.1 }));

    const outcome = await processCargoCarrierMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "ambiguous" });

    expect(outcome.outcome).toBe("SKIPPED_NOT_A_CARGO_CARRIER_SIGHTING");
    expect(createProspectMock).not.toHaveBeenCalled();
  });

  it("returns ALREADY_KNOWN and never creates a duplicate prospect", async () => {
    classifyMarketRoleMock.mockResolvedValue(classification());
    findExistingMock.mockResolvedValue(prospect());

    const outcome = await processCargoCarrierMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "Фура 20 тонн Бишкек–Ош, есть обратка" });

    expect(outcome.outcome).toBe("ALREADY_KNOWN");
    expect(createProspectMock).not.toHaveBeenCalled();
  });

  it("creates a prospect carrying the claimed capacity/route/backhaul as CLAIMS, with no outreach absent a contact channel", async () => {
    classifyMarketRoleMock.mockResolvedValue(classification());
    findExistingMock.mockResolvedValue(null);
    createProspectMock.mockResolvedValue(prospect());

    const outcome = await processCargoCarrierMarketSighting(CTX, {
      sourceType: "TELEGRAM_GROUP",
      sourceText: "Фура 20 тонн Бишкек–Ош, есть обратка",
      rawCapacityText: "20 тонн",
      rawBackhaulText: "есть обратка",
    });

    expect(outcome.outcome).toBe("PROSPECT_CREATED");
    if (outcome.outcome === "PROSPECT_CREATED") expect(outcome.outreach).toBeNull();
    expect(createProspectMock).toHaveBeenCalledWith(expect.objectContaining({ rawCapacityText: "20 тонн", rawBackhaulText: "есть обратка" }));
    expect(sendAcquisitionOutreachMock).not.toHaveBeenCalled();
  });

  it("sends exactly one gated outreach with a computed contact fingerprint when a phone is present", async () => {
    classifyMarketRoleMock.mockResolvedValue(classification());
    findExistingMock.mockResolvedValue(null);
    createProspectMock.mockResolvedValue(prospect({ rawPhone: "0700123456" }));
    sendAcquisitionOutreachMock.mockResolvedValue({ status: "DRY_RUN", eventId: "evt-1", deduplicated: false });
    transitionStatusMock.mockResolvedValue(prospect({ rawPhone: "0700123456", status: "CONTACTED" }));

    const outcome = await processCargoCarrierMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "text", rawPhone: "0700123456" });

    expect(outcome.outcome).toBe("PROSPECT_CREATED");
    expect(sendAcquisitionOutreachMock).toHaveBeenCalledTimes(1);
    expect(sendAcquisitionOutreachMock).toHaveBeenCalledWith(
      expect.objectContaining({ contractorAgent: "CARGO_CARRIER_CONTRACTOR", prospectType: "CARGO_CARRIER", channel: "WHATSAPP", to: "996700123456", contactFingerprint: "phone:996700123456" }),
    );
    expect(transitionStatusMock).toHaveBeenCalledWith("prospect-1", "CONTACTED");
  });
});

describe("qualifyCargoCarrierProspect", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an illegal jump straight from NEW to QUALIFIED without touching the database", async () => {
    await expect(qualifyCargoCarrierProspect(CTX, "prospect-1", { status: "NEW" })).rejects.toThrow(/rejected transition/);
    expect(transitionStatusMock).not.toHaveBeenCalled();
  });

  it("allows the legal CONTACTED -> QUALIFIED transition", async () => {
    transitionStatusMock.mockResolvedValue(prospect({ status: "QUALIFIED" }));

    const result = await qualifyCargoCarrierProspect(CTX, "prospect-1", { status: "CONTACTED" });

    expect(result.status).toBe("QUALIFIED");
    expect(transitionStatusMock).toHaveBeenCalledWith("prospect-1", "QUALIFIED");
  });
});

describe("handoffCargoCarrierProspect", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a handoff attempt from a NEW (never contacted) prospect", async () => {
    await expect(
      handoffCargoCarrierProspect(CTX, "prospect-1", {
        status: "NEW",
        rawPhone: null,
        rawTelegramUsername: null,
        rawVehicleText: null,
        rawCapacityText: null,
        rawRouteText: null,
        rawTemperatureCapability: null,
        rawBackhaulText: null,
      }),
    ).rejects.toThrow(/rejected transition/);
    expect(createProspectHandoffMock).not.toHaveBeenCalled();
  });

  it("hands off a QUALIFIED prospect to CARGO_OPERATIONS through the shared Prospecting Core, carrying claims as free-text capabilities only — never as verified facts", async () => {
    createProspectHandoffMock.mockResolvedValue({ handoff: { id: "handoff-1", status: "READY" }, deduplicated: false });
    transitionStatusMock.mockResolvedValue(prospect({ status: "HANDED_OFF" }));

    const outcome = await handoffCargoCarrierProspect(CTX, "prospect-1", {
      status: "QUALIFIED",
      rawPhone: "0700123456",
      rawTelegramUsername: null,
      rawVehicleText: "фура",
      rawCapacityText: "20 тонн",
      rawRouteText: "Бишкек-Ош",
      rawTemperatureCapability: true,
      rawBackhaulText: "есть обратка",
    });

    expect(createProspectHandoffMock).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({
        prospectType: "CARGO_CARRIER_SUPPLY",
        prospectRef: "prospect-1",
        sourceAgent: "CARGO_CARRIER_CONTRACTOR",
        targetAgentOrDepartment: "CARGO_OPERATIONS",
        availableCapabilities: expect.arrayContaining([expect.stringContaining("20 тонн"), expect.stringContaining("Бишкек-Ош"), "temperature-controlled", expect.stringContaining("обратка")]),
        contactFingerprint: "phone:996700123456",
      }),
    );
    expect(transitionStatusMock).toHaveBeenCalledWith("prospect-1", "HANDED_OFF");
    expect(outcome.prospect.status).toBe("HANDED_OFF");
  });

  it("is an idempotent no-op retry when the prospect is already HANDED_OFF", async () => {
    createProspectHandoffMock.mockResolvedValue({ handoff: { id: "handoff-1", status: "ACCEPTED" }, deduplicated: true });
    transitionStatusMock.mockResolvedValue(prospect({ status: "HANDED_OFF" }));

    const outcome = await handoffCargoCarrierProspect(CTX, "prospect-1", {
      status: "HANDED_OFF",
      rawPhone: "0700123456",
      rawTelegramUsername: null,
      rawVehicleText: null,
      rawCapacityText: null,
      rawRouteText: null,
      rawTemperatureCapability: null,
      rawBackhaulText: null,
    });

    expect(outcome.deduplicated).toBe(true);
    expect(outcome.prospect.status).toBe("HANDED_OFF");
  });
});
