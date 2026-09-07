import { describe, expect, it } from "vitest";
import { assertExactlyThreeInitiatives, isValidInitiativeTransition } from "./initiatives";
import type { WeeklyInitiative } from "./types";

const initiative = (title: string): WeeklyInitiative => ({
  title,
  proposal: "Proposal text.",
  whyNow: "Why now text.",
  evidence: "Evidence text.",
  expectedEffect: "Expected effect text.",
  complexity: "Low",
  resources: null,
  risks: "Risk text.",
  priority: "MEDIUM",
  successMetric: "Metric text.",
});

describe("assertExactlyThreeInitiatives", () => {
  it("accepts exactly 3 well-formed initiatives", () => {
    const initiatives = [initiative("A"), initiative("B"), initiative("C")];
    expect(assertExactlyThreeInitiatives(initiatives)).toEqual(initiatives);
  });

  it("throws for 2 initiatives (spec s.15/s.35: never fewer than 3)", () => {
    expect(() => assertExactlyThreeInitiatives([initiative("A"), initiative("B")])).toThrow();
  });

  it("throws for 4 initiatives (spec s.15/s.35: never more than 3)", () => {
    expect(() => assertExactlyThreeInitiatives([initiative("A"), initiative("B"), initiative("C"), initiative("D")])).toThrow();
  });

  it("throws for 0 initiatives", () => {
    expect(() => assertExactlyThreeInitiatives([])).toThrow();
  });

  it("throws when a required field is missing/empty rather than silently accepting it", () => {
    const broken = [initiative("A"), { ...initiative("B"), proposal: "" }, initiative("C")];
    expect(() => assertExactlyThreeInitiatives(broken)).toThrow();
  });
});

describe("isValidInitiativeTransition (Founder Approval Workflow state machine, spec s.16/s.23)", () => {
  it("allows PROPOSED to move to any of APPROVED/REJECTED/DEFERRED/NEEDS_REVISION", () => {
    expect(isValidInitiativeTransition("PROPOSED", "APPROVED")).toBe(true);
    expect(isValidInitiativeTransition("PROPOSED", "REJECTED")).toBe(true);
    expect(isValidInitiativeTransition("PROPOSED", "DEFERRED")).toBe(true);
    expect(isValidInitiativeTransition("PROPOSED", "NEEDS_REVISION")).toBe(true);
  });

  it("never allows skipping straight from PROPOSED to IN_PROGRESS/COMPLETED/MEASURED", () => {
    expect(isValidInitiativeTransition("PROPOSED", "IN_PROGRESS")).toBe(false);
    expect(isValidInitiativeTransition("PROPOSED", "COMPLETED")).toBe(false);
    expect(isValidInitiativeTransition("PROPOSED", "MEASURED")).toBe(false);
  });

  it("only allows APPROVED to move to IN_PROGRESS", () => {
    expect(isValidInitiativeTransition("APPROVED", "IN_PROGRESS")).toBe(true);
    expect(isValidInitiativeTransition("APPROVED", "COMPLETED")).toBe(false);
    expect(isValidInitiativeTransition("APPROVED", "REJECTED")).toBe(false);
  });

  it("only allows IN_PROGRESS to move to COMPLETED, and COMPLETED to move to MEASURED", () => {
    expect(isValidInitiativeTransition("IN_PROGRESS", "COMPLETED")).toBe(true);
    expect(isValidInitiativeTransition("IN_PROGRESS", "MEASURED")).toBe(false);
    expect(isValidInitiativeTransition("COMPLETED", "MEASURED")).toBe(true);
  });

  it("treats REJECTED and MEASURED as terminal states with no further transitions", () => {
    expect(isValidInitiativeTransition("REJECTED", "APPROVED")).toBe(false);
    expect(isValidInitiativeTransition("REJECTED", "PROPOSED")).toBe(false);
    expect(isValidInitiativeTransition("MEASURED", "APPROVED")).toBe(false);
  });

  it("allows DEFERRED to be revisited later as APPROVED or REJECTED, but not back to NEEDS_REVISION", () => {
    expect(isValidInitiativeTransition("DEFERRED", "APPROVED")).toBe(true);
    expect(isValidInitiativeTransition("DEFERRED", "REJECTED")).toBe(true);
    expect(isValidInitiativeTransition("DEFERRED", "NEEDS_REVISION")).toBe(false);
  });
});
