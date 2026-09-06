// Last Mile detection: separates the MAIN_INTERCITY_ROUTE from a LAST_MILE
// leg beyond the nearest known hub (e.g. Bishkek -> Karakol -> 18km past
// Karakol). The threshold is configurable (config.ts), never hardcoded
// commercial logic — this module only ever reports distances, never a price.
import { haversineDistanceKm, type LatLon } from "../geo";
import { KNOWN_HUBS, type KnownHub } from "../gazetteer";
import { getLastMileThresholdKm } from "../config";
import type { LastMileSegment, ResolvedLocation } from "../types";

function nearestHub(location: LatLon, hubs: KnownHub[]): { hub: KnownHub; distanceKm: number } | null {
  let best: { hub: KnownHub; distanceKm: number } | null = null;
  for (const hub of hubs) {
    const distanceKm = haversineDistanceKm(location, { latitude: hub.latitude, longitude: hub.longitude });
    if (!best || distanceKm < best.distanceKm) best = { hub, distanceKm };
  }
  return best;
}

export function detectLastMile(
  destination: ResolvedLocation,
  thresholdKm: number = getLastMileThresholdKm(),
  hubs: KnownHub[] = KNOWN_HUBS,
): LastMileSegment {
  if (destination.latitude === null || destination.longitude === null) {
    return { detected: false, distanceKm: null, nearestHubLabel: null };
  }
  const nearest = nearestHub({ latitude: destination.latitude, longitude: destination.longitude }, hubs);
  if (!nearest || nearest.distanceKm <= thresholdKm) {
    return { detected: false, distanceKm: null, nearestHubLabel: nearest?.hub.nameRu ?? null };
  }
  return { detected: true, distanceKm: nearest.distanceKm, nearestHubLabel: nearest.hub.nameRu };
}
