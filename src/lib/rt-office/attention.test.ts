import { beforeEach, describe, expect, it, vi } from "vitest";

const { crmAutoConfigMocks } = vi.hoisted(() => ({
  crmAutoConfigMocks: { getEtaStalenessMinutes: vi.fn() },
}));
vi.mock("@/lib/crm-auto/config", () => crmAutoConfigMocks);

import { deriveFleetAttentionFeed } from "./attention";
import type { DriverOperationalSnapshot, LiveFleetPicture, OperationalState } from "./types";

const NOW = new Date("2026-09-10T12:00:00.000Z");

function snapshot(overrides: Partial<DriverOperationalSnapshot> = {}): DriverOperationalSnapshot {
  return {
    driverId: "driver-1",
    driverName: "Азамат",
    driverVerificationStatus: "ACTIVE",
    vehicle: { carModel: "Sprinter", carPlate: "01KG777AAA" },
    operationalState: "AVAILABLE",
    activeOfferId: null,
    activeTripId: null,
    origin: null,
    destination: null,
    travelDate: null,
    departureWindow: null,
    seatsTotal: 0,
    seatsAvailable: 0,
    seatsOccupied: 0,
    etaMinutes: null,
    etaFreshness: null,
    breakdownOpen: false,
    isReturnLeg: false,
    generatedFromTripId: null,
    snapshotAsOf: NOW.toISOString(),
    ...overrides,
  };
}

function fleet(drivers: DriverOperationalSnapshot[]): LiveFleetPicture {
  const counts = {} as Record<OperationalState, number>;
  const states: OperationalState[] = [
    "AVAILABLE",
    "PLANNED",
    "WAITING_DEPARTURE",
    "EN_ROUTE",
    "DELAYED",
    "ARRIVED",
    "COMPLETED",
    "CANCELLED",
    "BREAKDOWN",
    "OFFLINE",
  ];
  for (const s of states) counts[s] = 0;
  for (const d of drivers) counts[d.operationalState] += 1;

  return {
    totalDrivers: drivers.length,
    counts,
    seatsAvailableTotal: 0,
    seatsOccupiedTotal: 0,
    activeDriverOfferCount: 0,
    returnLegOfferCount: 0,
    confirmedEtaCount: 0,
    generatedAt: NOW.toISOString(),
    drivers,
  };
}

