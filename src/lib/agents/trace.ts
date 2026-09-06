import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import type { AgentName } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { AgentContext } from "./types";

export function newTraceId(): string {
  return `rt_${nanoid(12)}`;
}

export function rootContext(): AgentContext {
  return { traceId: newTraceId(), hop: 0 };
}

/** Audit log write tagged with the agent and trace id, so every RT AI
 * Workforce decision is reconstructable from the audit trail. */
export async function logAgentAction(params: {
  ctx: AgentContext;
  agent: AgentName;
  action: string;
  entityType: string;
  entityId: string;
  // Accepts any plain-data shape (not just Prisma.InputJsonValue) so callers
  // can pass typed interfaces/arrays straight through without each one
  // needing an index signature — this is the only place that talks to Prisma.
  details?: Record<string, unknown> | unknown[];
}) {
  return db.auditLogEntry.create({
    data: {
      actorType: "AGENT",
      actorId: params.agent,
      agentName: params.agent,
      traceId: params.ctx.traceId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      details: params.details as Prisma.InputJsonValue | undefined,
    },
  });
}
