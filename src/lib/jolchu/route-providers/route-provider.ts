// RouteProvider — the ONLY source of truth for actual geography in Jolchu.
// "Maps are not an LLM": no model ever fills in these fields, they only ever
// come from geocode()/calculateRoute() below. Core business logic (resolver,
// route/calculate.ts, orchestrator) must depend only on this interface,
// never on a concrete Google/2GIS SDK or fetch call directly.
import type { TrafficStatusValue } from "../types";

export interface GeocodeCandidate {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  country: string | null;
  region: string | null;
  district: string | null;
  settlement: string | null;
  locality: string | null;
  street: string | null;
  house: string | null;
  confidence: number;
}

export interface RouteProviderCalcInput {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  waypoints?: { latitude: number; longitude: number }[];
}

export interface RouteProviderCalcResult {
  roadDistanceKm: number;
  estimatedDurationMin: number;
  /** null when the provider has no traffic-aware routing available at all
   * (never a fabricated "current traffic" figure). */
  trafficAwareDurationMin: number | null;
  trafficStatus: TrafficStatusValue;
  tollFlag: boolean;
  ferryFlag: boolean;
  unpavedRoadFlag: boolean;
  roadClosureFlag: boolean;
  warnings: string[];
}

export interface RouteProvider {
  readonly providerName: string;
  geocode(query: string): Promise<GeocodeCandidate[]>;
  calculateRoute(input: RouteProviderCalcInput): Promise<RouteProviderCalcResult>;
}

export type RouteProviderKind = "google_maps" | "two_gis" | "mock";

export interface RouteProviderStatus {
  configuredProvider: RouteProviderKind;
  fallbackProvider: RouteProviderKind | null;
  ready: boolean;
  reason: string | null;
}

function toKind(raw: string | undefined, fallback: RouteProviderKind): RouteProviderKind {
  const lower = (raw ?? "").toLowerCase();
  if (lower === "google_maps" || lower === "google") return "google_maps";
  if (lower === "two_gis" || lower === "2gis") return "two_gis";
  if (lower === "mock") return "mock";
  return fallback;
}

export function configuredRouteProviderKind(): RouteProviderKind {
  return toKind(process.env.JOLCHU_ROUTE_PROVIDER, "mock");
}

export function configuredFallbackRouteProviderKind(): RouteProviderKind | null {
  const raw = process.env.JOLCHU_ROUTE_FALLBACK_PROVIDER;
  if (!raw) return configuredRouteProviderKind() === "mock" ? null : "mock";
  return toKind(raw, "mock");
}

/** Never throws, never calls the network — safe for Jolchu Center's
 * Providers tab. */
export function getRouteProviderStatus(): RouteProviderStatus {
  const kind = configuredRouteProviderKind();
  const fallback = configuredFallbackRouteProviderKind();

  if (kind === "mock") {
    return { configuredProvider: "mock", fallbackProvider: fallback, ready: true, reason: null };
  }
  if (kind === "google_maps") {
    const hasKey = Boolean(process.env.GOOGLE_MAPS_API_KEY);
    return {
      configuredProvider: kind,
      fallbackProvider: fallback,
      ready: hasKey,
      reason: hasKey ? null : "GOOGLE_MAPS_API_KEY is not set",
    };
  }
  const hasKey = Boolean(process.env.TWO_GIS_API_KEY);
  return {
    configuredProvider: kind,
    fallbackProvider: fallback,
    ready: hasKey,
    reason: hasKey ? null : "TWO_GIS_API_KEY is not set",
  };
}
