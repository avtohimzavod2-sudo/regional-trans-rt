import type { AgentName } from "@prisma/client";

/** Every RT AI Workforce agent declares this contract so RT Command (and the
 * dispatcher "system health" view) can introspect what it does, without
 * having to read its implementation. */
export interface AgentContract {
  name: AgentName;
  mission: string;
  inputs: string[];
  outputs: string[];
  permissions: string[];
  prohibitedActions: string[];
  kpi: string[];
  escalationRules: string[];
}

/** Threaded through every agent call within one RT Command run so all audit
 * entries for a single incoming request can be correlated, and so the
 * orchestrator can enforce a hard cap on agent-to-agent hops. */
export interface AgentContext {
  traceId: string;
  hop: number;
}

export const MAX_AGENT_HOPS = 8;

export class AgentHopLimitExceededError extends Error {
  constructor(traceId: string) {
    super(`RT Command aborted trace ${traceId}: exceeded ${MAX_AGENT_HOPS} agent hops`);
    this.name = "AgentHopLimitExceededError";
  }
}

/** Advance the context for a nested agent call; throws if the run is looping. */
export function nextHop(ctx: AgentContext): AgentContext {
  if (ctx.hop >= MAX_AGENT_HOPS) throw new AgentHopLimitExceededError(ctx.traceId);
  return { traceId: ctx.traceId, hop: ctx.hop + 1 };
}

export interface AgentResult<T> {
  ok: boolean;
  agent: AgentName;
  data?: T;
  error?: string;
  /** Set when the agent could not safely proceed and a dispatcher must decide. */
  requiresHumanReview?: boolean;
}

export function ok<T>(agent: AgentName, data: T): AgentResult<T> {
  return { ok: true, agent, data };
}

export function fail<T>(agent: AgentName, error: string, requiresHumanReview = false): AgentResult<T> {
  return { ok: false, agent, error, requiresHumanReview };
}
