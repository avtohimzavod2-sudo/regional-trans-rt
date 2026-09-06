// TRUST AGENT — safety gate for contact reveal, plus rating/complaint
// bookkeeping. Contact reveal already requires both-sides confirmation
// (orchestrate.ts); Trust Agent is an additional, independent safety net
// that can veto a reveal even after both sides confirmed (e.g. driver was
// blocked in the meantime, or a female-only preference isn't satisfied).
import { db } from "@/lib/db";
import { logAgentAction } from "./trace";
import type { AgentContext, AgentContract } from "./types";

export const TRUST_AGENT_CONTRACT: AgentContract = {
  name: "TRUST",
  mission: "Gate contact reveal on safety, and maintain driver trust signals (rating, complaints, blocks).",
  inputs: ["driver status", "passenger block status", "trip safety preferences", "complaint reports"],
  outputs: ["reveal allow/deny decision", "updated complaint/rating counters", "block recommendation"],
  permissions: ["read Driver/Passenger status", "write Driver.complaintsCount/ratingAvg/status", "write AuditLogEntry"],
  prohibitedActions: ["never reveal a contact when this agent denies it", "never unblock a driver/passenger automatically — only a dispatcher may"],
  kpi: ["contact-reveal incidents", "complaint rate per completed trip", "repeat complaint drivers"],
  escalationRules: ["3+ complaints against the same driver -> suggest SUSPENDED and notify dispatcher"],
};

const SUSPEND_AFTER_COMPLAINTS = 3;

export interface RevealSafetyInput {
  driverStatus: "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "BLOCKED";
  driverIsFemale: boolean | null;
  passengerIsBlocked: boolean;
  femaleOnlyDriverRequested: boolean;
}

export interface RevealSafetyDecision {
  allowed: boolean;
  reason?: string;
}

/** Pure safety predicate — no I/O, fully unit-testable. */
export function evaluateRevealSafety(input: RevealSafetyInput): RevealSafetyDecision {
  if (input.driverStatus !== "ACTIVE") return { allowed: false, reason: `driver status is ${input.driverStatus}, not ACTIVE` };
  if (input.passengerIsBlocked) return { allowed: false, reason: "passenger is blocked" };
  if (input.femaleOnlyDriverRequested && input.driverIsFemale !== true) {
    return { allowed: false, reason: "passenger requested a female driver but the matched driver did not declare isFemale" };
  }
  return { allowed: true };
}

/** Pure: decide the trust-status effect of a newly recorded complaint. */
export function evaluateAfterComplaint(newComplaintsCount: number): { suggestSuspend: boolean } {
  return { suggestSuspend: newComplaintsCount >= SUSPEND_AFTER_COMPLAINTS };
}

export async function assertSafeToReveal(ctx: AgentContext, matchId: string): Promise<RevealSafetyDecision> {
  const match = await db.match.findUniqueOrThrow({
    where: { id: matchId },
    include: {
      tripRequest: { include: { passenger: true } },
      driverOffer: { include: { driver: true } },
    },
  });

  const decision = evaluateRevealSafety({
    driverStatus: match.driverOffer.driver.status,
    driverIsFemale: match.driverOffer.driver.isFemale,
    passengerIsBlocked: match.tripRequest.passenger.isBlocked,
    femaleOnlyDriverRequested: match.tripRequest.femaleOnlyDriver,
  });

  await logAgentAction({
    ctx,
    agent: "TRUST",
    action: decision.allowed ? "trust.reveal_allowed" : "trust.reveal_denied",
    entityType: "Match",
    entityId: matchId,
    details: { reason: decision.reason ?? null },
  });

  return decision;
}

export async function recordComplaint(ctx: AgentContext, driverId: string, reason: string, reportedByActorId?: string) {
  const driver = await db.driver.update({
    where: { id: driverId },
    data: { complaintsCount: { increment: 1 } },
  });

  const { suggestSuspend } = evaluateAfterComplaint(driver.complaintsCount);

  await logAgentAction({
    ctx,
    agent: "TRUST",
    action: "trust.complaint_recorded",
    entityType: "Driver",
    entityId: driverId,
    details: { reason, reportedByActorId: reportedByActorId ?? null, complaintsCount: driver.complaintsCount, suggestSuspend },
  });

  return { driver, suggestSuspend };
}
