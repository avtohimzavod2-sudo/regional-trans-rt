// Event hooks for Tyyin (AGENTS Tyyin spec s.42/s.65). Same pattern as
// src/lib/sapargul/events.ts and src/lib/adilet/events.ts — no event bus
// exists in this project, so every event is emitted through the existing
// AuditLogEntry mechanism (agentName = "TYYIN", details.event = one of
// these names). This also doubles as the mandatory audit trail (spec s.65):
// actor/source/event/amount/reference/timestamp — old/new state and reason
// are passed through `details` by each caller.
import { logAgentAction } from "@/lib/agents/trace";
import type { AgentContext } from "@/lib/agents/types";

export const TYYIN_EVENTS = [
  "TREASURY_TRANSACTION_RECEIVED",
  "TREASURY_TRANSACTION_MATCHED",
  "TREASURY_TRANSACTION_UNMATCHED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_MISMATCH",
  "UNDERPAYMENT_DETECTED",
  "OVERPAYMENT_DETECTED",
  "ACCOUNTANT_CASE_OPENED",
  "ACCOUNTANT_CASE_RESOLVED",
  "FINANCIAL_CASE_CLOSED",
  "OWNER_DIRECT_CALL",
] as const;
export type TyyinEvent = (typeof TYYIN_EVENTS)[number];

export async function logTyyinAction(params: { ctx: AgentContext; action: string; entityId: string; entityType?: string; details?: Record<string, unknown> }) {
  return logAgentAction({
    ctx: params.ctx,
    agent: "TYYIN",
    action: params.action,
    entityType: params.entityType ?? "TreasuryTransaction",
    entityId: params.entityId,
    details: params.details,
  });
}

export async function emitTyyinEvent(ctx: AgentContext, event: TyyinEvent, entityId: string, entityType?: string, details?: Record<string, unknown>) {
  await logTyyinAction({ ctx, action: "tyyin.event", entityId, entityType, details: { event, ...details } });
}
