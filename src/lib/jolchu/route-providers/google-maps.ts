// GoogleMapsRouteProvider — production adapter over the Google Maps
// Geocoding + Routes APIs. Preferred primary route provider. Never throws at
// construction; only geocode()/calculateRoute() touch the network, and only
// once actually called — this file is exercised in this repo's test suite
// only for its credential-guard behavior (no live key is present in CI).
import type { GeocodeCandidate, RouteProvider, RouteProviderCalcInput, RouteProviderCalcResult } from "./route-provider";

function requireApiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error(
      "GOOGLE_MAPS_API_KEY is not set — GoogleMapsRouteProvider cannot make live calls. " +
        "Set JOLCHU_ROUTE_PROVIDER=mock for a credential-free provider.",
    );
  }
  return key;
}

interface GoogleGeocodeResponseResult {
  formatted_address: string;
  geometry: { location: { lat: number; lng: number } };
  address_components: { long_name: string; types: string[] }[];
}

function componentOf(result: GoogleGeocodeResponseResult, type: string): string | null {
  return result.address_components.find((c) => c.types.includes(type))?.long_name ?? null;
}

export class GoogleMapsRouteProvider implements RouteProvider {
  readonly providerName = "google_maps";

  async geocode(query: string): Promise<GeocodeCandidate[]> {
    const apiKey = requireApiKey();
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Google Geocoding API HTTP ${res.status}`);
    const data = (await res.json()) as { status: string; results: GoogleGeocodeResponseResult[] };
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      throw new Error(`Google Geocoding API status ${data.status}`);
    }

    return data.results.map((result) => ({
      formattedAddress: result.formatted_address,
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
      country: componentOf(result, "country"),
      region: componentOf(result, "administrative_area_level_1"),
      district: componentOf(result, "administrative_area_level_2"),
      settlement: componentOf(result, "locality"),
      locality: componentOf(result, "sublocality"),
      street: componentOf(result, "route"),
      house: componentOf(result, "street_number"),
      confidence: data.results.length === 1 ? 0.95 : 0.7,
    }));
  }

  async calculateRoute(input: RouteProviderCalcInput): Promise<RouteProviderCalcResult> {
    const apiKey = requireApiKey();
    const origin = `${input.origin.latitude},${input.origin.longitude}`;
    const destination = `${input.destination.latitude},${input.destination.longitude}`;
    const waypointsParam =
      input.waypoints && input.waypoints.length > 0
        ? `&waypoints=${input.waypoints.map((w) => `${w.latitude},${w.longitude}`).join("|")}`
        : "";
    const url =
      `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}` +
      `${waypointsParam}&departure_time=now&key=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Google Directions API HTTP ${res.status}`);
    const data = await res.json();
    if (data.status !== "OK" || !data.routes?.[0]) {
      throw new Error(`Google Directions API status ${data.status ?? "UNKNOWN"}`);
    }

    const route = data.routes[0];
    const legs: { distance: { value: number }; duration: { value: number }; duration_in_traffic?: { value: number } }[] =
      route.legs;
    const roadDistanceKm = legs.reduce((sum, leg) => sum + leg.distance.value, 0) / 1000;
    const estimatedDurationMin = legs.reduce((sum, leg) => sum + leg.duration.value, 0) / 60;
    const hasTrafficData = legs.every((leg) => leg.duration_in_traffic);
    const trafficAwareDurationMin = hasTrafficData
      ? legs.reduce((sum, leg) => sum + (leg.duration_in_traffic?.value ?? 0), 0) / 60
      : null;

    const warnings: string[] = route.warnings ?? [];
    const summary: string = (route.summary ?? "").toLowerCase();

    let trafficStatus: RouteProviderCalcResult["trafficStatus"] = "UNKNOWN";
    if (trafficAwareDurationMin !== null) {
      const ratio = trafficAwareDurationMin / estimatedDurationMin;
      if (ratio <= 1.05) trafficStatus = "FREE";
      else if (ratio <= 1.2) trafficStatus = "LIGHT";
      else if (ratio <= 1.5) trafficStatus = "MODERATE";
      else if (ratio <= 2) trafficStatus = "HEAVY";
      else trafficStatus = "SEVERE";
    }

    return {
      roadDistanceKm,
      estimatedDurationMin,
      trafficAwareDurationMin,
      trafficStatus,
      tollFlag: Boolean(route.fare) || summary.includes("toll"),
      ferryFlag: legs.some((leg) => JSON.stringify(leg).toLowerCase().includes("ferry")),
      unpavedRoadFlag: false,
      roadClosureFlag: false,
      warnings,
    };
  }
}
