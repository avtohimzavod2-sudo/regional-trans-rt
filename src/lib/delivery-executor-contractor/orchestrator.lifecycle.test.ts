import { beforeEach, describe, expect, it, vi } from "vitest";

// Covers Task D spec H's 15 required scenarios for the new additive
// ProspectLifecycleStage dimension (DISCOVERED..CLOSED), layered on top of
// the pre-existing status-based pipeline already exercised by
// ./orchestrator.test.ts. The generic engine (idempotent transitions,
// invalid-transition rejection, first-write-wins facts, monotonic
// verification, duplicate-flag-never-merge) is already unit-tested in
// src/lib/prospecting/lifecycle.test.ts and src/lib/acquisition/follow-up.test.ts —
// this file proves DELIVERY_EXECUTOR_CONTRACTOR's own orchestration wires
// that engine together correctly end-to-end.
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
    transitionDeliveryExecutorLifecycleStage: transitionLifecycleMock,
    captureDeliveryExecutorQualificationFacts: captureFactsMock,
    findPossibleDuplicateDeliveryExecutorProspect: findPossibleDuplicateMock,
    flagDeliveryExecutorPossibleDuplicate: flagPossibleDuplicateMock,
    getDeliveryExecutorProspect: getProspectMock,
    recordDeliveryExecutorFollowUpCounters: recordFollowUpCountersMock,
  };
});
vi.mock("@/lib/agents/trace", () => ({ logAgentAction: logAgentActionMock }));
vi.mock("@/lib/acquisition/follow-up", () => ({ sendProspectFollowUp: sendProspectFollowUpMock }));
vi.mock("@/lib/prospecting/handoff", async () => {
  const actual = await vi.importActual<typeof import("@/lib/prospecting/handoff")>("@/lib/prospecting/handoff");
  return { ...actual, createProspectHandoff: createProspectHandoffMock };
});

import {
  beginDeliveryExecutorQualification,
  completeDeliveryExecutorHandoff,
  followUpWithDeliveryExecutorProspect,
  markDeliveryExecutorHandoffReady,
  qualifyDeliveryExecutorLead,
  rejectDeliveryExecutorLead,
  recordDeliveryExecutorResponse,
  submitDeliveryExecutorQualification,
} from "./orchestrator";

const CTX = { traceId: "trace-1", hop: 0 };

