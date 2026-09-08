import { describe, expect, it } from "vitest";
import { deriveCargoLeadStage, deriveLeadStage } from "./lead-lifecycle";

describe("deriveLeadStage — derived mapping over existing RequestStatus (spec s.11)", () => {
  it("no TripRequest yet -> NEW", () => {
    expect(deriveLeadStage({})).toBe("NEW");
    expect(deriveLeadStage({ requestStatus: null })).toBe("NEW");
  });

  it("PENDING -> QUALIFIED", () => {
    expect(deriveLeadStage({ requestStatus: "PENDING" })).toBe("QUALIFIED");
  });

  it("MATCHING -> SEARCHING", () => {
    expect(deriveLeadStage({ requestStatus: "MATCHING" })).toBe("SEARCHING");
  });

  it("MATCHED -> OFFERED", () => {
    expect(deriveLeadStage({ requestStatus: "MATCHED" })).toBe("OFFERED");
  });

  it("CONFIRMED -> CONFIRMED", () => {
    expect(deriveLeadStage({ requestStatus: "CONFIRMED" })).toBe("CONFIRMED");
  });

  it("COMPLETED -> COMPLETED", () => {
    expect(deriveLeadStage({ requestStatus: "COMPLETED" })).toBe("COMPLETED");
  });

  it("EXPIRED -> UNFULFILLED", () => {
    expect(deriveLeadStage({ requestStatus: "EXPIRED" })).toBe("UNFULFILLED");
  });

  it("CANCELLED without a decline reason -> CANCELLED", () => {
    expect(deriveLeadStage({ requestStatus: "CANCELLED" })).toBe("CANCELLED");
  });

  it("CANCELLED with a captured decline reason -> DECLINED", () => {
    expect(deriveLeadStage({ requestStatus: "CANCELLED", declineReasonCategory: "PRICE" })).toBe("DECLINED");
  });
});

describe("deriveCargoLeadStage — derived mapping over existing ShipmentStatus", () => {
  it("DRAFT/NEEDS_INFO -> NEW", () => {
    expect(deriveCargoLeadStage("DRAFT")).toBe("NEW");
    expect(deriveCargoLeadStage("NEEDS_INFO")).toBe("NEW");
  });

  it("QUOTED/AWAITING_CONFIRMATION -> OFFERED", () => {
    expect(deriveCargoLeadStage("QUOTED")).toBe("OFFERED");
    expect(deriveCargoLeadStage("AWAITING_CONFIRMATION")).toBe("OFFERED");
  });

  it("DELIVERED -> COMPLETED", () => {
    expect(deriveCargoLeadStage("DELIVERED")).toBe("COMPLETED");
  });

  it("FAILED -> UNFULFILLED, CANCELLED -> CANCELLED", () => {
    expect(deriveCargoLeadStage("FAILED")).toBe("UNFULFILLED");
    expect(deriveCargoLeadStage("CANCELLED")).toBe("CANCELLED");
  });

  it("DISPUTED is still in progress, not silently dropped to a default bucket", () => {
    expect(deriveCargoLeadStage("DISPUTED")).toBe("IN_PROGRESS");
  });
});
