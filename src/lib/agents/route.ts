// ROUTE AGENT — direct segments today; the interface is shaped so a future
// cross-corridor chain (e.g. Karakol -> Osh -> Bishkek -> Naryn) can plug in
// without changing callers. For now corridors don't overlap in the pilot
// deployment, so chain-building is scoped to a single corridor's stop order.
import { db } from "@/lib/db";
import type { AgentContract } from "./types";

export const ROUTE_AGENT_CONTRACT: AgentContract = {
  name: "ROUTE",
  mission: "Find direct and multi-stop routings along a corridor, including backhaul (return-leg) opportunities.",
  inputs: ["origin stop", "destination stop", "travel date"],
  outputs: ["ranked list of direct segments", "multi-stop chain (same corridor only, for now)"],
  permissions: ["read Stop/Corridor/DriverOffer"],
  prohibitedActions: ["never invent a stop that isn't in the Corridor's Stop list", "never cross corridors without an explicit transfer point (not implemented yet)"],
  kpi: ["% of requests served by a direct offer vs a chain", "empty backhaul leg rate"],
  escalationRules: ["if only a multi-stop chain can serve a request, flag for dispatcher review before proposing to a driver"],
};

export interface RouteStop {
  id: string;
  corridorId: string;
  key: string;
  order: number;
}

export interface RouteSegment {
  stops: RouteStop[]; // ordered, length >= 2
  isDirect: boolean; // true when it's exactly [origin, destination] with no intermediate hop
}

/**
 * Build the ordered chain of stops between origin and destination along the
 * same corridor. Returns null if they're on different corridors (an
 * inter-corridor transfer point isn't modelled yet) or travel the same stop.
 */
export function buildSameCorridorChain(origin: RouteStop, destination: RouteStop, allStops: RouteStop[]): RouteSegment | null {
  if (origin.corridorId !== destination.corridorId) return null;
  if (origin.id === destination.id) return null;

  const corridorStops = allStops
    .filter((s) => s.corridorId === origin.corridorId)
    .sort((a, b) => a.order - b.order);

  const lo = Math.min(origin.order, destination.order);
  const hi = Math.max(origin.order, destination.order);
  const between = corridorStops.filter((s) => s.order >= lo && s.order <= hi);
  const ordered = origin.order <= destination.order ? between : [...between].reverse();

  return { stops: ordered, isDirect: ordered.length === 2 };
}

/** True when a driver offer's segment fully contains the given chain (i.e. can carry the whole leg without a transfer). */
export function chainFitsWithinOffer(chain: RouteSegment, offerOrigin: RouteStop, offerDestination: RouteStop): boolean {
  const lo = Math.min(offerOrigin.order, offerDestination.order);
  const hi = Math.max(offerOrigin.order, offerDestination.order);
  return chain.stops.every((s) => s.order >= lo && s.order <= hi);
}

export async function findBackhaulCandidates(corridorId: string, forStopId: string) {
  return db.driverOffer.findMany({
    where: {
      status: { in: ["OPEN", "PARTIALLY_FILLED"] },
      isReturnLeg: true,
      originStopId: forStopId,
      origin: { corridorId },
    },
    include: { driver: true, origin: true, destination: true },
    orderBy: { createdAt: "asc" },
  });
}
