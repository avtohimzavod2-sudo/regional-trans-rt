import { describe, expect, it } from "vitest";
import { MockRouteProvider } from "./mock";
import { KNOWN_HUBS } from "../gazetteer";

const provider = new MockRouteProvider();

describe("MockRouteProvider.geocode", () => {
  it("resolves a known hub with high confidence and a single candidate", async () => {
    const candidates = await provider.geocode("Каракол");
    expect(candidates).toHaveLength(1);
    expect(candidates[0].confidence).toBeGreaterThan(0.6);
    expect(candidates[0].latitude).toBeCloseTo(42.4907, 3);
  });

  it("resolves an unambiguous known landmark as a single candidate", async () => {
    const candidates = await provider.geocode("ЦУМ");
    expect(candidates).toHaveLength(1);
  });

  it("returns multiple sub-threshold candidates for a known ambiguous landmark, never picking one", async () => {
    const candidates = await provider.geocode("Аламедин");
    expect(candidates.length).toBeGreaterThan(1);
    for (const c of candidates) {
      expect(c.confidence).toBeLessThan(0.6);
    }
  });

  it("returns no candidates for unrecognized text rather than guessing", async () => {
    const candidates = await provider.geocode("совершенно неизвестное место xyzabc");
    expect(candidates).toHaveLength(0);
  });
});

describe("MockRouteProvider.calculateRoute", () => {
  const bishkek = KNOWN_HUBS.find((h) => h.key === "BISHKEK")!;
  const karakol = KNOWN_HUBS.find((h) => h.key === "KARAKOL")!;

  it("returns a road distance larger than the straight-line distance", async () => {
    const result = await provider.calculateRoute({
      origin: { latitude: bishkek.latitude, longitude: bishkek.longitude },
      destination: { latitude: karakol.latitude, longitude: karakol.longitude },
    });
    expect(result.roadDistanceKm).toBeGreaterThan(0);
    expect(result.estimatedDurationMin).toBeGreaterThan(0);
  });

  it("never fabricates live traffic — always reports UNKNOWN with a null traffic-aware duration", async () => {
    const result = await provider.calculateRoute({
      origin: { latitude: bishkek.latitude, longitude: bishkek.longitude },
      destination: { latitude: karakol.latitude, longitude: karakol.longitude },
    });
    expect(result.trafficStatus).toBe("UNKNOWN");
    expect(result.trafficAwareDurationMin).toBeNull();
  });
});
