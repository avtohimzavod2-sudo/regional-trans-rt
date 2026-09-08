// RT_OFFICE_AGENT_CONTRACT + RT OFFICE's two entrypoints. RT OFFICE has no
// "handle inbound message" surface of its own (same shape as Artur/Sapargul
// contract-only files) — it is called by Mira/MATCH, never by a passenger
// or driver channel directly, and it owns zero Prisma models: everything it
// returns is read live from RT Core's existing Driver/DriverOffer/Match/
// Trip tables plus CRM Auto's append-only DriveCrmEvent log.
import type { AgentContract } from "@/lib/agents/types";
import { resolveDemandAgainstSupply } from "./facts";
import { reportSupplyAvailable } from "./supply-signal";
import { passengerFacingSupplyFacts, internalSupplyView } from "./bridge";
import type { SupplyAvailableSignal } from "./types";

export const RT_OFFICE_AGENT_CONTRACT: AgentContract = {
  name: "RT_OFFICE",
  mission:
    "Continuously connect unresolved passenger demand (TripRequest) with verified driver supply (DriverOffer) by converting RT Core's existing operational data into structured, never-invented facts for Mira to phrase to passengers — 'CLIENTS NEED VEHICLES. VEHICLES NEED CLIENTS.'",
  inputs: ["TripRequest id (demand side)", "DriverOffer id + report source (supply side)"],
  outputs: [
    "DemandSupplyResolution — candidate SupplyFact[] for a TripRequest, or hasCandidateSupply:false",
    "SupplyAvailableOutcome — whether a re-trigger of RT Core's existing MATCH agent produced a new Match",
  ],
  permissions: [
    "read Driver/DriverOffer/Match/Trip (via matching/engine.ts + facts.ts, never a second matching engine)",
    "read DriveCrmEvent (CRM Auto's append-only log) for ETA/breakdown facts",
    "call MATCH agent (src/lib/agents/match.ts) to re-trigger existing matching — never create a Match itself",
    "write AuditLogEntry (agent: RT_OFFICE)",
  ],
  prohibitedActions: [
    "never act as Mira or send an external passenger/driver-facing message directly (Mira's exclusive external-communication capability)",
    "never own passenger CRM data or modify a TripRequest directly inside Mira CRM",
    "never execute a payment or touch RtBalance/LedgerEntry",
    "never invent payment confirmation, available seats, availability, trip status, or breakdown status — every fact returned must be read live from an existing table",
    "never write DriverOffer.seatsAvailable, Match, or Trip directly — those remain matching/orchestrate.ts's exclusive write surface",
    "never build a duplicate/parallel matching engine",
  ],
  kpi: ["% of TripRequest lookups that surface at least one verified candidate when real supply exists", "fact staleness (age of freshness.asOf on returned SupplyFact)"],
  escalationRules: ["a SupplyFact request for a TripRequest in an unexpected status (not PENDING/MATCHING) returns hasCandidateSupply:false rather than guessing"],
  reportsTo: "ARTUR",
  canRead: ["driver", "driver_offer", "match", "trip", "drive_crm_event"],
  canExecute: ["rt_office.resolve_demand_against_supply", "rt_office.report_supply_available"],
  forbiddenCapabilities: [
    "external_customer_communication",
    "confirm_cargo_payment",
    "cargo_operational_status",
    "central_treasury_transaction_record",
    "complaint_arbitration_decision",
    "disciplinary_sanction",
    "director_daily_brief",
  ],
  handoffTargets: ["MATCH"],
  escalationTarget: "ARTUR",
  criticalityLevel: "MEDIUM",
  active: true,
};

/** Read-only: what Mira should say to a passenger about available supply
 * for their unresolved request. */
export async function resolveSupplyForPassenger(tripRequestId: string) {
  const resolution = await resolveDemandAgainstSupply(tripRequestId);
  return passengerFacingSupplyFacts(resolution);
}

/** Read-only: full-detail internal/dispatcher view (Artur, dispatcher UI). */
export async function resolveSupplyForDispatcher(tripRequestId: string) {
  const resolution = await resolveDemandAgainstSupply(tripRequestId);
  return internalSupplyView(resolution);
}

/** Thin-write: re-trigger RT Core's existing MATCH agent for a reported
 * open offer. Reuses agents/match.ts — never runs its own matching. */
export async function notifySupplyAvailable(signal: SupplyAvailableSignal) {
  return reportSupplyAvailable(signal);
}
