import { describe, expect, it } from "vitest";
import { canOpenBreakdown, canResolveBreakdown, validateOperationalEvent } from "./lifecycle";

describe("validateOperationalEvent", () => {
  it("rejects a blank source", () => {
    const result = validateOperationalEvent({ eventType: "BACKHAUL_OPPORTUNITY", source: "  " });
    expect(result.valid).toBe(false);
  });

  it("accepts a valid OPERATIONAL_ETA draft", () => {
    const result = validateOperationalEvent({ eventType: "OPERATIONAL_ETA", etaMinutes: 12, source: "JOLCHU" });
    expect(result.valid).toBe(true);
  });

  it("rejects OPERATIONAL_ETA without etaMinutes (never invents an ETA)", () => {
    const result = validateOperationalEvent({ eventType: "OPERATIONAL_ETA", source: "JOLCHU" });
    expect(result.valid).toBe(false);
  });

  it("rejects a negative etaMinutes", () => {
    const result = validateOperationalEvent({ eventType: "OPERATIONAL_ETA", etaMinutes: -5, source: "JOLCHU" });
    expect(result.valid).toBe(false);
  });

  it("rejects etaMinutes on a non-ETA event", () => {
    const result = validateOperationalEvent({ eventType: "BACKHAUL_OPPORTUNITY", etaMinutes: 5, source: "JOLCHU" });
    expect(result.valid).toBe(false);
  });

  it("accepts a valid BREAKDOWN_INCIDENT draft", () => {
    const result = validateOperationalEvent({ eventType: "BREAKDOWN_INCIDENT", incidentStatus: "OPEN", source: "DRIVER_REPORT" });
    expect(result.valid).toBe(true);
  });

  it("rejects BREAKDOWN_INCIDENT without an incidentStatus", () => {
    const result = validateOperationalEvent({ eventType: "BREAKDOWN_INCIDENT", source: "DRIVER_REPORT" });
    expect(result.valid).toBe(false);
  });

  it("rejects incidentStatus on a non-breakdown event", () => {
    const result = validateOperationalEvent({ eventType: "OPERATIONAL_HISTORY", incidentStatus: "OPEN", source: "SYSTEM" });
    expect(result.valid).toBe(false);
  });

  it("accepts a plain OPERATIONAL_HISTORY / BACKHAUL_OPPORTUNITY draft", () => {
    expect(validateOperationalEvent({ eventType: "OPERATIONAL_HISTORY", source: "SYSTEM" }).valid).toBe(true);
    expect(validateOperationalEvent({ eventType: "BACKHAUL_OPPORTUNITY", source: "RT_OFFICE" }).valid).toBe(true);
  });

  it("accepts a valid CORRECTION draft referencing the event it corrects", () => {
    const result = validateOperationalEvent({ eventType: "CORRECTION", source: "RT_OFFICE", correctsEventId: "evt-1" });
    expect(result.valid).toBe(true);
  });

  it("rejects CORRECTION without a correctsEventId (an exceptional correction must reference what it corrects)", () => {
    const result = validateOperationalEvent({ eventType: "CORRECTION", source: "RT_OFFICE" });
    expect(result.valid).toBe(false);
  });

  it("rejects a blank correctsEventId on CORRECTION", () => {
    const result = validateOperationalEvent({ eventType: "CORRECTION", source: "RT_OFFICE", correctsEventId: "  " });
    expect(result.valid).toBe(false);
  });

  it("rejects correctsEventId on a non-CORRECTION event", () => {
    const result = validateOperationalEvent({ eventType: "OPERATIONAL_HISTORY", source: "SYSTEM", correctsEventId: "evt-1" });
    expect(result.valid).toBe(false);
  });
});

describe("canResolveBreakdown", () => {
  it("allows resolution when an OPEN incident exists", () => {
    expect(canResolveBreakdown(true).valid).toBe(true);
  });

  it("rejects resolution when no OPEN incident exists (never invents a resolution)", () => {
    expect(canResolveBreakdown(false).valid).toBe(false);
  });
});

describe("canOpenBreakdown", () => {
  it("allows opening when no OPEN incident already exists", () => {
    expect(canOpenBreakdown(false).valid).toBe(true);
  });

  it("rejects opening a second concurrent OPEN incident for the same driver", () => {
    expect(canOpenBreakdown(true).valid).toBe(false);
  });
});
