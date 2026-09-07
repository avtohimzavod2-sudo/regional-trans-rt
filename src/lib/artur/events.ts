// Event hooks for Artur (AGENTS Master Architecture spec s.24). Same
// no-event-bus pattern as src/lib/tyyin/events.ts / src/lib/adilet/events.ts
// — every event is an AuditLogEntry (agentName = "ARTUR", details.event =
// one of these names). The typed handoff names below are taken directly
// from spec s.24's ManagerDailyReportReady / DirectorDailyReviewStarted /
// FounderBriefReady / ... catalog.
import { logAgentAction } from "@/lib/agents/trace";
import type { AgentContext } from "@/lib/agents/types";

export const ARTUR_EVENTS = [
  "DIRECTOR_DAILY_REVIEW_STARTED",
  "FOUNDER_BRIEF_READY",
  "NOTIFICATION_DELIVERY_ATTEMPTED",
  "WEEKLY_REPORT_READY",
  "DIRECTOR_INITIATIVE_PROPOSED",
  "FOUNDER_INITIATIVE_DECISION",
  "CRITICAL_INCIDENT_DETECTED",
  "FOUNDER_EMERGENCY_ESCALATION",
  "SCHEDULED_JOB_STARTED",
  "SCHEDULED_JOB_SUCCEEDED",
  "SCHEDULED_JOB_FAILED",
  "MANAGER_REPORT_DISCREPANCY_FLAGGED",
] as const;
export type ArturEvent = (typeof ARTUR_EVENTS)[number];

export async function logArturAction(params: { ctx: AgentContext; action: string; entityId: string; entityType?: string; details?: Record<string, unknown> }) {
  return logAgentAction({
    ctx: params.ctx,
    agent: "ARTUR",
    action: params.action,
    entityType: params.entityType ?? "FounderBrief",
    entityId: params.entityId,
    details: params.details,
  });
}

export async function emitArturEvent(ctx: AgentContext, event: ArturEvent, entityId: string, entityType?: string, details?: Record<string, unknown>) {
  await logArturAction({ ctx, action: "artur.event", entityId, entityType, details: { event, ...details } });
}
