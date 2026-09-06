// Route calculation: combines a RouteProvider's real road route (never a
// straight-line guess) with Last Mile segmentation. straightLineDistanceKm
// is always computed locally via pure geometry from already-verified
// coordinates — that is not "the LLM inventing a distance", it is
// deterministic math over confirmed points — but it is NEVER substituted
// for roadDistanceKm, which is the only figure a future tariff agent may use.
import { haversineDistanceKm } from "../geo";
import { detectLastMile } from "./last-mile";
import type { RouteProvider } from "../route-providers/route-provider";
import type { JolchuRouteLeg, ResolvedLocation, RouteResult } from "../types";

export interface RouteCalcProviderExecutionLog {
  kind: "ROUTE";
  provider: string;
  purpose: "route";
  attemptOrder: number;
  ok: boolean;
  latencyMs: number;
  errorMessage: string | null;
}

export interface RouteCalcDeps {
  routeProvider: RouteProvider;
  fallbackRouteProvider?: RouteProvider | null;
}

export interface RouteCalcOutcome {
  route: RouteResult | null;
  providerExecutions: RouteCalcProviderExecutionLog[];
  unavailable: boolean;
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

function labelOf(location: ResolvedLocation): string {
  return location.formattedAddress ?? location.settlement ?? `${location.latitude},${location.longitude}`;
}

export async function calculateRouteIntelligence(
  origin: ResolvedLocation,
  destination: ResolvedLocation,
  waypoints: ResolvedLocation[],
  deps: RouteCalcDeps,
): Promise<RouteCalcOutcome> {
  const executions: RouteCalcProviderExecutionLog[] = [];

  if (origin.latitude === null || origin.longitude === null || destination.latitude === null || destination.longitude === null) {
    return { route: null, providerExecutions: executions, unavailable: false };
  }

  const originPoint = { latitude: origin.latitude, longitude: origin.longitude };
  const destinationPoint = { latitude: destination.latitude, longitude: destination.longitude };
  const waypointPoints = waypoints
    .filter((w) => w.latitude !== null && w.longitude !== null)
    .map((w) => ({ latitude: w.latitude as number, longitude: w.longitude as number }));

  const straightLineDistanceKm = haversineDistanceKm(originPoint, destinationPoint);

  const primary = await timed(() =>
    deps.routeProvider.calculateRoute({ origin: originPoint, destination: destinationPoint, waypoints: waypointPoints }),
  );
  executions.push({
    kind: "ROUTE",
    provider: deps.routeProvider.providerName,
    purpose: "route",
    attemptOrder: 1,
    ok: primary.error === null,
    latencyMs: primary.latencyMs,
    errorMessage: primary.error?.message ?? null,
  });

  let calc = primary.result;
  let provider = deps.routeProvider.providerName;

  if (!calc && deps.fallbackRouteProvider) {
    const fallback = await timed(() =>
      deps.fallbackRouteProvider!.calculateRoute({ origin: originPoint, destination: destinationPoint, waypoints: waypointPoints }),
    );
    executions.push({
      kind: "ROUTE",
      provider: deps.fallbackRouteProvider.providerName,
      purpose: "route",
      attemptOrder: 2,
      ok: fallback.error === null,
      latencyMs: fallback.latencyMs,
      errorMessage: fallback.error?.message ?? null,
    });
    calc = fallback.result;
    provider = deps.fallbackRouteProvider.providerName;
  }

  if (!calc) {
    // Both providers failed: never fabricate a route. The orchestrator turns
    // this into ROUTE_PROVIDER_UNAVAILABLE for the caller.
    return { route: null, providerExecutions: executions, unavailable: true };
  }

  const lastMile = detectLastMile(destination);
  const mainRouteDistanceKm = lastMile.detected
    ? Math.max(calc.roadDistanceKm - (lastMile.distanceKm ?? 0), 0)
    : calc.roadDistanceKm;

  const legs: JolchuRouteLeg[] = [
    {
      order: 1,
      kind: "MAIN",
      fromLabel: labelOf(origin),
      toLabel: lastMile.detected ? lastMile.nearestHubLabel : labelOf(destination),
      distanceKm: mainRouteDistanceKm,
      durationMin: calc.estimatedDurationMin,
    },
  ];
  if (lastMile.detected) {
    legs.push({
      order: 2,
      kind: "LAST_MILE",
      fromLabel: lastMile.nearestHubLabel,
      toLabel: labelOf(destination),
      distanceKm: lastMile.distanceKm,
      durationMin: null,
    });
  }

  const confidences = [origin.confidence, destination.confidence, ...waypoints.map((w) => w.confidence)];
  const confidence = confidences.length > 0 ? Math.min(...confidences) : null;

  const route: RouteResult = {
    provider,
    roadDistanceKm: calc.roadDistanceKm,
    straightLineDistanceKm,
    estimatedDurationMin: calc.estimatedDurationMin,
    trafficAwareDurationMin: calc.trafficAwareDurationMin,
    trafficStatus: calc.trafficStatus,
    trafficDelayMinutes:
      calc.trafficAwareDurationMin !== null ? calc.trafficAwareDurationMin - calc.estimatedDurationMin : null,
    tollFlag: calc.tollFlag,
    ferryFlag: calc.ferryFlag,
    unpavedRoadFlag: calc.unpavedRoadFlag,
    roadClosureFlag: calc.roadClosureFlag,
    mainRouteDistanceKm,
    lastMile,
    totalDistanceKm: calc.roadDistanceKm,
    confidence,
    warnings: calc.warnings,
    legs,
  };

  return { route, providerExecutions: executions, unavailable: false };
}
