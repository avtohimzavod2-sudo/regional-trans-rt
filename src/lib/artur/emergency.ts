// Force-majeure / 24-7 Founder escalation (AGENTS Master Architecture spec
// s.17/s.18). isEmergencySeverity() (severity.ts) is the only gate allowed
// to open one of these — HIGH/CRITICAL only, never routine operations.
// Idempotent via EmergencyIncident.sourceEventKey, mirroring AdiletCase /
// AccountantCase's existing sourceEventKey pattern so a retried detector
// run can never open a duplicate incident for the same underlying event.
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import type { AgentName, EmergencyIncident, EmergencyResolutionStatus, Prisma } from "@prisma/client";
import type { AgentContext } from "@/lib/agents/types";
import { requireFounderRole } from "./role";
import { emergencyFounderEscalationSchema, type EmergencyFounderEscalation } from "./types";
import { isEmergencySeverity, severityForDiscrepancySom } from "./severity";
import { emitArturEvent } from "./events";

export interface RaiseEmergencyParams {
  source: AgentName | null;
  correlationId?: string;
  relatedEntities?: Record<string, unknown>;
  escalation: EmergencyFounderEscalation;
  /** Caller-supplied dedupe key. A fresh id is generated for a manual,
   * one-off Founder report if the caller has no natural dedupe key. */
  sourceEventKey?: string;
}

/** The only entry point that creates an EmergencyIncident. Rejects anything
 * below HIGH severity outright (spec s.17: "must NOT be used for routine
 * operations") rather than trusting the caller's judgment alone. */
export async function raiseEmergencyIncident(ctx: AgentContext, params: RaiseEmergencyParams): Promise<EmergencyIncident> {
  if (!isEmergencySeverity(params.escalation.severity)) {
    throw new Error(`Emergency escalation requires HIGH or CRITICAL severity, got ${params.escalation.severity}.`);
  }
  const validated = emergencyFounderEscalationSchema.parse(params.escalation);
  const sourceEventKey = params.sourceEventKey ?? `MANUAL:${nanoid()}`;

  const existing = await db.emergencyIncident.findUnique({ where: { sourceEventKey } });
  if (existing) return existing;

  const created = await db.emergencyIncident.create({
    data: {
      source: params.source,
      severity: validated.severity,
      correlationId: params.correlationId,
      relatedEntities: params.relatedEntities as Prisma.InputJsonValue | undefined,
      whatHappened: validated.whatHappened,
      currentStatus: validated.currentStatus,
      peopleOrdersMoneyAffected: validated.peopleOrdersMoneyAffected,
      actionsTaken: validated.actionsTaken,
      immediateRisks: validated.immediateRisks,
      availableOptions: validated.availableOptions,
      recommendation: validated.recommendation,
      decisionRequired: validated.decisionRequired,
      decisionDeadline: validated.decisionDeadline ? new Date(validated.decisionDeadline) : null,
      sourceEventKey,
    },
  });

  await emitArturEvent(ctx, "CRITICAL_INCIDENT_DETECTED", created.id, "EmergencyIncident", { severity: validated.severity, sourceEventKey });
  await emitArturEvent(ctx, "FOUNDER_EMERGENCY_ESCALATION", created.id, "EmergencyIncident", { severity: validated.severity });

  return created;
}

/** Deterministic detector: scans open, unresolved overpayment/discrepancy
 * AccountantCase rows and escalates the ones whose amount alone crosses the
 * HIGH/CRITICAL threshold (severity.ts's severityForDiscrepancySom) — never
 * a judgment call, purely a threshold on real data (spec s.19). Safe to run
 * repeatedly: each case id is its own idempotent sourceEventKey. */
export async function detectFinancialEmergencies(ctx: AgentContext): Promise<EmergencyIncident[]> {
  const openCases = await db.accountantCase.findMany({
    where: { status: { in: ["OPEN", "IN_PROGRESS"] }, amountSom: { not: null } },
    select: { id: true, amountSom: true, summary: true, caseType: true },
  });

  const raised: EmergencyIncident[] = [];
  for (const c of openCases) {
    const amount = c.amountSom ?? 0;
    const severity = severityForDiscrepancySom(amount);
    if (!isEmergencySeverity(severity)) continue;

    const incident = await raiseEmergencyIncident(ctx, {
      source: "ARTUR",
      sourceEventKey: `ARTUR:FINANCIAL:${c.id}`,
      escalation: {
        whatHappened: `Accountant case ${c.id} (${c.caseType}) has an outstanding amount of ${amount} som: ${c.summary}`,
        currentStatus: "Open, unresolved.",
        severity,
        peopleOrdersMoneyAffected: `${amount} som`,
        actionsTaken: "Flagged by Artur's deterministic financial-discrepancy detector; no funds moved.",
        immediateRisks: "Unresolved discrepancy of this size risks financial-record integrity if left open.",
        availableOptions: "Review and resolve the accountant case through Tyyin's existing reconciliation workflow.",
        recommendation: "Assign an accountant to close this case within the normal SLA.",
        decisionRequired: "Confirm whether this requires Founder-level financial review.",
        decisionDeadline: null,
      },
    });
    raised.push(incident);
  }
  return raised;
}

export async function acknowledgeEmergencyIncident(ctx: AgentContext, dispatcherRole: string, requesterId: string, incidentId: string): Promise<EmergencyIncident> {
  requireFounderRole(dispatcherRole);
  return transitionEmergency(ctx, requesterId, incidentId, "ACKNOWLEDGED");
}

export async function resolveEmergencyIncident(ctx: AgentContext, dispatcherRole: string, requesterId: string, incidentId: string, founderResponse: string): Promise<EmergencyIncident> {
  requireFounderRole(dispatcherRole);
  const updated = await db.emergencyIncident.update({
    where: { id: incidentId },
    data: { resolutionStatus: "RESOLVED", founderResponse, resolvedAt: new Date() },
  });
  await emitArturEvent(ctx, "FOUNDER_EMERGENCY_ESCALATION", incidentId, "EmergencyIncident", { requesterId, resolutionStatus: "RESOLVED" });
  return updated;
}

async function transitionEmergency(ctx: AgentContext, requesterId: string, incidentId: string, resolutionStatus: EmergencyResolutionStatus): Promise<EmergencyIncident> {
  const updated = await db.emergencyIncident.update({ where: { id: incidentId }, data: { resolutionStatus } });
  await emitArturEvent(ctx, "FOUNDER_EMERGENCY_ESCALATION", incidentId, "EmergencyIncident", { requesterId, resolutionStatus });
  return updated;
}

export async function listOpenEmergencyIncidents(dispatcherRole: string): Promise<EmergencyIncident[]> {
  requireFounderRole(dispatcherRole);
  return db.emergencyIncident.findMany({ where: { resolutionStatus: { in: ["OPEN", "ACKNOWLEDGED"] } }, orderBy: { detectedAt: "desc" } });
}
