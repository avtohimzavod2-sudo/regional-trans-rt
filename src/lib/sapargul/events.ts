// Sapargul's own audit trail, kept distinct from Sapar's (agent: "SAPAR" in
// src/lib/sapar/events.ts) so operational and financial event streams never
// mix in the audit log (AGENTS spec s.5/s.22). Reuses the same AuditLogEntry
// mechanism as every other RT AI Workforce agent — no second audit table.
import { logAgentAction } from "@/lib/agents/trace";
import type { AgentContext } from "@/lib/agents/types";

export async function logSapargulAction(params: {
  ctx: AgentContext;
  action: string;
  entityId: string;
  entityType?: string;
  details?: Record<string, unknown>;
}) {
  return logAgentAction({
    ctx: params.ctx,
    agent: "SAPARGUL",
    action: params.action,
    entityType: params.entityType ?? "ShipmentPayment",
    entityId: params.entityId,
    details: params.details,
  });
}