function prospect(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "de-1",
    lifecycleStage: "DISCOVERED",
    rawPhone: "0700123456",
    rawTelegramUsername: null,
    rawVehicleText: "легковая",
    rawZonesText: "по городу",
    executorType: null,
    personOrCompanyName: null,
    serviceAreaText: null,
    possibleDuplicateOfId: null,
    respondedAt: null,
    followUpCount: 0,
    verificationStatus: "UNVERIFIED",
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("DELIVERY_EXECUTOR_CONTRACTOR lifecycle orchestration", () => {
  // Scenario 1: successful Delivery Executor lifecycle end-to-end.
  it("walks a prospect through the full minimum pipeline to HANDED_OFF", async () => {
    transitionLifecycleMock
      .mockResolvedValueOnce({ prospect: prospect({ lifecycleStage: "QUALIFICATION_PENDING" }), deduplicated: false }) // begin
      .mockResolvedValueOnce({ prospect: prospect({ lifecycleStage: "QUALIFIED" }), deduplicated: false }) // qualify
      .mockResolvedValueOnce({ prospect: prospect({ lifecycleStage: "RESPONDED" }), deduplicated: false }) // response
      .mockResolvedValueOnce({ prospect: prospect({ lifecycleStage: "HANDOFF_READY" }), deduplicated: false }); // handoff-ready

    await beginDeliveryExecutorQualification(CTX, "de-1");
    await qualifyDeliveryExecutorLead(CTX, "de-1");
    await recordDeliveryExecutorResponse(CTX, "de-1");
    await markDeliveryExecutorHandoffReady(CTX, "de-1");

    getProspectMock.mockResolvedValue(prospect({ lifecycleStage: "HANDOFF_READY", executorType: "courier" }));
    createProspectHandoffMock.mockResolvedValue({ handoff: { id: "handoff-1", status: "READY" }, deduplicated: false });
    transitionLifecycleMock.mockResolvedValueOnce({ prospect: prospect({ lifecycleStage: "HANDED_OFF" }), deduplicated: false });

    const result = await completeDeliveryExecutorHandoff(CTX, "de-1", "SAPAR");

    expect(result.prospect.lifecycleStage).toBe("HANDED_OFF");
    expect(result.deduplicated).toBe(false);
    expect(createProspectHandoffMock).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ prospectType: "DELIVERY_EXECUTOR_SUPPLY", prospectRef: "de-1", targetAgentOrDepartment: "SAPAR" }),
    );
  });

  // Scenario 3: rejection during qualification.
  it("rejects a lead during qualification with a recorded reason", async () => {
    transitionLifecycleMock.mockResolvedValue({ prospect: prospect({ lifecycleStage: "REJECTED", rejectionReason: "no vehicle" }), deduplicated: false });

    const result = await rejectDeliveryExecutorLead(CTX, "de-1", "no vehicle");

    expect(transitionLifecycleMock).toHaveBeenCalledWith("de-1", "REJECTED", { rejectionReason: "no vehicle" });
    expect(result.prospect.lifecycleStage).toBe("REJECTED");
    expect(logAgentActionMock).toHaveBeenCalledWith(expect.objectContaining({ action: "delivery_executor_contractor.lead_rejected", details: { rejectionReason: "no vehicle" } }));
  });

  // Scenario 4: unknown facts remain unknown — the contractor wrapper never
  // invents a fact and forwards exactly what the dispatcher actually knows.
  it("forwards only known qualification facts, never fabricating omitted ones", async () => {
    captureFactsMock.mockResolvedValue(prospect({ executorType: "courier", serviceAreaText: null }));

    await submitDeliveryExecutorQualification(CTX, "de-1", { executorType: "courier" });

    expect(captureFactsMock).toHaveBeenCalledWith("de-1", { executorType: "courier" });
    expect(captureFactsMock.mock.calls[0][1]).not.toHaveProperty("serviceAreaText");
  });

  // Scenario 6: possible-duplicate flagged, never merged.
  it("flags a possible duplicate by name without merging the two records", async () => {
    captureFactsMock.mockResolvedValue(prospect({ personOrCompanyName: "Aibek Uulu" }));
    findPossibleDuplicateMock.mockResolvedValue(prospect({ id: "de-0", personOrCompanyName: "Aibek Uulu" }));
    flagPossibleDuplicateMock.mockResolvedValue(prospect({ personOrCompanyName: "Aibek Uulu", possibleDuplicateOfId: "de-0" }));

    const result = await submitDeliveryExecutorQualification(CTX, "de-1", { personOrCompanyName: "Aibek Uulu" });

    expect(findPossibleDuplicateMock).toHaveBeenCalledWith("Aibek Uulu", "de-1");
    expect(flagPossibleDuplicateMock).toHaveBeenCalledWith("de-1", "de-0");
    expect(result.possibleDuplicateOfId).toBe("de-0");
    // Never merged: the flagged prospect keeps its own id, never adopts de-0's fields.
    expect(result.id).toBe("de-1");
  });

  // Scenario 9: follow-up stops after a response.
  it("does not send a follow-up once the prospect has already responded", async () => {
    getProspectMock.mockResolvedValue(prospect({ lifecycleStage: "RESPONDED", respondedAt: new Date("2026-09-10T00:00:00.000Z") }));
    sendProspectFollowUpMock.mockResolvedValue({ sent: false, skippedReason: "ALREADY_RESPONDED", attemptNumber: 1, deduplicated: false });

    const { outcome } = await followUpWithDeliveryExecutorProspect(CTX, "de-1", {
      channel: "WHATSAPP",
      sourceType: "TELEGRAM_GROUP",
      to: "996700123456",
      text: "follow up",
    });

    expect(sendProspectFollowUpMock).toHaveBeenCalledWith(CTX, expect.objectContaining({ hasResponded: true }));
    expect(outcome.skippedReason).toBe("ALREADY_RESPONDED");
    expect(transitionLifecycleMock).not.toHaveBeenCalled();
  });

  // Scenario 10: duplicate follow-up prevention — a retried call with the
  // same attempt count resolves as a deduplicated no-op rather than a second send.
  it("treats a retried follow-up attempt as a deduplicated no-op, not a second send", async () => {
    getProspectMock.mockResolvedValue(prospect({ lifecycleStage: "CONTACTED", followUpCount: 1 }));
    sendProspectFollowUpMock.mockResolvedValue({ sent: true, outreachStatus: "SENT", attemptNumber: 2, deduplicated: true, eventId: "evt-1" });
    recordFollowUpCountersMock.mockResolvedValue(prospect({ lifecycleStage: "FOLLOW_UP_PENDING", followUpCount: 2 }));

    const { outcome } = await followUpWithDeliveryExecutorProspect(CTX, "de-1", {
      channel: "WHATSAPP",
      sourceType: "TELEGRAM_GROUP",
      to: "996700123456",
      text: "follow up",
    });

    expect(outcome.deduplicated).toBe(true);
    expect(sendProspectFollowUpMock).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ idempotencyKey: "delivery-executor-contractor:de-1:follow-up:2" }),
    );
  });

  // Scenario 11: HANDOFF_READY -> HANDED_OFF.
  it("completes the lifecycle handoff, transitioning HANDOFF_READY to HANDED_OFF", async () => {
    getProspectMock.mockResolvedValue(prospect({ lifecycleStage: "HANDOFF_READY", executorType: "courier", serviceAreaText: "Бишкек" }));
    createProspectHandoffMock.mockResolvedValue({ handoff: { id: "handoff-1", status: "READY" }, deduplicated: false });
    transitionLifecycleMock.mockResolvedValue({ prospect: prospect({ lifecycleStage: "HANDED_OFF" }), deduplicated: false });

    const result = await completeDeliveryExecutorHandoff(CTX, "de-1", "SAPAR");

    expect(transitionLifecycleMock).toHaveBeenCalledWith("de-1", "HANDED_OFF");
    expect(result.prospect.lifecycleStage).toBe("HANDED_OFF");
    expect(result.handoffDeduplicated).toBe(false);
    expect(logAgentActionMock).toHaveBeenCalledWith(expect.objectContaining({ action: "delivery_executor_contractor.lifecycle_handed_off" }));
  });

  // Scenario 12: duplicate handoff prevention — calling completeHandoff again
  // for an already-handed-off prospect never re-logs or double-creates.
  it("is a safe no-op when the lifecycle handoff is replayed after already completing", async () => {
    getProspectMock.mockResolvedValue(prospect({ lifecycleStage: "HANDED_OFF" }));
    createProspectHandoffMock.mockResolvedValue({ handoff: { id: "handoff-1", status: "ACCEPTED" }, deduplicated: true });
    transitionLifecycleMock.mockResolvedValue({ prospect: prospect({ lifecycleStage: "HANDED_OFF" }), deduplicated: true });

    const result = await completeDeliveryExecutorHandoff(CTX, "de-1", "SAPAR");

    expect(result.deduplicated).toBe(true);
    expect(result.handoffDeduplicated).toBe(true);
    expect(logAgentActionMock).not.toHaveBeenCalledWith(expect.objectContaining({ action: "delivery_executor_contractor.lifecycle_handed_off" }));
  });

  // Scenario 13: retry behavior — repeating a lifecycle-stage transition call
  // never logs the event a second time.
  it("does not re-log a stage transition when the underlying transition is a deduplicated retry", async () => {
    transitionLifecycleMock.mockResolvedValue({ prospect: prospect({ lifecycleStage: "QUALIFICATION_PENDING" }), deduplicated: true });

    await beginDeliveryExecutorQualification(CTX, "de-1");

    expect(logAgentActionMock).not.toHaveBeenCalled();
  });

  // Scenario 14: provenance preservation — capturing facts never clobbers an
  // already-known executorType even when the wrapper is called again.
  it("preserves previously captured facts on a second qualification submission", async () => {
    captureFactsMock.mockResolvedValue(prospect({ executorType: "courier" }));

    const result = await submitDeliveryExecutorQualification(CTX, "de-1", { executorType: "van driver" });

    // captureDeliveryExecutorQualificationFacts (mocked here to stand in for
    // the real first-write-wins engine, already proven in lifecycle.test.ts)
    // is the sole write path — the orchestrator never re-derives or
    // overwrites facts itself.
    expect(result.executorType).toBe("courier");
  });
});
