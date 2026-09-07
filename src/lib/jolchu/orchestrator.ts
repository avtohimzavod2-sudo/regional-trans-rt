// Жолчу (Jolchu) — Route Intelligence Agent orchestrator. This is the single
// entrypoint (resolveRouteIntelligence) that Mira — or any future RT AI
// Workforce agent (Passenger, Driver, Parcel, Scout) — calls once it has
// already decided JOLCHU_REQUIRED via routing-decision.ts. Jolchu never
// blends its reasoning with the caller's: it only ever returns the
// normalized RouteIntelligenceResult contract defined in types.ts, and it
// never computes a fare — that is a future, separate tariff agent's job.
import { nanoid } from "nanoid";
import { rootContext, logAgentAction } from "@/lib/agents/trace";
import type { AgentContext } from "@/lib/agents/types";
import type { AgentContract } from "@/lib/agents/types";
import { resolveLocation, type ProviderExecutionLog, type LocationResolutionDeps } from "./location/resolver";
import { calculateRouteIntelligence } from "./route/calculate";
import { getJolchuModelProvider, getJolchuFallbackModelProvider } from "./providers/model-provider";
import { getJolchuRouteProvider, getJolchuFallbackRouteProvider } from "./route-providers/factory";
import { persistJolchuRequest } from "./audit";
import type {
  JolchuLocationInput,
  JolchuReasonCode,
  JolchuRequestStatusValue,
  LocationAmbiguityCandidate,
  ResolvedLocation,
  RouteIntelligenceResult,
} from "./types";
import { ROUTE_PROVIDER_UNAVAILABLE } from "./types";

export const JOLCHU_AGENT_CONTRACT: AgentContract = {
  name: "JOLCHU",
  mission:
    "Turn a human description of a place into verified, structured route data (location, road distance, ETA, " +
    "traffic, Last Mile) for other RT AI Workforce agents — never inventing geography and never computing a fare.",
  inputs: [
    "raw location text/coordinates/live-location payload/Google Maps or 2GIS link for origin, destination, and waypoints",
    "explicit reason code from the calling agent (LOCATION_RESOLUTION, ROUTE_CALCULATION, TRAFFIC_CHECK, LAST_MILE, AMBIGUITY_CHECK)",
  ],
  outputs: [
    "RouteIntelligenceResult: resolved locations, road distance, straight-line distance, ETA, traffic-aware ETA, " +
      "traffic status, Last Mile segment, confidence, ambiguity, warnings — never a price",
  ],
  permissions: ["call a configured RouteProvider (Google Maps / 2GIS / Mock)", "call a configured JolchuModelProvider for language understanding only"],
  prohibitedActions: [
    "never invent coordinates, distance, duration, or traffic — those come only from a RouteProvider",
    "never compute or return a fare/price/commission",
    "never silently pick a location when ambiguous — must return NEEDS_CONFIRMATION instead",
    "never call Google/2GIS directly from Mira or any other agent — only Jolchu talks to RouteProvider",
  ],
  kpi: [
    "location resolution accuracy",
    "correct ambiguity detection rate (no false-confident guesses)",
    "provider fallback success rate",
    "zero fabricated routes on provider failure",
  ],
  escalationRules: [
    "both route providers unavailable -> return ROUTE_PROVIDER_UNAVAILABLE, never a fabricated result",
    "confidence below the configured threshold -> return NEEDS_CONFIRMATION with candidate list",
  ],
};

export interface RouteIntelligenceRequest {
  reasonCode: JolchuReasonCode;
  origin?: JolchuLocationInput;
  destination?: JolchuLocationInput;
  waypoints?: JolchuLocationInput[];
  conversationId?: string;
  ctx?: AgentContext;
  /** Defaults to true; set false in tests to skip all database writes. */
  persist?: boolean;
  /**
   * Test/benchmark-only override for the provider set. Lets a benchmark case
   * inject a deliberately-failing RouteProvider (e.g. to exercise the
   * Google-down -> 2GIS-fallback or both-down paths) without mutating
   * process.env mid-test. Omit in production code — real callers always get
   * the env-based factories below.
   */
  deps?: Partial<LocationResolutionDeps>;
}

function rawInputSummary(req: RouteIntelligenceRequest): string {
  const describe = (v: JolchuLocationInput | undefined) =>
    v === undefined ? null : typeof v === "string" ? v : `${v.latitude},${v.longitude}`;
  return JSON.stringify({
    origin: describe(req.origin),
    destination: describe(req.destination),
    waypoints: (req.waypoints ?? []).map(describe),
  });
}

function pickAmbiguityCandidates(locations: ResolvedLocation[], stored: (LocationAmbiguityCandidate[] | null)[]): LocationAmbiguityCandidate[] | null {
  for (let i = 0; i < locations.length; i++) {
    if (locations[i].ambiguity && stored[i]) return stored[i];
  }
  return null;
}

