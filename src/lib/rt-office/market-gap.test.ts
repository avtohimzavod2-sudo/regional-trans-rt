import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMocks } = vi.hoisted(() => ({
  dbMocks: {
    tripRequest: { aggregate: vi.fn() },
    driverOffer: { aggregate: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ db: dbMocks }));

import { computeMarketGap } from "./market-gap";

function mockSeats(demandSeats: number | null, supplySeats: number | null) {
  dbMocks.tripRequest.aggregate.mockResolvedValue({ _sum: { seats: demandSeats } });
  dbMocks.driverOffer.aggregate.mockResolvedValue({ _sum: { seatsAvailable: supplySeats } });
}

describe("computeMarketGap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never hardcodes the spec's illustrative example — output tracks whatever the live aggregates report", async () => {
    mockSeats(23, 9);

    const result = await computeMarketGap();

    expect(result.demandSeats).toBe(23);
    expect(result.supplySeats).toBe(9);
    expect(result.gapSeats).toBe(-14);
    expect(result.priority).toBe("HIGH_DRIVER_ACQUISITION_NEED");
  });

  it("treats a materially short supply as HIGH_DRIVER_ACQUISITION_NEED", async () => {
    mockSeats(20, 5);

    const result = await computeMarketGap();

    expect(result.gapSeats).toBe(-15);
    expect(result.priority).toBe("HIGH_DRIVER_ACQUISITION_NEED");
  });

  it("treats supply materially exceeding demand as PASSENGER_ACQUISITION_NEED", async () => {
    mockSeats(5, 20);

    const result = await computeMarketGap();

    expect(result.gapSeats).toBe(15);
    expect(result.priority).toBe("PASSENGER_ACQUISITION_NEED");
  });

  it("treats a small gap within the noise threshold as BALANCED", async () => {
    mockSeats(10, 11);

    const result = await computeMarketGap();

    expect(result.gapSeats).toBe(1);
    expect(result.priority).toBe("BALANCED");
  });

  it("treats zero demand and zero supply as BALANCED, never a division error", async () => {
    mockSeats(0, 0);

    const result = await computeMarketGap();

    expect(result.demandSeats).toBe(0);
    expect(result.supplySeats).toBe(0);
    expect(result.gapSeats).toBe(0);
    expect(result.priority).toBe("BALANCED");
  });

  it("treats a null aggregate sum (no matching rows) as zero, never null propagation", async () => {
    mockSeats(null, null);

    const result = await computeMarketGap();

    expect(result.demandSeats).toBe(0);
    expect(result.supplySeats).toBe(0);
  });

  it("scopes both aggregates to the requested corridor", async () => {
    mockSeats(10, 10);

    await computeMarketGap({ corridorId: "corridor-1" });

    expect(dbMocks.tripRequest.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ origin: { is: { corridorId: "corridor-1" } } }),
      }),
    );
    expect(dbMocks.driverOffer.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ origin: { is: { corridorId: "corridor-1" } } }),
      }),
    );
  });

  it("only counts unresolved demand (PENDING/MATCHING) and live supply (OPEN/PARTIALLY_FILLED)", async () => {
    mockSeats(10, 10);

    await computeMarketGap();

    expect(dbMocks.tripRequest.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ["PENDING", "MATCHING"] } }),
      }),
    );
    expect(dbMocks.driverOffer.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ["OPEN", "PARTIALLY_FILLED"] } }),
      }),
    );
  });

  it("reports the requested window size and corridor back on the result", async () => {
    mockSeats(1, 1);

    const result = await computeMarketGap({ corridorId: "corridor-9", windowDays: 7 });

    expect(result.windowDays).toBe(7);
    expect(result.corridorId).toBe("corridor-9");
  });

  it("defaults corridorId to null and windowDays to 14 when unscoped", async () => {
    mockSeats(1, 1);

    const result = await computeMarketGap();

    expect(result.windowDays).toBe(14);
    expect(result.corridorId).toBeNull();
  });
});
