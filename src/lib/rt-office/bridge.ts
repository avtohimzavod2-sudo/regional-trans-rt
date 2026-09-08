// Minimal-disclosure outward-facing mapping (same pattern as
// src/lib/adilet/bridge.ts): each consumer gets only the shape it is
// entitled to, never the raw internal fact set.
//
// Passenger-facing (via Mira): driverId/offerId/vehicle plate+model and
// fact freshness/source are deliberately dropped. Driver contact and
// vehicle identity are only ever revealed post-confirmation by RT Core's
// existing revealContacts() gate (matching/orchestrate.ts, behind TRUST's
// assertSafeToReveal) — RT OFFICE must never leak identifying driver detail
// into a pre-match conversational reply.
import type { DemandSupplyResolution, OperationalState, DepartureWindow } from "./types";

export interface PassengerFacingSupplyFacts {
  hasSupply: boolean;
  bestCandidate: {
    seatsAvailable: number;
    departureWindow: DepartureWindow;
    operationalState: OperationalState;
    etaMinutes: number | null;
  } | null;
  /** Count only — no identifying detail about the other candidates. */
  alternativeCount: number;
}

export function passengerFacingSupplyFacts(resolution: DemandSupplyResolution): PassengerFacingSupplyFacts {
  const [best, ...rest] = resolution.candidates;
  if (!best) return { hasSupply: false, bestCandidate: null, alternativeCount: 0 };

  return {
    hasSupply: true,
    bestCandidate: {
      seatsAvailable: best.seatsAvailable,
      departureWindow: best.departureWindow,
      operationalState: best.operationalState,
      etaMinutes: best.etaMinutes,
    },
    alternativeCount: rest.length,
  };
}

/** Internal/dispatcher/Artur view: full detail, including offerId/driverId,
 * vehicle identity, and fact freshness/source. Never expose this shape to a
 * passenger-facing reply. */
export function internalSupplyView(resolution: DemandSupplyResolution): DemandSupplyResolution {
  return resolution;
}
