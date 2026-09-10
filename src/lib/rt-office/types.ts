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

export interface StopNameSummary {
  id: string;
  nameRu: string;
  nameKy: string;
  nameEn: string;
}

/** ETA freshness as shown to a dispatcher: the same verified fact as
 * FactFreshness, plus whether it has crossed the configurable staleness
 * threshold (crm-auto/config.ts's getEtaStalenessMinutes). `stale` is never
 * used to discard or replace the ETA value — only to flag it. */
export interface EtaFreshnessView extends FactFreshness {
  stale: boolean;
}

/**
 * One driver's current operational context, computed live from
 * Driver/DriverOffer/Trip/DriveCrmEvent — never a new persisted table (spec
 * s.2). Every field is either a live fact or an explicit null/zero; nothing
 * here is guessed. `seatsOccupied` is always seatsTotal - seatsAvailable,
 * never a second stored counter (spec s.10).
 *
 * When a driver has no current non-terminal trip and no open offer,
 * `activeOfferId`/`activeTripId`/route/seat fields fall back to the
 * driver's most recent terminal trip (COMPLETED/CANCELLED/NO_SHOW) if one
 * exists — the only way ARRIVED/COMPLETED/CANCELLED are ever observable —
 * or to all-null/zero if the driver has never had any offer or trip at all.
 * See fleet-picture.ts's pickCurrentContext for the exact deterministic
 * selection rule.
 */
export interface DriverOperationalSnapshot {
  driverId: string;
  driverName: string;
  driverVerificationStatus: "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "BLOCKED";
  vehicle: { carModel: string | null; carPlate: string | null };
  operationalState: OperationalState;
  activeOfferId: string | null;
  activeTripId: string | null;
  origin: StopNameSummary | null;
  destination: StopNameSummary | null;
  travelDate: string | null; // "YYYY-MM-DD"
  departureWindow: DepartureWindow | null;
  seatsTotal: number;
  seatsAvailable: number;
  /** Always seatsTotal - seatsAvailable, clamped at 0 — never a second
   * mutable counter (spec s.10). */
  seatsOccupied: number;
  etaMinutes: number | null;
  etaFreshness: EtaFreshnessView | null;
  breakdownOpen: boolean;
  isReturnLeg: boolean;
  generatedFromTripId: string | null;
  /** ISO timestamp shared by every snapshot in the same buildLiveFleetPicture
   * call, so a dispatcher can tell all cards were computed from one
   * consistent read. */
  snapshotAsOf: string;
}

/** RT OFFICE's aggregated, nationwide read entrypoint (spec s.3). Built
 * entirely from bulk/batched reads (spec s.4) — never one query per driver. */
export interface LiveFleetPicture {
  totalDrivers: number;
  /** Every driver contributes to exactly one key here — never double
   * counted (spec s.3). */
  counts: Record<OperationalState, number>;
  /** Sum of seatsAvailable/seatsOccupied across snapshots whose
   * operationalState represents real, currently usable supply
   * (AVAILABLE/PLANNED/WAITING_DEPARTURE/EN_ROUTE/DELAYED) — BREAKDOWN,
   * CANCELLED, OFFLINE, ARRIVED, and COMPLETED never contribute (spec s.10). */
  seatsAvailableTotal: number;
  seatsOccupiedTotal: number;
  /** Plain network-wide count of DriverOffer rows with status OPEN or
   * PARTIALLY_FILLED — independent of which driver currently has that offer
   * selected as their "current context" snapshot. */
  activeDriverOfferCount: number;
  /** Plain network-wide count of open/partially-filled DriverOffer rows with
   * isReturnLeg = true (spec s.11) — a return DriverOffer, not CRM Auto's
   * separate BACKHAUL_OPPORTUNITY signal (spec s.11 explicitly distinguishes
   * the two; this counter never conflates them). */
  returnLegOfferCount: number;
  /** Count of snapshots with a non-null etaMinutes. */
  confirmedEtaCount: number;
  generatedAt: string;
  drivers: DriverOperationalSnapshot[];
}
