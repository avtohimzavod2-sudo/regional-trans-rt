import { beforeEach, describe, expect, it, vi } from "vitest";

const { computeMarketGapMock } = vi.hoisted(() => ({ computeMarketGapMock: vi.fn() }));

vi.mock("@/lib/rt-office/market-gap", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rt-office/market-gap")>("@/lib/rt-office/market-gap");
  return { ...actual, computeMarketGap: computeMarketGapMock };
});

import { driverDemandProposition } from "./propositions";

describe("driverDemandProposition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when the live Market Gap is BALANCED", async () => {
    computeMarketGapMock.mockResolvedValue({ demandSeats: 5, supplySeats: 5, gapSeats: 0, priority: "BALANCED", windowDays: 14, corridorId: null, asOf: new Date().toISOString() });

    expect(await driverDemandProposition("RU")).toBeNull();
  });

  it("returns null when the gap favors drivers (PASSENGER_ACQUISITION_NEED) rather than a driver shortage", async () => {
    computeMarketGapMock.mockResolvedValue({ demandSeats: 5, supplySeats: 20, gapSeats: 15, priority: "PASSENGER_ACQUISITION_NEED", windowDays: 14, corridorId: null, asOf: new Date().toISOString() });

    expect(await driverDemandProposition("RU")).toBeNull();
  });

  it("returns a language-matched sentence when there is a genuine driver shortage", async () => {
    computeMarketGapMock.mockResolvedValue({ demandSeats: 23, supplySeats: 9, gapSeats: -14, priority: "HIGH_DRIVER_ACQUISITION_NEED", windowDays: 14, corridorId: null, asOf: new Date().toISOString() });

    const result = await driverDemandProposition("KY");

    expect(result).not.toBeNull();
    expect(result?.priority).toBe("HIGH_DRIVER_ACQUISITION_NEED");
    expect(result?.gapSeats).toBe(-14);
    expect(result?.text.length).toBeGreaterThan(0);
  });

  it("never invents its own gap number — always the live computeMarketGap() result", async () => {
    computeMarketGapMock.mockResolvedValue({ demandSeats: 100, supplySeats: 10, gapSeats: -90, priority: "HIGH_DRIVER_ACQUISITION_NEED", windowDays: 14, corridorId: null, asOf: new Date().toISOString() });

    const result = await driverDemandProposition("EN");

    expect(computeMarketGapMock).toHaveBeenCalledTimes(1);
    expect(result?.gapSeats).toBe(-90);
  });
});