export async function resolveRouteIntelligence(req: RouteIntelligenceRequest): Promise<RouteIntelligenceResult> {
  const start = Date.now();
  const ctx = req.ctx ?? rootContext();
  const requestId = `jolchu_${nanoid(12)}`;

  await logAgentAction({
    ctx,
    agent: "JOLCHU",
    action: "jolchu.request_started",
    entityType: "JolchuRequest",
    entityId: requestId,
    details: { reasonCode: req.reasonCode, conversationId: req.conversationId ?? null },
  });

  const modelProvider = req.deps?.modelProvider ?? getJolchuModelProvider();
  const fallbackModelProvider = req.deps?.fallbackModelProvider ?? getJolchuFallbackModelProvider();
  const routeProvider = req.deps?.routeProvider ?? getJolchuRouteProvider();
  const fallbackRouteProvider =
    req.deps && "fallbackRouteProvider" in req.deps ? req.deps.fallbackRouteProvider ?? null : getJolchuFallbackRouteProvider();

  const deps: LocationResolutionDeps = { modelProvider, fallbackModelProvider, routeProvider, fallbackRouteProvider };
  const providerExecutions: ProviderExecutionLog[] = [];
  const warnings: string[] = [];

  const locations: ResolvedLocation[] = [];
  const ambiguityCandidatesByLocation: (LocationAmbiguityCandidate[] | null)[] = [];
  let anyRouteProviderUnavailable = false;

  const singleRole = req.origin && !req.destination ? "SINGLE" : "ORIGIN";

  if (req.origin) {
    const outcome = await resolveLocation(req.origin, singleRole, deps);
    locations.push(outcome.location);
    ambiguityCandidatesByLocation.push(outcome.ambiguityCandidates);
    providerExecutions.push(...outcome.providerExecutions);
    warnings.push(...outcome.warnings);
    anyRouteProviderUnavailable ||= outcome.routeProviderUnavailable;
  }
  const origin = locations[0] ?? null;

  if (req.destination) {
    const outcome = await resolveLocation(req.destination, "DESTINATION", deps);
    locations.push(outcome.location);
    ambiguityCandidatesByLocation.push(outcome.ambiguityCandidates);
    providerExecutions.push(...outcome.providerExecutions);
    warnings.push(...outcome.warnings);
    anyRouteProviderUnavailable ||= outcome.routeProviderUnavailable;
  }
  const destinationIndex = req.origin && req.destination ? 1 : req.destination ? 0 : -1;
  const destination = destinationIndex >= 0 ? locations[destinationIndex] : null;

  const waypoints: ResolvedLocation[] = [];
  for (const wp of req.waypoints ?? []) {
    const outcome = await resolveLocation(wp, "WAYPOINT", deps);
    locations.push(outcome.location);
    ambiguityCandidatesByLocation.push(outcome.ambiguityCandidates);
    providerExecutions.push(...outcome.providerExecutions);
    warnings.push(...outcome.warnings);
    anyRouteProviderUnavailable ||= outcome.routeProviderUnavailable;
    waypoints.push(outcome.location);
  }

  const anyAmbiguous = locations.some((l) => l.ambiguity);
  const allResolved = locations.length > 0 && locations.every((l) => l.latitude !== null);
  const someResolved = locations.some((l) => l.latitude !== null);

  let status: JolchuRequestStatusValue;
  let errorMessage: string | null = null;

  if (anyRouteProviderUnavailable) {
    status = "FAILED";
    errorMessage = ROUTE_PROVIDER_UNAVAILABLE;
  } else if (anyAmbiguous) {
    status = "NEEDS_CONFIRMATION";
  } else if (!allResolved) {
    status = someResolved ? "PARTIAL" : "FAILED";
    if (!someResolved) errorMessage = "no_location_could_be_resolved";
  } else {
    status = "RESOLVED";
  }

  let route = null as RouteIntelligenceResult["route"];
  if (status === "RESOLVED" && origin && destination) {
    const routeOutcome = await calculateRouteIntelligence(origin, destination, waypoints, {
      routeProvider,
      fallbackRouteProvider,
    });
    providerExecutions.push(...routeOutcome.providerExecutions);
    if (routeOutcome.unavailable) {
      status = "FAILED";
      errorMessage = ROUTE_PROVIDER_UNAVAILABLE;
    } else {
      route = routeOutcome.route;
    }
  }

  const confidenceValues = locations.map((l) => l.confidence);
  const confidence = confidenceValues.length > 0 ? Math.min(...confidenceValues) : 0;

  const result: RouteIntelligenceResult = {
    requestId,
    status,
    origin,
    destination,
    waypoints,
    route,
    confidence,
    ambiguity: anyAmbiguous,
    ambiguityCandidates: pickAmbiguityCandidates(locations, ambiguityCandidatesByLocation),
    warnings: Array.from(new Set(warnings)),
    requiresHumanOrUserConfirmation: status === "NEEDS_CONFIRMATION",
    errorMessage,
    createdAt: new Date().toISOString(),
  };

  const latencyMs = Date.now() - start;

  await logAgentAction({
    ctx,
    agent: "JOLCHU",
    action: `jolchu.${req.reasonCode.toLowerCase()}`,
    entityType: "JolchuRequest",
    entityId: requestId,
    details: { status, confidence, ambiguity: result.ambiguity, latencyMs },
  });

  if (req.persist !== false) {
    await persistJolchuRequest({
      reasonCode: req.reasonCode,
      conversationId: req.conversationId ?? null,
      traceId: ctx.traceId,
      latencyMs,
      providerExecutions,
      result,
      rawInputSanitized: rawInputSummary(req),
    });
  }

  return result;
}
