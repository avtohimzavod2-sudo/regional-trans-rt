// Event hooks for the future Сапаргул (Sapargul) finance agent (AGENTS
// spec s.0/s.34). No event bus exists in this project yet, and building one
// now would be over-engineering for a single future subscriber — so, like
// every other RT AI Workforce agent, Sapar emits these through the existing
// AuditLogEntry mechanism. Sapargul (or anyone else — analytics, the future
// cargo-department growth manager) can subscribe later by querying
// AuditLogEntry where agentName = "SAPAR" and details.event = one of these
// names, without Sapar ever having to know who's listening.
//
// Sapar never computes or moves money — these events only ever carry
// operational facts (which shipment, which status, when), never a
// financial decision (AGENTS spec s.1).
import { logAgentAction } from "@/lib/agents/trace";
import type { AgentContext } from "@/lib/agents/types";

export const SAPARGUL_EVENTS = [
  "DELIVERY_CREATED",
  "QUOTE_ACCEPTED",
  "PAYMENT_REQUIRED",
  "PAYMENT_CONFIRMED",
  "COURIER_ASSIGNED",
  "PICKUP_CONFIRMED",
  "DELIVERY_COMPLETED",
  "DELIVERY_CANCELLED",
  "REFUND_REQUIRED",
  "EXECUTOR_PAYOUT_REQUIRED",
  "DELIVERY_DISPUTE",
] as const;
export type SapargulEvent = (typeof SAPARGUL_EVENTS)[number];

export async function emitSapargulEvent(ctx: AgentContext, event: SapargulEvent, shipmentId: string, details?: Record<string, unknown>) {
  await logAgentAction({
    ctx,
    agent: "SAPAR",
    action: "sapar.event",
    entityType: "Shipment",
    entityId: shipmentId,
    details: { event, ...details },
  });
}
