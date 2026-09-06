// QUALITY AGENT — audits other agents' actions, verifies business rules, and
// guards against hallucination (invented drivers/prices/seats/payments).
// This agent only ever *detects and flags*; it never silently repairs data —
// any fix is a dispatcher decision.
import { db } from "@/lib/db";
import { computeCommissionSom } from "./pay";
import { logAgentAction } from "./trace";
import type { AgentContext, AgentContract } from "./types";

export const QUALITY_AGENT_CONTRACT: AgentContract = {
  name: "QUALITY",
  mission: "Verify other agents' outputs against business rules and flag anomalies before they cause harm.",
  inputs: ["proposed Match", "commission charge", "ledger entries", "trip lifecycle state"],
  outputs: ["validation result (valid/violations)", "anomaly reports written to the audit log"],
  permissions: ["read Match/Trip/LedgerEntry/DriverOffer/TripRequest", "write AuditLogEntry"],
  prohibitedActions: ["never invent or assume data that isn't actually present", "never silently correct another agent's mistake — flag it for a human"],
  kpi: ["anomalies caught before a dispatcher had to notice manually", "false positive rate of flags"],
  escalationRules: ["any detected anomaly is written to the audit log with requiresHumanReview semantics for the dispatcher UI to surface"],
};

export interface MatchProposalInput {
  requestSeats: number;
  offerSeatsAvailable: number;
  requestOriginCorridorId: string;
  offerOriginCorridorId: string;
  requestTravelDate: string; // ISO date, yyyy-mm-dd
  offerTravelDate: string;
}

export interface ValidationResult {
  valid: boolean;
  violations: string[];
}

/** Pure: sanity-check a proposed match before it's shown to a driver/passenger. No I/O. */
export function validateMatchProposal(input: MatchProposalInput): ValidationResult {
  const violations: string[] = [];

  if (input.requestSeats > input.offerSeatsAvailable) {
    violations.push(`insufficient_seats: request needs ${input.requestSeats}, offer has ${input.offerSeatsAvailable}`);
  }
  if (input.requestOriginCorridorId !== input.offerOriginCorridorId) {
    violations.push("corridor_mismatch: request and offer are on different corridors");
  }
  if (input.requestTravelDate !== input.offerTravelDate) {
    violations.push(`date_mismatch: request is ${input.requestTravelDate}, offer is ${input.offerTravelDate}`);
  }

  return { valid: violations.length === 0, violations };
}

/** Pure: verify a charged commission actually matches the 100-som-per-seat rule. No I/O. */
export function validateCommissionAmount(seats: number, chargedCommissionSom: number): ValidationResult {
  const expected = computeCommissionSom(seats);
  if (chargedCommissionSom !== expected) {
    return { valid: false, violations: [`commission_mismatch: expected ${expected} for ${seats} seat(s), got ${chargedCommissionSom}`] };
  }
  return { valid: true, violations: [] };
}

export interface QualityAnomaly {
  entityType: string;
  entityId: string;
  issue: string;
}

/**
 * Sweep recently-touched records for anomalies a bug (not a fraud actor)
 * could plausibly cause: completed trips never billed, confirmed matches
 * with no score, or a ledger charge that doesn't match the 100-som rule.
 * Read-only except for writing the anomaly report itself to the audit log.
 */
export async function runQualityAudit(ctx: AgentContext): Promise<QualityAnomaly[]> {
  const anomalies: QualityAnomaly[] = [];

  const uncommissionedCompletedTrips = await db.trip.findMany({
    where: { status: "COMPLETED", commissionChargedAt: null },
    select: { id: true },
  });
  for (const trip of uncommissionedCompletedTrips) {
    anomalies.push({ entityType: "Trip", entityId: trip.id, issue: "completed trip has no commission charge" });
  }

  const scorelessConfirmedMatches = await db.match.findMany({
    where: { status: "CONFIRMED", score: null },
    select: { id: true },
  });
  for (const match of scorelessConfirmedMatches) {
    anomalies.push({ entityType: "Match", entityId: match.id, issue: "confirmed match has no ranking score recorded" });
  }

  const chargedTrips = await db.trip.findMany({
    where: { commissionChargedAt: { not: null } },
    select: { id: true, seats: true, commissionSom: true },
  });
  for (const trip of chargedTrips) {
    if (trip.commissionSom == null) continue;
    const check = validateCommissionAmount(trip.seats, trip.commissionSom);
    if (!check.valid) {
      anomalies.push({ entityType: "Trip", entityId: trip.id, issue: check.violations.join("; ") });
    }
  }

  if (anomalies.length > 0) {
    await logAgentAction({
      ctx,
      agent: "QUALITY",
      action: "quality.anomalies_detected",
      entityType: "System",
      entityId: "quality_audit",
      details: { anomalies },
    });
  }

  return anomalies;
}
