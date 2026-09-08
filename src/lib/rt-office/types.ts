// RT OFFICE — pure, DB-free types. RT OFFICE never owns a Prisma model of
// its own (see prisma/schema.prisma's RT OFFICE / CRM AUTO block comment):
// it is a read-mostly, thin-write layer over RT Core's existing
// Driver/DriverOffer/Match/Trip tables, converting verified operational
// facts into a structured shape Mira (and only Mira) turns into a
// human-facing reply. Every field here must be traceable to a live read of
// an existing table — RT OFFICE must never invent seats, availability,
// trip status, or breakdown status (spec s.4).

/** Normalized operational state (spec s.8's 10-state vocabulary), derived
 * on demand from existing Prisma enums + CRM Auto signals — never stored as
 * a second status system. See operational-state.ts. */
export type OperationalState =
  | "AVAILABLE"
  | "PLANNED"
  | "WAITING_DEPARTURE"
  | "EN_ROUTE"
  | "DELAYED"
  | "ARRIVED"
  | "COMPLETED"
  | "CANCELLED"
  | "BREAKDOWN"
  | "OFFLINE";

export interface VerifiedVehicleFacts {
  driverId: string;
  carModel: string | null;
  carPlate: string | null;
}

export interface DepartureWindow {
  travelDate: string; // "YYYY-MM-DD"
  start: string | null; // "HH:mm"
  end: string | null;
}

export interface FactFreshness {
  source: string; // DriveCrmEvent.source — e.g. "JOLCHU", "DRIVER_REPORT", "RT_OFFICE", "SYSTEM"
  asOf: string; // ISO timestamp of the DriveCrmEvent this fact was read from
}

/** One candidate vehicle/trip Mira may mention to a passenger. Every field
 * is read live from Driver/DriverOffer/Trip/DriveCrmEvent at query time —
 * there is no cached or invented value here, so `confidence` is always
 * VERIFIED by construction (an unverifiable fact is simply omitted, not
 * guessed at). */
export interface SupplyFact {
  offerId: string;
  driverId: string;
  seatsAvailable: number;
  departureWindow: DepartureWindow;
  vehicle: VerifiedVehicleFacts;
  operationalState: OperationalState;
  /** Only ever populated from a verified DriveCrmEvent(OPERATIONAL_ETA) —
   * null means "no verified ETA available", never a guess. */
  etaMinutes: number | null;
  freshness: FactFreshness | null;
  confidence: "VERIFIED";
}

/** The typed Demand <-> Supply interaction result: what RT OFFICE hands
 * Mira when she compares an unresolved passenger request against RT
 * OFFICE's supply awareness (spec's core "CLIENTS NEED VEHICLES. VEHICLES
 * NEED CLIENTS." loop). */
export interface DemandSupplyResolution {
  tripRequestId: string;
  hasCandidateSupply: boolean;
  candidates: SupplyFact[];
}

export interface SupplyAvailableSignal {
  offerId: string;
  reportedBy: "DRIVER_REPORT" | "SYSTEM" | "RT_OFFICE";
}

export interface SupplyAvailableOutcome {
  offerId: string;
  /** True when RT OFFICE re-triggered RT Core's existing MATCH agent
   * (src/lib/agents/match.ts) for this offer — RT OFFICE never runs its own
   * matching logic (spec s.5: reuse the current matching stack). */
  rematchTriggered: boolean;
  matchId: string | null;
}
