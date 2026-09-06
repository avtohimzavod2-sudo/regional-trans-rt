import { describe, expect, it } from "vitest";
import { detectLastMile } from "./last-mile";
import { KNOWN_HUBS } from "../gazetteer";
import type { ResolvedLocation } from "../types";

const karakol = KNOWN_HUBS.find((h) => h.key === "KARAKOL")!;

function locationAt(latitude: number | null, longitude: number | null): ResolvedLocation {
  return {
    role: "DESTINATION",
    latitude,
    longitude,
    formattedAddress: null,
    country: null,
    region: null,
    district: null,
    settlement: null,
    locality: null,
    street: null,
    house: null,
    landmark: null,
    provider: "mock",
    confidence: 0.9,
    ambiguity: false,
    sourceType: "COORDINATES",
  };
}

describe("detectLastMile", () => {
  it("does not detect Last Mile exactly at a known hub", () => {
    const r = detectLastMile(locationAt(karakol.latitude, karakol.longitude));
    expect(r.detected).toBe(false);
    expect(r.distanceKm).toBeNull();
  });

  it("detects Last Mile for a destination far beyond the nearest hub", () => {
    // ~0.1 deg latitude past Karakol is well beyond the default 5km threshold.
    const r = detectLastMile(locationAt(karakol.latitude + 0.1, karakol.longitude));
    expect(r.detected).toBe(true);
    expect(r.distanceKm).toBeGreaterThan(5);
    expect(r.nearestHubLabel).toBe("Каракол");
  });

  it("respects a custom threshold", () => {
    const destination = locationAt(karakol.latitude + 0.02, karakol.longitude); // ~2.2km
    expect(detectLastMile(destination, 1).detected).toBe(true);
    expect(detectLastMile(destination, 10).detected).toBe(false);
  });

  it("returns not-detected without coordinates, never guessing", () => {
    const r = detectLastMile(locationAt(null, null));
    expect(r.detected).toBe(false);
    expect(r.distanceKm).toBeNull();
    expect(r.nearestHubLabel).toBeNull();
  });
});
