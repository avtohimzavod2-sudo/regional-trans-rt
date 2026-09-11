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
    findExistingDeliveryExecutorProspect: findExistingMock,
    createDeliveryExecutorProspect: createProspectMock,
    transitionDeliveryExecutorProspectStatus: transitionStatusMock,
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

import { handoffDeliveryExecutorProspect, processDeliveryExecutorMarketSighting, qualifyDeliveryExecutorProspect } from "./orchestrator";

const CTX = { traceId: "trace-1", hop: 0 };

function classification(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    role: "DELIVERY_EXECUTOR",
    language: "RU",
    confidence: 0.9,
    originText: null,
    destinationText: null,
    departureTimeText: null,
    passengerCount: null,
    seatsAvailable: null,
    vehicleText: "легковая",
    cargoDescription: null,
    businessCategoryGuess: null,
    capacityText: null,
    temperatureCapability: null,
    backhaulText: null,
    zonesText: "по городу",
    ...overrides,
  };
}

function prospect(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "prospect-1",
    sourceType: "TELEGRAM_GROUP",
    sourceGroupId: null,
    sourceRef: null,
    sourceText: "Курьер, доставлю документы/посылки по городу",
    rawPhone: null,
    rawTelegramUsername: null,
    rawVehicleText: "легковая",
    rawZonesText: "по городу",
    normalizedPhone: null,
    status: "NEW",
    handedOffAt: null,
    createdAt: new Date("2026-09-10T00:00:00.000Z"),
    updatedAt: new Date("2026-09-10T00:00:00.000Z"),
    ...overrides,
  };
}

describe("processDeliveryExecutorMarketSighting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips a non-delivery-executor sighting without ever creating a prospect", async () => {
    classifyMarketRoleMock.mockResolvedValue(classification({ role: "CARGO_CARRIER" }));

    const outcome = await processDeliveryExecutorMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "Фура 20 тонн Бишкек–Ош, есть обратка" });

    expect(outcome.outcome).toBe("SKIPPED_NOT_A_DELIVERY_EXECUTOR_SIGHTING");
    expect(createProspectMock).not.toHaveBeenCalled();
  });

  it("skips a low-confidence classification even if it guesses DELIVERY_EXECUTOR", async () => {
    classifyMarketRoleMock.mockResolvedValue(classification({ confidence: 0.1 }));

    const outcome = await processDeliveryExecutorMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "ambiguous" });

    expect(outcome.outcome).toBe("SKIPPED_NOT_A_DELIVERY_EXECUTOR_SIGHTING");
    expect(createProspectMock).not.toHaveBeenCalled();
  });

  it("returns ALREADY_KNOWN and never creates a duplicate prospect", async () => {
    classifyMarketRoleMock.mockResolvedValue(classification());
    findExistingMock.mockResolvedValue(prospect());

    const outcome = await processDeliveryExecutorMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "Курьер, доставлю документы/посылки по городу" });

    expect(outcome.outcome).toBe("ALREADY_KNOWN");
    expect(createProspectMock).not.toHaveBeenCalled();
  });

  it("creates a prospect and logs it, with no outreach when no contact channel is resolvable", async () => {
    classifyMarketRoleMock.mockResolvedValue(classification());
    findExistingMock.mockResolvedValue(null);
    createProspectMock.mockResolvedValue(prospect());

    const outcome = await processDeliveryExecutorMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "Курьер, доставлю документы/посылки по городу" });

    expect(outcome.outcome).toBe("PROSPECT_CREATED");
    if (outcome.outcome === "PROSPECT_CREATED") expect(outcome.outreach).toBeNull();
    expect(sendAcquisitionOutreachMock).not.toHaveBeenCalled();
    expect(logAgentActionMock).toHaveBeenCalledWith(expect.objectContaining({ agent: "DELIVERY_EXECUTOR_CONTRACTOR", entityId: "prospect-1" }));
  });

  it("sends exactly one gated outreach with a computed contact fingerprint when a phone is present", async () => {
    classifyMarketRoleMock.mockResolvedValue(classification());
    findExistingMock.mockResolvedValue(null);
    createProspectMock.mockResolvedValue(prospect({ rawPhone: "0700123456" }));
    sendAcquisitionOutreachMock.mockResolvedValue({ status: "DRY_RUN", eventId: "evt-1", deduplicated: false });
    transitionStatusMock.mockResolvedValue(prospect({ rawPhone: "0700123456", status: "CONTACTED" }));

    const outcome = await processDeliveryExecutorMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "text", rawPhone: "0700123456" });

    expect(outcome.outcome).toBe("PROSPECT_CREATED");
    expect(sendAcquisitionOutreachMock).toHaveBeenCalledTimes(1);
    expect(sendAcquisitionOutreachMock).toHaveBeenCalledWith(
      expect.objectContaining({ contractorAgent: "DELIVERY_EXECUTOR_CONTRACTOR", prospectType: "DELIVERY_EXECUTOR", channel: "WHATSAPP", to: "996700123456", contactFingerprint: "phone:996700123456" }),
    );
    expect(transitionStatusMock).toHaveBeenCalledWith("prospect-1", "CONTACTED");
  });
});

