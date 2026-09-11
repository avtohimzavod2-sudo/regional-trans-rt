import { beforeEach, describe, expect, it, vi } from "vitest";

// Mirrors delivery-executor-contractor/orchestrator.lifecycle.test.ts — see
// that file's header comment for what's already covered generically by
// src/lib/prospecting/lifecycle.test.ts and follow-up.test.ts. This file
// proves CARGO_CARRIER_CONTRACTOR's own orchestration wires that shared
// engine together correctly end-to-end (Task D spec H scenario 2 and friends).
const {
  transitionLifecycleMock,
  captureFactsMock,
  findPossibleDuplicateMock,
  flagPossibleDuplicateMock,
  getProspectMock,
  recordFollowUpCountersMock,
  logAgentActionMock,
  sendProspectFollowUpMock,
  createProspectHandoffMock,
} = vi.hoisted(() => ({
  transitionLifecycleMock: vi.fn(),
  captureFactsMock: vi.fn(),
  findPossibleDuplicateMock: vi.fn(),
  flagPossibleDuplicateMock: vi.fn(),
  getProspectMock: vi.fn(),
  recordFollowUpCountersMock: vi.fn(),
  logAgentActionMock: vi.fn().mockResolvedValue(undefined),
  sendProspectFollowUpMock: vi.fn(),
  createProspectHandoffMock: vi.fn(),
}));

vi.mock("./prospect", async () => {
  const actual = await vi.importActual<typeof import("./prospect")>("./prospect");
  return {
    ...actual,
    transitionCargoCarrierLifecycleStage: transitionLifecycleMock,
    captureCargoCarrierQualificationFacts: captureFactsMock,
    findPossibleDuplicateCargoCarrierProspect: findPossibleDuplicateMock,
    flagCargoCarrierPossibleDuplicate: flagPossibleDuplicateMock,
    getCargoCarrierProspect: getProspectMock,
    recordCargoCarrierFollowUpCounters: recordFollowUpCountersMock,
  };
});
vi.mock("@/lib/agents/trace", () => ({ logAgentAction: logAgentActionMock }));
vi.mock("@/lib/acquisition/follow-up", () => ({ sendProspectFollowUp: sendProspectFollowUpMock }));
vi.mock("@/lib/prospecting/handoff", async () => {
  const actual = await vi.importActual<typeof import("@/lib/prospecting/handoff")>("@/lib/prospecting/handoff");
  return { ...actual, createProspectHandoff: createProspectHandoffMock };
});

import {
  beginCargoCarrierQualification,
  completeCargoCarrierHandoff,
  followUpWithCargoCarrierProspect,
  markCargoCarrierHandoffReady,
  qualifyCargoCarrierLead,
  rejectCargoCarrierLead,
  recordCargoCarrierResponse,
  submitCargoCarrierQualification,
} from "./orchestrator";

const CTX = { traceId: "trace-1", hop: 0 };

