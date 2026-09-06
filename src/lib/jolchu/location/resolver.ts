// Location Resolution layer: turns one raw human-described place into a
// verified ResolvedLocation. The LLM (JolchuModelProvider) only ever cleans
// up the search text; every coordinate/address fact comes from a
// RouteProvider's geocode() — see route-providers/route-provider.ts. Never
// silently picks a point when ambiguous: multiple/low-confidence candidates
// come back with lat/lon left null and `ambiguityCandidates` populated so
// the caller can ask a clarifying question instead of guessing.
import { parseLocationInput } from "../parse-input";
import { getConfirmationConfidenceThreshold } from "../config";
import type { JolchuModelProvider } from "../providers/model-provider";
import type { GeocodeCandidate, RouteProvider } from "../route-providers/route-provider";
import type {
  JolchuInputTypeValue,
  JolchuLocationInput,
  JolchuLocationRole,
  LocationAmbiguityCandidate,
  ResolvedLocation,
} from "../types";

export interface ProviderExecutionLog {
  kind: "MODEL" | "ROUTE";
  provider: string;
  purpose: string;
  attemptOrder: number;
  ok: boolean;
  latencyMs: number;
  errorMessage: string | null;
}

export interface LocationResolutionDeps {
  modelProvider: JolchuModelProvider;
  fallbackModelProvider?: JolchuModelProvider;
  routeProvider: RouteProvider;
  fallbackRouteProvider?: RouteProvider | null;
}

export interface LocationResolutionOutcome {
  location: ResolvedLocation;
  ambiguityCandidates: LocationAmbiguityCandidate[] | null;
  providerExecutions: ProviderExecutionLog[];
  warnings: string[];
  /** True only when every configured route provider failed outright (not
   * merely "found nothing") — the orchestrator surfaces this distinctly. */
  routeProviderUnavailable: boolean;
}

function emptyLocation(role: JolchuLocationRole, sourceType: JolchuInputTypeValue, provider: string): ResolvedLocation {
  return {
    role,
    latitude: null,
    longitude: null,
    formattedAddress: null,
    country: null,
    region: null,
    district: null,
    settlement: null,
    locality: null,
    street: null,
    house: null,
    landmark: null,
    provider,
    confidence: 0,
    ambiguity: false,
    sourceType,
  };
}

