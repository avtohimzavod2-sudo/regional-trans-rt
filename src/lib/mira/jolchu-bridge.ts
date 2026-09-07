// The Mira-side half of the Mira <-> Jolchu bridge. decideJolchuRouting()
// (src/lib/jolchu/routing-decision.ts) decides WHETHER Jolchu is required,
// standalone and dependency-free. This module decides WHAT to hand
// resolveRouteIntelligence() once it is — pure and DB-free so it stays
// unit-testable without touching the live pipeline.
import type { JolchuLocationInput } from "@/lib/jolchu/types";
import type { MiraNormalizedFields } from "./types";

export interface JolchuCallInputs {
  origin: JolchuLocationInput;
  destination?: JolchuLocationInput;
}

/** Prefers Mira's own already-extracted from/to fields (real structured
 * addresses/landmarks, when a live model provider populated them) over the
 * raw message, since a raw whole-message string only ever resolves as a
 * single SINGLE-role location and can never produce a route. Falls back to
 * the raw text when Mira has no structured fields yet (e.g. the
 * fast-layer/no-provider path, or the mock provider's city-only extraction),
 * so LOCATION_RESOLUTION / AMBIGUITY_CHECK / TRAFFIC_CHECK / LAST_MILE can
 * still resolve a single place. */
export function pickJolchuLocationInputs(text: string, entities: MiraNormalizedFields): JolchuCallInputs {
  const from = entities.from?.trim() || null;
  const to = entities.to?.trim() || null;
  if (from) {
    return to ? { origin: from, destination: to } : { origin: from };
  }
  return { origin: text };
}
