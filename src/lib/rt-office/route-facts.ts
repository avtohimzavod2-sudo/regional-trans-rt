// RT OFFICE's own, additive use of Jolchu: resolving a passenger's free-text
// last-mile pickup point (an exact address within a corridor Stop) before a
// driver is ever pinged. This is deliberately narrow — Mira already calls
// Jolchu for corridor-level origin/destination normalization before the
// TripRequest exists (src/lib/mira/orchestrator.ts), and the Stop model
// itself has no lat/lng, so re-resolving the corridor route here would be a
// pointless duplicate call (AGENT_CONSTITUTION.md s.7: no second engine).
// RT OFFICE only ever calls resolveRouteIntelligence — the one Jolchu
// entrypoint — never a route provider directly.
import { resolveRouteIntelligence } from "@/lib/jolchu/orchestrator";
import type { RouteIntelligenceResult } from "@/lib/jolchu/types";
import type { AgentContext } from "@/lib/agents/types";
import type { NoSupplyReason } from "@prisma/client";

/** How long RT OFFICE waits on Jolchu for last-mile pickup resolution before
 * treating it as unavailable rather than blocking the whole demand/supply
 * resolution indefinitely. Lazy env read, safe default — mirrors
 * matching/config.ts's pattern. */
export function getRouteFactsTimeoutMs(): number {
  const raw = Number(process.env.RT_OFFICE_ROUTE_FACTS_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 8000;
}

export type PickupRouteFactsResult =
  | { ok: true; route: RouteIntelligenceResult | null }
  | { ok: false; reason: NoSupplyReason; detail: string };

class RouteFactsTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new RouteFactsTimeoutError(`Jolchu did not respond within ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Fail-closed: never fabricates a resolved pickup. A missing pickupPoint is
 * not an error (not every request has one) — returns ok:true with route:null
 * so the caller proceeds without last-mile detail. Any real failure mode
 * (timeout, provider down, ambiguous address) maps onto exactly one of the
 * three NoSupplyReason values, chosen by what actually happened — never
 * defaulted. */
export async function resolvePickupRouteFacts(params: {
  ctx: AgentContext;
  pickupPoint: string | null | undefined;
  originStopLabel: string;
  conversationId?: string;
}): Promise<PickupRouteFactsResult> {
  if (!params.pickupPoint) return { ok: true, route: null };

  try {
    const result = await withTimeout(
      resolveRouteIntelligence({
        reasonCode: "LAST_MILE",
        origin: params.pickupPoint,
        destination: params.originStopLabel,
        conversationId: params.conversationId,
        ctx: params.ctx,
      }),
      getRouteFactsTimeoutMs(),
    );

    if (result.status === "RESOLVED") return { ok: true, route: result };
    if (result.status === "NEEDS_CONFIRMATION" || result.status === "PARTIAL") {
      return { ok: false, reason: "NEEDS_CLARIFICATION", detail: `JOLCHU_${result.status}` };
    }
    // FAILED: Jolchu itself could not verify the geography (e.g. both route
    // providers unavailable) — a real outage, not an ambiguity.
    return { ok: false, reason: "TEMPORARILY_UNAVAILABLE", detail: result.errorMessage ?? "JOLCHU_FAILED" };
  } catch (err) {
    if (err instanceof RouteFactsTimeoutError) {
      return { ok: false, reason: "TEMPORARILY_UNAVAILABLE", detail: "JOLCHU_TIMEOUT" };
    }
    return { ok: false, reason: "TEMPORARILY_UNAVAILABLE", detail: `JOLCHU_ERROR: ${String(err)}` };
  }
}
