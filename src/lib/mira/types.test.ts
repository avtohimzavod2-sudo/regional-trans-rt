import { describe, expect, it } from "vitest";
import { mergeMiraNormalizedFields } from "./types";

// Mira Pass 1 spec s.7 — conversation continuity. These are unit tests of
// the pure merge function itself; src/lib/mira/orchestrator.test.ts covers
// the same behavior wired into handleMiraInbound end to end.
describe("mergeMiraNormalizedFields", () => {
  it("returns the incoming fields unchanged when there is no previous state", () => {
    const merged = mergeMiraNormalizedFields(null, { from: "BISHKEK", to: "KARAKOL" });
    expect(merged).toEqual({ from: "BISHKEK", to: "KARAKOL" });
  });

  it("accumulates a new field onto previously collected fields", () => {
    const previous = { from: "BISHKEK", to: "KARAKOL", date: "TOMORROW" };
    const merged = mergeMiraNormalizedFields(previous, { passengerCount: 2 });
    expect(merged).toEqual({ from: "BISHKEK", to: "KARAKOL", date: "TOMORROW", passengerCount: 2 });
  });

  it("lets a new turn overwrite a previously collected value (correction)", () => {
    const previous = { from: "BISHKEK", to: "KARAKOL" };
    const merged = mergeMiraNormalizedFields(previous, { to: "OSH" });
    expect(merged.to).toBe("OSH");
    expect(merged.from).toBe("BISHKEK");
  });

  it("never lets a null/undefined incoming value erase a previously known field", () => {
    const previous = { from: "BISHKEK", to: "KARAKOL", date: "TOMORROW" };
    const merged = mergeMiraNormalizedFields(previous, { from: null, to: undefined, passengerCount: 2 });
    expect(merged).toEqual({ from: "BISHKEK", to: "KARAKOL", date: "TOMORROW", passengerCount: 2 });
  });

  it('supports a "жок, бүгүн" style date correction without touching other fields', () => {
    const previous = { from: "BISHKEK", to: "KARAKOL", date: "TOMORROW", passengerCount: 2 };
    const merged = mergeMiraNormalizedFields(previous, { date: "TODAY" });
    expect(merged).toEqual({ from: "BISHKEK", to: "KARAKOL", date: "TODAY", passengerCount: 2 });
  });

  it("treats an empty incoming object as a no-op", () => {
    const previous = { from: "BISHKEK", to: "KARAKOL" };
    expect(mergeMiraNormalizedFields(previous, {})).toEqual(previous);
  });

  // Mira Pass 3 (Multi-turn Continuity Certification) scenario H — a later
  // turn repeating a fact Mira already has must not duplicate, drift, or
  // otherwise disturb the previously collected value.
  it("is idempotent when a later turn repeats an already-known value", () => {
    const previous = { from: "BISHKEK", to: "KARAKOL", date: "TOMORROW", passengerCount: 2 };
    const merged = mergeMiraNormalizedFields(previous, { from: "BISHKEK" });
    expect(merged).toEqual(previous);
  });
});