describe("deriveFleetAttentionFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    crmAutoConfigMocks.getEtaStalenessMinutes.mockReturnValue(30);
  });

  it("does not call the database — pure derivation from an already-fetched LiveFleetPicture", () => {
    const feed = deriveFleetAttentionFeed(fleet([snapshot()]), NOW);
    expect(feed.items).toEqual([]);
  });

  it("creates a CRITICAL BREAKDOWN_OPEN item for a driver in BREAKDOWN state", () => {
    const feed = deriveFleetAttentionFeed(fleet([snapshot({ operationalState: "BREAKDOWN", breakdownOpen: true })]), NOW);

    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].type).toBe("BREAKDOWN_OPEN");
    expect(feed.items[0].severity).toBe("CRITICAL");
  });

  it("creates a HIGH VERIFIED_DELAY item for a driver in DELAYED state", () => {
    const feed = deriveFleetAttentionFeed(
      fleet([snapshot({ operationalState: "DELAYED", etaMinutes: 20, etaFreshness: { source: "JOLCHU", asOf: NOW.toISOString(), stale: false } })]),
      NOW,
    );

    const delay = feed.items.find((i) => i.type === "VERIFIED_DELAY");
    expect(delay?.severity).toBe("HIGH");
  });

  it("creates a WARNING ETA_STALE item when the ETA is older than the staleness threshold, without claiming lateness", () => {
    const feed = deriveFleetAttentionFeed(
      fleet([
        snapshot({
          operationalState: "EN_ROUTE",
          etaMinutes: 25,
          etaFreshness: { source: "JOLCHU", asOf: new Date(NOW.getTime() - 45 * 60_000).toISOString(), stale: true },
        }),
      ]),
      NOW,
    );

    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].type).toBe("ETA_STALE");
    expect(feed.items[0].severity).toBe("WARNING");
    expect(feed.items[0].message.toLowerCase()).not.toContain("late");
    expect(feed.items[0].message).not.toMatch(/опозда/i);
  });

  it("never creates ETA_STALE for a fresh ETA", () => {
    const feed = deriveFleetAttentionFeed(
      fleet([
        snapshot({
          operationalState: "EN_ROUTE",
          etaMinutes: 10,
          etaFreshness: { source: "JOLCHU", asOf: NOW.toISOString(), stale: false },
        }),
      ]),
      NOW,
    );

    expect(feed.items).toEqual([]);
  });

  it("creates ETA_MISSING with WARNING severity for an underway (EN_ROUTE) driver with no confirmed ETA", () => {
    const feed = deriveFleetAttentionFeed(fleet([snapshot({ operationalState: "EN_ROUTE", etaMinutes: null })]), NOW);

    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].type).toBe("ETA_MISSING");
    expect(feed.items[0].severity).toBe("WARNING");
    expect(feed.items[0].message).not.toMatch(/lost|пропал/i);
  });

  it("creates ETA_MISSING with INFO severity for a not-yet-departed (WAITING_DEPARTURE) driver with no confirmed ETA", () => {
    const feed = deriveFleetAttentionFeed(fleet([snapshot({ operationalState: "WAITING_DEPARTURE", etaMinutes: null })]), NOW);

    expect(feed.items[0].severity).toBe("INFO");
  });

  it("never treats a missing ETA as a delay", () => {
    const feed = deriveFleetAttentionFeed(fleet([snapshot({ operationalState: "EN_ROUTE", etaMinutes: null })]), NOW);

    expect(feed.items.some((i) => i.type === "VERIFIED_DELAY")).toBe(false);
  });

  it("creates no alert for a normal AVAILABLE driver", () => {
    const feed = deriveFleetAttentionFeed(fleet([snapshot({ operationalState: "AVAILABLE" })]), NOW);
    expect(feed.items).toEqual([]);
  });

  it("creates no ETA alert for terminal states (ARRIVED/COMPLETED/CANCELLED/OFFLINE) even with a null ETA", () => {
    const states: OperationalState[] = ["ARRIVED", "COMPLETED", "CANCELLED", "OFFLINE"];
    const feed = deriveFleetAttentionFeed(fleet(states.map((s) => snapshot({ driverId: s, operationalState: s, etaMinutes: null }))), NOW);
    expect(feed.items).toEqual([]);
  });

  it("allows a driver to carry multiple distinct alerts (DELAYED + ETA_STALE) without duplicating identical alerts", () => {
    const feed = deriveFleetAttentionFeed(
      fleet([
        snapshot({
          operationalState: "DELAYED",
          etaMinutes: 25,
          etaFreshness: { source: "JOLCHU", asOf: new Date(NOW.getTime() - 45 * 60_000).toISOString(), stale: true },
        }),
      ]),
      NOW,
    );

    expect(feed.items).toHaveLength(2);
    const types = feed.items.map((i) => i.type).sort();
    expect(types).toEqual(["ETA_STALE", "VERIFIED_DELAY"]);
  });

  it("sorts items by severity CRITICAL > HIGH > WARNING > INFO with a stable order within the same severity", () => {
    const drivers = [
      snapshot({ driverId: "d-info", operationalState: "WAITING_DEPARTURE", etaMinutes: null }),
      snapshot({ driverId: "d-critical", operationalState: "BREAKDOWN" }),
      snapshot({ driverId: "d-warning", operationalState: "EN_ROUTE", etaMinutes: null }),
      snapshot({ driverId: "d-high", operationalState: "DELAYED", etaMinutes: 5, etaFreshness: { source: "JOLCHU", asOf: NOW.toISOString(), stale: false } }),
      snapshot({ driverId: "d-warning-2", operationalState: "EN_ROUTE", etaMinutes: null }),
    ];

    const feed = deriveFleetAttentionFeed(fleet(drivers), NOW);

    expect(feed.items.map((i) => i.driverId)).toEqual(["d-critical", "d-high", "d-warning", "d-warning-2", "d-info"]);
    expect(feed.counts).toEqual({ CRITICAL: 1, HIGH: 1, WARNING: 2, INFO: 1 });
  });
});
