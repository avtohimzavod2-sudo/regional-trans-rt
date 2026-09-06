// Жолчу (Jolchu) — Route Intelligence Agent. Dependency-free domain types,
// mirrored on src/lib/mira/types.ts's convention: this file has no imports
// so every other Jolchu module (and Mira, and any future agent) can depend
// on it without pulling in providers, Prisma, or business logic.
//
// Naming note: this module intentionally does NOT reuse `RouteSegment` from
// src/lib/agents/route.ts — that type belongs to the unrelated corridor/stop
// marketplace-routing agent (AgentName.ROUTE). Jolchu's own segment concept
// is `JolchuRouteLeg` to avoid any ambiguity between the two domains.
//
// Entities are named generically (Origin/Destination/Waypoint, not
// "pickup"/"passenger") because Jolchu must serve more than passenger trips:
// driver backhaul, parcel/courier routing, RT Point logistics, transfers.

export type JolchuInputTypeValue =
  | "LIVE_LOCATION"
  | "COORDINATES"
  | "GOOGLE_MAPS_LINK"
  | "TWO_GIS_LINK"
  | "TEXT_ADDRESS"
  | "LANDMARK"
  | "SETTLEMENT_ONLY"
  | "UNKNOWN";

export type JolchuRequestStatusValue = "RESOLVED" | "NEEDS_CONFIRMATION" | "PARTIAL" | "FAILED";

export type TrafficStatusValue = "UNKNOWN" | "FREE" | "LIGHT" | "MODERATE" | "HEAVY" | "SEVERE";

/** Why Mira decided to invoke Jolchu at all. Ordinary chat/FAQ/greetings never
 * produce a reason code, so `required: false` and Jolchu is never called. */
export type JolchuReasonCode =
  | "LOCATION_RESOLUTION"
  | "ROUTE_CALCULATION"
  | "TRAFFIC_CHECK"
  | "LAST_MILE"
  | "AMBIGUITY_CHECK";

export interface JolchuRoutingDecision {
  required: boolean;
  reasonCode: JolchuReasonCode | null;
  /** The literal text/pattern that triggered the decision, for audit/debugging. */
  matchedSignal: string | null;
}

export type JolchuLocationRole = "ORIGIN" | "DESTINATION" | "WAYPOINT" | "SINGLE";

/** A single raw location input, as Jolchu receives it — before resolution. */
export type JolchuLocationInput =
  | string
  | { latitude: number; longitude: number; isLivePayload?: boolean };

/** The structured, verified result of resolving one human-described place.
 * Every geographic fact here comes from a RouteProvider (or direct
 * coordinate/payload parsing) — never invented by the LLM. */
export interface ResolvedLocation {
  role: JolchuLocationRole;
  latitude: number | null;
  longitude: number | null;
  formattedAddress: string | null;
  country: string | null;
  region: string | null;
  district: string | null;
  settlement: string | null;
  locality: string | null;
  street: string | null;
  house: string | null;
  landmark: string | null;
  provider: string;
  confidence: number;
  ambiguity: boolean;
  sourceType: JolchuInputTypeValue;
}

export interface LocationAmbiguityCandidate {
  label: string;
  latitude: number;
  longitude: number;
  confidence: number;
}

export type JolchuRouteLegKind = "MAIN" | "LAST_MILE" | "WAYPOINT_LEG";

export interface JolchuRouteLeg {
  order: number;
  kind: JolchuRouteLegKind;
  fromLabel: string | null;
  toLabel: string | null;
  distanceKm: number | null;
  durationMin: number | null;
}

export interface LastMileSegment {
  detected: boolean;
  distanceKm: number | null;
  nearestHubLabel: string | null;
}

/** Route facts only — deliberately has no price/fare/commission field.
 * "RouteQuote" would only be acceptable as a name if it's unambiguous that
 * it excludes price; we avoid the word entirely here. */
export interface RouteResult {
  provider: string;
  roadDistanceKm: number | null;
  straightLineDistanceKm: number;
  estimatedDurationMin: number | null;
  trafficAwareDurationMin: number | null;
  trafficStatus: TrafficStatusValue;
  trafficDelayMinutes: number | null;
  tollFlag: boolean;
  ferryFlag: boolean;
  unpavedRoadFlag: boolean;
  roadClosureFlag: boolean;
  mainRouteDistanceKm: number | null;
  lastMile: LastMileSegment;
  totalDistanceKm: number | null;
  confidence: number | null;
  warnings: string[];
  legs: JolchuRouteLeg[];
}

/** The normalized, language-neutral contract Mira receives back. Nothing
 * downstream of this (a future tariff agent) should ever need to re-derive
 * geography — this is the single source of truth for one Jolchu request. */
export interface RouteIntelligenceResult {
  requestId: string;
  status: JolchuRequestStatusValue;
  origin: ResolvedLocation | null;
  destination: ResolvedLocation | null;
  waypoints: ResolvedLocation[];
  route: RouteResult | null;
  confidence: number;
  ambiguity: boolean;
  ambiguityCandidates: LocationAmbiguityCandidate[] | null;
  warnings: string[];
  requiresHumanOrUserConfirmation: boolean;
  errorMessage: string | null;
  createdAt: string;
}

export const ROUTE_PROVIDER_UNAVAILABLE = "ROUTE_PROVIDER_UNAVAILABLE" as const;
