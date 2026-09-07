// Event hooks for Adilet (AGENTS Adilet spec s.36/s.47). Same pattern as
// src/lib/sapargul/events.ts — no event bus exists in this project, so
// every event is emitted through the existing AuditLogEntry mechanism
// (agentName = "ADILET", details.event = one of these names). This also
// doubles as the mandatory audit trail (spec s.47): case opened, evidence
// attached, warning issued, sanction proposed/applied/expired, appeal
// requested/resolved, case closed — audit history is never deleted.
//
// A normal order never waits on Adilet (spec s.36) — Adilet only ever
// engages via an explicit openCase() call from an escalating agent/case,
// never inline in the hot order path.
import { logAgentAction } from "@/lib/agents/trace";
import type { AgentContext } from "@/lib/agents/types";

export const ADILET_EVENTS = [
  "CASE_OPENED",
  "EVIDENCE_ATTACHED",
  "WARNING_ISSUED",
  "SANCTION_APPLIED",
  "SANCTION_EXPIRED",
  "SANCTION_REVERSED",
  "APPEAL_REQUESTED",
  "APPEAL_RESOLVED",
  "CASE_ESCALATED_TO_DIRECTOR",
  "CASE_CLOSED",
] as const;
export type AdiletEvent = (typeof ADILET_EVENTS)[number];

export async function logAdiletAction(params: { ctx: AgentContext; action: string; entityId: string; entityType?: string; details?: Record<string, unknown> }) {
  return logAgentAction({
    ctx: params.ctx,
    agent: "ADILET",
    action: params.action,
    entityType: params.entityType ?? "AdiletCase",
    entityId: params.entityId,
    details: params.details,
  });
}

export async function emitAdiletEvent(ctx: AgentContext, event: AdiletEvent, caseId: string, details?: Record<string, unknown>) {
  await logAdiletAction({ ctx, action: "adilet.event", entityId: caseId, details: { event, ...details } });
}