function prospect(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "cc-1",
    lifecycleStage: "DISCOVERED",
    rawPhone: "0700123456",
    rawTelegramUsername: null,
    rawVehicleText: "фура",
    rawCapacityText: "20 тонн",
    rawRouteText: "Бишкек-Ош",
    rawTemperatureCapability: false,
    rawBackhaulText: null,
    carrierIdentityName: null,
    fleetTypeText: null,
    cargoBodyTypeText: null,
    geographicCoverageText: null,
    localIntercityInternationalText: null,
    recurringRoutesNote: null,
    schedulingText: null,
    possibleDuplicateOfId: null,
    respondedAt: null,
    followUpCount: 0,
    verificationStatus: "UNVERIFIED",
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("CARGO_CARRIER_CONTRACTOR lifecycle orchestration", () => {
  // Scenario 2: successful Cargo Carrier lifecycle end-to-end.
  it("walks a prospect through the full minimum pipeline to HANDED_OFF", async () => {
    transitionLifecycleMock
      .mockResolvedValueOnce({ prospect: prospect({ lifecycleStage: "QUALIFICATION_PENDING" }), deduplicated: false }) // begin
      .mockResolvedValueOnce({ prospect: prospect({ lifecycleStage: "QUALIFIED" }), deduplicated: false }) // qualify
      .mockResolvedValueOnce({ prospect: prospect({ lifecycleStage: "RESPONDED" }), deduplicated: false }) // response
      .mockResolvedValueOnce({ prospect: prospect({ lifecycleStage: "HANDOFF_READY" }), deduplicated: false }); // handoff-ready

    await beginCargoCarrierQualification(CTX, "cc-1");
    await qualifyCargoCarrierLead(CTX, "cc-1");
    await recordCargoCarrierResponse(CTX, "cc-1");
    await markCargoCarrierHandoffReady(CTX, "cc-1");

    getProspectMock.mockResolvedValue(prospect({ lifecycleStage: "HANDOFF_READY", carrierIdentityName: "Nurlan Transport" }));
    createProspectHandoffMock.mockResolvedValue({ handoff: { id: "handoff-1", status: "READY" }, deduplicated: false });
    transitionLifecycleMock.mockResolvedValueOnce({ prospect: prospect({ lifecycleStage: "HANDED_OFF" }), deduplicated: false });

    const result = await completeCargoCarrierHandoff(CTX, "cc-1");

    expect(result.prospect.lifecycleStage).toBe("HANDED_OFF");
    expect(result.deduplicated).toBe(false);
    expect(createProspectHandoffMock).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ prospectType: "CARGO_CARRIER_SUPPLY", prospectRef: "cc-1", targetAgentOrDepartment: "CARGO_OPERATIONS" }),
    );
  });

  // Scenario 3 (cargo variant): rejection during qualification.
  it("rejects a lead during qualification with a recorded reason", async () => {
    transitionLifecycleMock.mockResolvedValue({ prospect: prospect({ lifecycleStage: "REJECTED", rejectionReason: "no refrigeration proof" }), deduplicated: false });

    const result = await rejectCargoCarrierLead(CTX, "cc-1", "no refrigeration proof");

    expect(transitionLifecycleMock).toHaveBeenCalledWith("cc-1", "REJECTED", { rejectionReason: "no refrigeration proof" });
    expect(result.prospect.lifecycleStage).toBe("REJECTED");
    expect(logAgentActionMock).toHaveBeenCalledWith(expect.objectContaining({ action: "cargo_carrier_contractor.lead_rejected", details: { rejectionReason: "no refrigeration proof" } }));
  });

  // Scenario 4 (cargo variant): unknown facts remain unknown — never infer
  // capacity/route/licensing/refrigeration/availability without evidence.
  it("forwards only known qualification facts, never fabricating omitted ones", async () => {
    captureFactsMock.mockResolvedValue(prospect({ fleetTypeText: "3-тонник", geographicCoverageText: null }));

    await submitCargoCarrierQualification(CTX, "cc-1", { fleetTypeText: "3-тонник" });

    expect(captureFactsMock).toHaveBeenCalledWith("cc-1", { fleetTypeText: "3-тонник" });
    expect(captureFactsMock.mock.calls[0][1]).not.toHaveProperty("geographicCoverageText");
  });

  // Scenario 6 (cargo variant): possible-duplicate flagged, never merged.
  it("flags a possible duplicate by carrier identity name without merging the two records", async () => {
    captureFactsMock.mockResolvedValue(prospect({ carrierIdentityName: "Nurlan Transport" }));
    findPossibleDuplicateMock.mockResolvedValue(prospect({ id: "cc-0", carrierIdentityName: "Nurlan Transport" }));
    flagPossibleDuplicateMock.mockResolvedValue(prospect({ carrierIdentityName: "Nurlan Transport", possibleDuplicateOfId: "cc-0" }));

    const result = await submitCargoCarrierQualification(CTX, "cc-1", { carrierIdentityName: "Nurlan Transport" });

    expect(findPossibleDuplicateMock).toHaveBeenCalledWith("Nurlan Transport", "cc-1");
    expect(flagPossibleDuplicateMock).toHaveBeenCalledWith("cc-1", "cc-0");
    expect(result.possibleDuplicateOfId).toBe("cc-0");
    expect(result.id).toBe("cc-1");
  });

  // Scenario 9 (cargo variant): follow-up stops after a response.
  it("does not send a follow-up once the prospect has already responded", async () => {
    getProspectMock.mockResolvedValue(prospect({ lifecycleStage: "RESPONDED", respondedAt: new Date("2026-09-10T00:00:00.000Z") }));
    sendProspectFollowUpMock.mockResolvedValue({ sent: false, skippedReason: "ALREADY_RESPONDED", attemptNumber: 1, deduplicated: false });

    const { outcome } = await followUpWithCargoCarrierProspect(CTX, "cc-1", {
      channel: "WHATSAPP",
      sourceType: "TELEGRAM_GROUP",
      to: "996700123456",
      text: "follow up",
    });

    expect(sendProspectFollowUpMock).toHaveBeenCalledWith(CTX, expect.objectContaining({ hasResponded: true }));
    expect(outcome.skippedReason).toBe("ALREADY_RESPONDED");
    expect(transitionLifecycleMock).not.toHaveBeenCalled();
  });

  // Scenario 10 (cargo variant): duplicate follow-up prevention.
  it("treats a retried follow-up attempt as a deduplicated no-op, not a second send", async () => {
    getProspectMock.mockResolvedValue(prospect({ lifecycleStage: "CONTACTED", followUpCount: 1 }));
    sendProspectFollowUpMock.mockResolvedValue({ sent: true, outreachStatus: "SENT", attemptNumber: 2, deduplicated: true, eventId: "evt-1" });
    recordFollowUpCountersMock.mockResolvedValue(prospect({ lifecycleStage: "FOLLOW_UP_PENDING", followUpCount: 2 }));

    const { outcome } = await followUpWithCargoCarrierProspect(CTX, "cc-1", {
      channel: "WHATSAPP",
      sourceType: "TELEGRAM_GROUP",
      to: "996700123456",
      text: "follow up",
    });

    expect(outcome.deduplicated).toBe(true);
    expect(sendProspectFollowUpMock).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ idempotencyKey: "cargo-carrier-contractor:cc-1:follow-up:2" }),
    );
  });

  // Scenario 11 (cargo variant): HANDOFF_READY -> HANDED_OFF.
  it("completes the lifecycle handoff, transitioning HANDOFF_READY to HANDED_OFF", async () => {
    getProspectMock.mockResolvedValue(prospect({ lifecycleStage: "HANDOFF_READY", carrierIdentityName: "Nurlan Transport", geographicCoverageText: "Чуй облусу" }));
    createProspectHandoffMock.mockResolvedValue({ handoff: { id: "handoff-1", status: "READY" }, deduplicated: false });
    transitionLifecycleMock.mockResolvedValue({ prospect: prospect({ lifecycleStage: "HANDED_OFF" }), deduplicated: false });

    const result = await completeCargoCarrierHandoff(CTX, "cc-1");

    expect(transitionLifecycleMock).toHaveBeenCalledWith("cc-1", "HANDED_OFF");
    expect(result.prospect.lifecycleStage).toBe("HANDED_OFF");
    expect(result.handoffDeduplicated).toBe(false);
    expect(logAgentActionMock).toHaveBeenCalledWith(expect.objectContaining({ action: "cargo_carrier_contractor.lifecycle_handed_off" }));
  });

  // Scenario 12 (cargo variant): duplicate handoff prevention.
  it("is a safe no-op when the lifecycle handoff is replayed after already completing", async () => {
    getProspectMock.mockResolvedValue(prospect({ lifecycleStage: "HANDED_OFF" }));
    createProspectHandoffMock.mockResolvedValue({ handoff: { id: "handoff-1", status: "ACCEPTED" }, deduplicated: true });
    transitionLifecycleMock.mockResolvedValue({ prospect: prospect({ lifecycleStage: "HANDED_OFF" }), deduplicated: true });

    const result = await completeCargoCarrierHandoff(CTX, "cc-1");

    expect(result.deduplicated).toBe(true);
    expect(result.handoffDeduplicated).toBe(true);
    expect(logAgentActionMock).not.toHaveBeenCalledWith(expect.objectContaining({ action: "cargo_carrier_contractor.lifecycle_handed_off" }));
  });

  // Scenario 13 (cargo variant): retry behavior.
  it("does not re-log a stage transition when the underlying transition is a deduplicated retry", async () => {
    transitionLifecycleMock.mockResolvedValue({ prospect: prospect({ lifecycleStage: "QUALIFICATION_PENDING" }), deduplicated: true });

    await beginCargoCarrierQualification(CTX, "cc-1");

    expect(logAgentActionMock).not.toHaveBeenCalled();
  });

  // Scenario 14 (cargo variant): provenance preservation.
  it("preserves previously captured facts on a second qualification submission", async () => {
    captureFactsMock.mockResolvedValue(prospect({ fleetTypeText: "3-тонник" }));

    const result = await submitCargoCarrierQualification(CTX, "cc-1", { fleetTypeText: "рефрижератор" });

    expect(result.fleetTypeText).toBe("3-тонник");
  });
});
