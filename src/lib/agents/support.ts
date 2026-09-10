// SUPPORT AGENT — cancellation, no-shows, lateness, disputes, refunds, route
// changes. Owns the SupportCase state machine; escalates to a human
// dispatcher whenever a case can't be resolved by rule alone.
import type { ActorType, SupportCaseStatus, SupportCaseType } from "@prisma/client";
import { db } from "@/lib/db";
import { logAgentAction } from "./trace";
import type { AgentContext, AgentContract } from "./types";

export const SUPPORT_AGENT_CONTRACT: AgentContract = {
  name: "SUPPORT",
  mission: "Handle post-match/post-trip problems: cancellations, no-shows, lateness, disputes, refunds, route changes.",
  inputs: ["trip id (optional)", "case type", "reporter", "description"],
  outputs: ["SupportCase record", "resolution or escalation"],
  permissions: ["read/write SupportCase", "write Trip.status on cancellation/no-show", "write AuditLogEntry"],
  prohibitedActions: ["never issue a refund itself (PAY Agent / dispatcher does that)", "never silently close a dispute without a resolution note"],
  kpi: ["case resolution time", "escalation rate", "repeat-case drivers/passengers"],
  escalationRules: ["DISPUTE and REFUND_REQUEST always start ESCALATED — a human decides", "a second case of the same type against the same trip auto-escalates"],
};

const AUTO_ESCALATED_TYPES: SupportCaseType[] = ["DISPUTE", "REFUND_REQUEST"];

/** Pure: decide the initial status a new case should open in. */
export function initialStatusFor(caseType: SupportCaseType): SupportCaseStatus {
  return AUTO_ESCALATED_TYPES.includes(caseType) ? "ESCALATED" : "OPEN";
}

/** Pure: whether a resolution note is required to move a case to RESOLVED/CLOSED. */
export function canResolveWithoutNote(caseType: SupportCaseType): boolean {
  return !AUTO_ESCALATED_TYPES.includes(caseType);
}

export async function openSupportCase(
  ctx: AgentContext,
  params: {
    tripId?: string;
    caseType: SupportCaseType;
    openedByType: ActorType;
    openedById?: string;
    description?: string;
    /** Set when the caller (matching/orchestrate.ts's cancelTrip) has already
     * performed the CAS-guarded Trip cancellation itself — e.g. to also
     * release the held seat and trigger rematch, neither of which this
     * function knows how to do. Skips the plain, non-CAS-guarded Trip.update
     * below so it can't clobber the reason-code-prefixed cancelReason
     * cancelTrip already wrote (see booking-state.ts's CANCEL_REASON). */
    skipTripStatusUpdate?: boolean;
  },
) {
  const status = initialStatusFor(params.caseType);

  const supportCase = await db.supportCase.create({
    data: {
      tripId: params.tripId,
      caseType: params.caseType,
      status,
      openedByType: params.openedByType,
      openedById: params.openedById,
      description: params.description,
      escalatedAt: status === "ESCALATED" ? new Date() : null,
    },
  });

  if (!params.skipTripStatusUpdate && params.tripId && (params.caseType === "CANCELLATION" || params.caseType === "DRIVER_NO_SHOW" || params.caseType === "PASSENGER_NO_SHOW")) {
    await db.trip.update({
      where: { id: params.tripId },
      data: { status: params.caseType === "CANCELLATION" ? "CANCELLED" : "NO_SHOW", cancelReason: params.description },
    });
  }

  await logAgentAction({
    ctx,
    agent: "SUPPORT",
    action: "support.case_opened",
    entityType: "SupportCase",
    entityId: supportCase.id,
    details: { caseType: params.caseType, status, tripId: params.tripId ?? null },
  });

  return supportCase;
}

export async function resolveSupportCase(ctx: AgentContext, caseId: string, resolution: string) {
  const supportCase = await db.supportCase.update({
    where: { id: caseId },
    data: { status: "RESOLVED", resolution, resolvedAt: new Date() },
  });

  await logAgentAction({
    ctx,
    agent: "SUPPORT",
    action: "support.case_resolved",
    entityType: "SupportCase",
    entityId: caseId,
    details: { resolution },
  });

  return supportCase;
}