describe("qualifyDeliveryExecutorProspect", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an illegal jump straight from NEW to QUALIFIED without touching the database", async () => {
    await expect(qualifyDeliveryExecutorProspect(CTX, "prospect-1", { status: "NEW" })).rejects.toThrow(/rejected transition/);
    expect(transitionStatusMock).not.toHaveBeenCalled();
  });

  it("allows the legal CONTACTED -> QUALIFIED transition", async () => {
    transitionStatusMock.mockResolvedValue(prospect({ status: "QUALIFIED" }));

    const result = await qualifyDeliveryExecutorProspect(CTX, "prospect-1", { status: "CONTACTED" });

    expect(result.status).toBe("QUALIFIED");
    expect(transitionStatusMock).toHaveBeenCalledWith("prospect-1", "QUALIFIED");
  });
});

describe("handoffDeliveryExecutorProspect", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a handoff attempt from a NEW (never contacted) prospect", async () => {
    await expect(
      handoffDeliveryExecutorProspect(CTX, "prospect-1", { status: "NEW", rawPhone: null, rawTelegramUsername: null, rawVehicleText: null, rawZonesText: null }, "SAPAR"),
    ).rejects.toThrow(/rejected transition/);
    expect(createProspectHandoffMock).not.toHaveBeenCalled();
  });

  it("hands off a QUALIFIED prospect through the shared Prospecting Core, never a bespoke handoff", async () => {
    createProspectHandoffMock.mockResolvedValue({ handoff: { id: "handoff-1", status: "READY" }, deduplicated: false });
    transitionStatusMock.mockResolvedValue(prospect({ status: "HANDED_OFF" }));

    const outcome = await handoffDeliveryExecutorProspect(
      CTX,
      "prospect-1",
      { status: "QUALIFIED", rawPhone: "0700123456", rawTelegramUsername: null, rawVehicleText: "легковая", rawZonesText: "по городу" },
      "SAPAR",
    );

    expect(createProspectHandoffMock).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ prospectType: "DELIVERY_EXECUTOR_SUPPLY", prospectRef: "prospect-1", sourceAgent: "DELIVERY_EXECUTOR_CONTRACTOR", targetAgentOrDepartment: "SAPAR", contactFingerprint: "phone:996700123456" }),
    );
    expect(transitionStatusMock).toHaveBeenCalledWith("prospect-1", "HANDED_OFF");
    expect(outcome.prospect.status).toBe("HANDED_OFF");
  });

  it("is an idempotent no-op retry when the prospect is already HANDED_OFF", async () => {
    createProspectHandoffMock.mockResolvedValue({ handoff: { id: "handoff-1", status: "ACCEPTED" }, deduplicated: true });
    transitionStatusMock.mockResolvedValue(prospect({ status: "HANDED_OFF" }));

    const outcome = await handoffDeliveryExecutorProspect(
      CTX,
      "prospect-1",
      { status: "HANDED_OFF", rawPhone: "0700123456", rawTelegramUsername: null, rawVehicleText: null, rawZonesText: null },
      "SAPAR",
    );

    expect(outcome.deduplicated).toBe(true);
    expect(outcome.prospect.status).toBe("HANDED_OFF");
  });
});
