import { describe, expect, it } from "vitest";
import { executorCanHandle } from "./executors";
import type { ShipmentCargoRequirements } from "./types";

const NO_REQUIREMENTS: ShipmentCargoRequirements = {
  weightKg: null,
  pieces: null,
  fragile: false,
  perishable: false,
  temperatureControlled: false,
};

function profile(overrides: Partial<Parameters<typeof executorCanHandle>[0]> = {}) {
  return {
    maxWeightKg: null,
    maxPieces: null,
    acceptsFragile: true,
    acceptsPerishable: false,
    acceptsTemperatureControlled: false,
    ...overrides,
  };
}

describe("executorCanHandle", () => {
  it("allows anything when the executor declares no limits and the shipment has no special requirements", () => {
    expect(executorCanHandle(profile(), NO_REQUIREMENTS)).toBe(true);
  });

  it("never excludes on an undeclared (null) limit", () => {
    expect(executorCanHandle(profile({ maxWeightKg: null, maxPieces: null }), { ...NO_REQUIREMENTS, weightKg: 500, pieces: 20 })).toBe(true);
  });

  it("excludes an executor whose declared weight/piece limit is below the shipment's", () => {
    expect(executorCanHandle(profile({ maxWeightKg: 10 }), { ...NO_REQUIREMENTS, weightKg: 25 })).toBe(false);
    expect(executorCanHandle(profile({ maxPieces: 2 }), { ...NO_REQUIREMENTS, pieces: 5 })).toBe(false);
  });

  it("allows a shipment within a declared limit", () => {
    expect(executorCanHandle(profile({ maxWeightKg: 50 }), { ...NO_REQUIREMENTS, weightKg: 25 })).toBe(true);
  });

  it("excludes an executor that doesn't accept fragile/perishable/temperature-controlled cargo when required", () => {
    expect(executorCanHandle(profile({ acceptsFragile: false }), { ...NO_REQUIREMENTS, fragile: true })).toBe(false);
    expect(executorCanHandle(profile({ acceptsPerishable: false }), { ...NO_REQUIREMENTS, perishable: true })).toBe(false);
    expect(executorCanHandle(profile({ acceptsTemperatureControlled: false }), { ...NO_REQUIREMENTS, temperatureControlled: true })).toBe(false);
  });

  it("allows an executor that explicitly declares support for the required handling", () => {
    expect(executorCanHandle(profile({ acceptsPerishable: true }), { ...NO_REQUIREMENTS, perishable: true })).toBe(true);
  });
});
