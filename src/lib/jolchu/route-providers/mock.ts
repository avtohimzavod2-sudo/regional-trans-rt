// MockRouteProvider — fully deterministic, no network calls, no API keys.
// It is a real gazetteer lookup + real geometry (haversine), not a random
// number generator, so tests exercising it are reproducible. It deliberately
// reports trafficStatus: UNKNOWN and trafficAwareDurationMin: null — mock
// mode must never fabricate a "live" traffic value.
import { haversineDistanceKm } from "../geo";
import { KNOWN_HUBS, KNOWN_LANDMARKS } from "../gazetteer";
import { getMockAverageSpeedKmh, getMockRoadDistanceFactor } from "../config";
import type { GeocodeCandidate, RouteProvider, RouteProviderCalcInput, RouteProviderCalcResult } from "./route-provider";

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

export class MockRouteProvider implements RouteProvider {
  readonly providerName = "mock";

  async geocode(query: string): Promise<GeocodeCandidate[]> {
    const normalized = normalize(query);

    const ambiguousLandmarks = KNOWN_LANDMARKS.filter(
      (l) => l.ambiguous && l.aliases.some((a) => normalized.includes(a)),
    );
    if (ambiguousLandmarks.length > 0) {
      // Deterministically synthesize 2-3 plausible readings of an ambiguous
      // name (market / district / village), each with sub-threshold
      // confidence, so the resolver's ambiguity path is exercised for real.
      const base = ambiguousLandmarks[0];
      const readings = ["рынок", "район", "село"];
      return readings.map((kind, i) => ({
        formattedAddress: `${base.nameRu} (${kind})`,
        latitude: base.latitude + i * 0.01,
        longitude: base.longitude + i * 0.01,
        country: "Кыргызстан",
        region: null,
        district: null,
        settlement: null,
        locality: null,
        street: null,
        house: null,
        confidence: 0.4,
      }));
    }

    const landmark = KNOWN_LANDMARKS.find((l) => l.aliases.some((a) => normalized.includes(a)));
    if (landmark) {
      return [
        {
          formattedAddress: landmark.nameRu,
          latitude: landmark.latitude,
          longitude: landmark.longitude,
          country: "Кыргызстан",
          region: null,
          district: null,
          settlement: null,
          locality: null,
          street: null,
          house: null,
          confidence: 0.85,
        },
      ];
    }

    const hub = KNOWN_HUBS.find((h) => h.aliases.some((a) => normalized.includes(a)));
    if (hub) {
      return [
        {
          formattedAddress: hub.nameRu,
          latitude: hub.latitude,
          longitude: hub.longitude,
          country: "Кыргызстан",
          region: null,
          district: null,
          settlement: hub.nameRu,
          locality: null,
          street: null,
          house: null,
          confidence: 0.92,
        },
      ];
    }

    return [];
  }

  async calculateRoute(input: RouteProviderCalcInput): Promise<RouteProviderCalcResult> {
    const straightLineKm = haversineDistanceKm(input.origin, input.destination);
    const roadDistanceKm = straightLineKm * getMockRoadDistanceFactor();
    const estimatedDurationMin = (roadDistanceKm / getMockAverageSpeedKmh()) * 60;

    return {
      roadDistanceKm,
      estimatedDurationMin,
      trafficAwareDurationMin: null,
      trafficStatus: "UNKNOWN",
      tollFlag: false,
      ferryFlag: false,
      unpavedRoadFlag: false,
      roadClosureFlag: false,
      warnings: [],
    };
  }
}
