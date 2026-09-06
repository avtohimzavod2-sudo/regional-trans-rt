// TwoGisRouteProvider — fallback/alternative adapter over the 2GIS
// Geocoder + Routing APIs. Used when Google Maps is unavailable or when
// JOLCHU_ROUTE_PROVIDER=two_gis. Same lazy-credential discipline as
// GoogleMapsRouteProvider: never throws at construction.
import type { GeocodeCandidate, RouteProvider, RouteProviderCalcInput, RouteProviderCalcResult } from "./route-provider";

function requireApiKey(): string {
  const key = process.env.TWO_GIS_API_KEY;
  if (!key) {
    throw new Error(
      "TWO_GIS_API_KEY is not set — TwoGisRouteProvider cannot make live calls. " +
        "Set JOLCHU_ROUTE_PROVIDER=mock (or JOLCHU_ROUTE_FALLBACK_PROVIDER=mock) for a credential-free provider.",
    );
  }
  return key;
}

interface TwoGisGeocodeItem {
  full_name: string;
  point: { lat: number; lon: number };
  adm_div?: { name: string; type: string }[];
}

function admDivOf(item: TwoGisGeocodeItem, type: string): string | null {
  return item.adm_div?.find((d) => d.type === type)?.name ?? null;
}

export class TwoGisRouteProvider implements RouteProvider {
  readonly providerName = "two_gis";

  async geocode(query: string): Promise<GeocodeCandidate[]> {
    const apiKey = requireApiKey();
    const url = `https://catalog.api.2gis.com/3.0/items/geocode?q=${encodeURIComponent(query)}&fields=items.point,items.adm_div&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`2GIS Geocoder API HTTP ${res.status}`);
    const data = (await res.json()) as { result?: { items?: TwoGisGeocodeItem[] } };
    const items = data.result?.items ?? [];

    return items.map((item) => ({
      formattedAddress: item.full_name,
      latitude: item.point.lat,
      longitude: item.point.lon,
      country: admDivOf(item, "country"),
      region: admDivOf(item, "region"),
      district: admDivOf(item, "district"),
      settlement: admDivOf(item, "city"),
      locality: null,
      street: null,
      house: null,
      confidence: items.length === 1 ? 0.9 : 0.65,
    }));
  }

  async calculateRoute(input: RouteProviderCalcInput): Promise<RouteProviderCalcResult> {
    const apiKey = requireApiKey();
    const points = [input.origin, ...(input.waypoints ?? []), input.destination].map((p) => ({
      type: "walking" as const,
      lat: p.latitude,
      lon: p.longitude,
    }));

    const res = await fetch(`https://routing.api.2gis.com/routing/7.0.0/global?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points, transport: "driving" }),
    });
    if (!res.ok) throw new Error(`2GIS Routing API HTTP ${res.status}`);
    const data = await res.json();
    const route = Array.isArray(data) ? data[0] : data.result?.[0];
    if (!route) throw new Error("2GIS Routing API returned no route");

    return {
      roadDistanceKm: route.total_distance / 1000,
      estimatedDurationMin: route.total_duration / 60,
      // 2GIS's global routing endpoint does not return a separate
      // traffic-aware duration in this response shape — never fabricate one.
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