function candidateToResolvedLocation(
  candidate: GeocodeCandidate,
  role: JolchuLocationRole,
  sourceType: JolchuInputTypeValue,
  provider: string,
  isLandmark: boolean,
): ResolvedLocation {
  return {
    role,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    formattedAddress: candidate.formattedAddress,
    country: candidate.country,
    region: candidate.region,
    district: candidate.district,
    settlement: candidate.settlement,
    locality: candidate.locality,
    street: candidate.street,
    house: candidate.house,
    landmark: isLandmark ? candidate.formattedAddress : null,
    provider,
    confidence: candidate.confidence,
    ambiguity: false,
    sourceType,
  };
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T | null; latencyMs: number; error: Error | null }> {
  const start = Date.now();
  try {
    const result = await fn();
    return { result, latencyMs: Date.now() - start, error: null };
  } catch (err) {
    return { result: null, latencyMs: Date.now() - start, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

async function geocodeWithFallback(
  query: string,
  deps: LocationResolutionDeps,
  executions: ProviderExecutionLog[],
): Promise<{ candidates: GeocodeCandidate[]; provider: string; unavailable: boolean }> {
  const primary = await timed(() => deps.routeProvider.geocode(query));
  executions.push({
    kind: "ROUTE",
    provider: deps.routeProvider.providerName,
    purpose: "geocode",
    attemptOrder: 1,
    ok: primary.error === null,
    latencyMs: primary.latencyMs,
    errorMessage: primary.error?.message ?? null,
  });
  if (primary.error === null) return { candidates: primary.result ?? [], provider: deps.routeProvider.providerName, unavailable: false };

  if (!deps.fallbackRouteProvider) return { candidates: [], provider: deps.routeProvider.providerName, unavailable: true };

  const fallback = await timed(() => deps.fallbackRouteProvider!.geocode(query));
  executions.push({
    kind: "ROUTE",
    provider: deps.fallbackRouteProvider.providerName,
    purpose: "geocode",
    attemptOrder: 2,
    ok: fallback.error === null,
    latencyMs: fallback.latencyMs,
    errorMessage: fallback.error?.message ?? null,
  });
  if (fallback.error === null) return { candidates: fallback.result ?? [], provider: deps.fallbackRouteProvider.providerName, unavailable: false };

  return { candidates: [], provider: deps.fallbackRouteProvider.providerName, unavailable: true };
}

export async function resolveLocation(
  raw: JolchuLocationInput,
  role: JolchuLocationRole,
  deps: LocationResolutionDeps,
): Promise<LocationResolutionOutcome> {
  const executions: ProviderExecutionLog[] = [];
  const warnings: string[] = [];
  const parsed = parseLocationInput(raw);

  if (parsed.inputType === "LIVE_LOCATION") {
    if (parsed.invalidCoordinates || parsed.latitude === null || parsed.longitude === null) {
      warnings.push("invalid_live_location_payload");
      return {
        location: emptyLocation(role, "LIVE_LOCATION", "device-gps"),
        ambiguityCandidates: null,
        providerExecutions: executions,
        warnings,
        routeProviderUnavailable: false,
      };
    }
    return {
      location: {
        ...emptyLocation(role, "LIVE_LOCATION", "device-gps"),
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        confidence: 0.99,
      },
      ambiguityCandidates: null,
      providerExecutions: executions,
      warnings,
      routeProviderUnavailable: false,
    };
  }

  if (parsed.inputType === "COORDINATES") {
    if (parsed.invalidCoordinates || parsed.latitude === null || parsed.longitude === null) {
      warnings.push("invalid_coordinates");
      return {
        location: emptyLocation(role, "COORDINATES", "parsed"),
        ambiguityCandidates: null,
        providerExecutions: executions,
        warnings,
        routeProviderUnavailable: false,
      };
    }
    return {
      location: {
        ...emptyLocation(role, "COORDINATES", "parsed"),
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        confidence: 0.95,
      },
      ambiguityCandidates: null,
      providerExecutions: executions,
      warnings,
      routeProviderUnavailable: false,
    };
  }

  if (parsed.inputType === "GOOGLE_MAPS_LINK" || parsed.inputType === "TWO_GIS_LINK") {
    if (parsed.latitude !== null && parsed.longitude !== null) {
      return {
        location: {
          ...emptyLocation(role, parsed.inputType, "parsed"),
          latitude: parsed.latitude,
          longitude: parsed.longitude,
          confidence: 0.9,
        },
        ambiguityCandidates: null,
        providerExecutions: executions,
        warnings,
        routeProviderUnavailable: false,
      };
    }
    // Short/shortened links with no embedded coordinates require following a
    // redirect to resolve — out of scope for a text-only pipeline. Rather
    // than guess, flag for confirmation.
    warnings.push("map_link_requires_resolution");
    return {
      location: { ...emptyLocation(role, parsed.inputType, "unresolved-link"), confidence: 0.2, ambiguity: true },
      ambiguityCandidates: null,
      providerExecutions: executions,
      warnings,
      routeProviderUnavailable: false,
    };
  }

  // TEXT_ADDRESS | LANDMARK | SETTLEMENT_ONLY | UNKNOWN
  const text = parsed.text ?? "";
  if (!text.trim()) {
    return {
      location: emptyLocation(role, "UNKNOWN", "none"),
      ambiguityCandidates: null,
      providerExecutions: executions,
      warnings: [...warnings, "empty_input"],
      routeProviderUnavailable: false,
    };
  }

  const modelAttempt = await timed(() => deps.modelProvider.understand({ text, role }));
  executions.push({
    kind: "MODEL",
    provider: deps.modelProvider.providerName,
    purpose: "understand",
    attemptOrder: 1,
    ok: modelAttempt.error === null,
    latencyMs: modelAttempt.latencyMs,
    errorMessage: modelAttempt.error?.message ?? null,
  });

  let understanding = modelAttempt.result;
  if (!understanding && deps.fallbackModelProvider) {
    const fallbackAttempt = await timed(() => deps.fallbackModelProvider!.understand({ text, role }));
    executions.push({
      kind: "MODEL",
      provider: deps.fallbackModelProvider.providerName,
      purpose: "understand",
      attemptOrder: 2,
      ok: fallbackAttempt.error === null,
      latencyMs: fallbackAttempt.latencyMs,
      errorMessage: fallbackAttempt.error?.message ?? null,
    });
    understanding = fallbackAttempt.result;
  }

  const geocodeQuery = understanding?.geocodeQuery || text;
  const { candidates, provider, unavailable } = await geocodeWithFallback(geocodeQuery, deps, executions);

  if (unavailable) {
    warnings.push("route_provider_unavailable");
    return {
      location: emptyLocation(role, parsed.inputType, provider),
      ambiguityCandidates: null,
      providerExecutions: executions,
      warnings,
      routeProviderUnavailable: true,
    };
  }

  if (candidates.length === 0) {
    warnings.push("no_geocode_candidates");
    return {
      location: emptyLocation(role, "UNKNOWN", provider),
      ambiguityCandidates: null,
      providerExecutions: executions,
      warnings,
      routeProviderUnavailable: false,
    };
  }

  const threshold = getConfirmationConfidenceThreshold();
  const isAmbiguous = candidates.length > 1 || Boolean(understanding?.possiblyAmbiguous) || candidates[0].confidence < threshold;

  if (isAmbiguous) {
    return {
      location: { ...emptyLocation(role, parsed.inputType, provider), confidence: candidates[0].confidence, ambiguity: true },
      ambiguityCandidates: candidates.map((c) => ({
        label: c.formattedAddress,
        latitude: c.latitude,
        longitude: c.longitude,
        confidence: c.confidence,
      })),
      providerExecutions: executions,
      warnings,
      routeProviderUnavailable: false,
    };
  }

  return {
    location: candidateToResolvedLocation(candidates[0], role, parsed.inputType, provider, Boolean(understanding?.isLandmarkPhrasing)),
    ambiguityCandidates: null,
    providerExecutions: executions,
    warnings,
    routeProviderUnavailable: false,
  };
}
