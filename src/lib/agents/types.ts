import type { AgentName } from "@prisma/client";

/** Every RT AI Workforce agent declares this contract so RT Command (and the
 * dispatcher "system health" view) can introspect what it does, without
 * having to read its implementation.
 *
 * The fields below `escalationRules` were added for the RT Master
 * Architecture / Director Artur spec (s.3/s.26/s.36) and are all optional so
 * every pre-existing contract stays valid untouched (spec s.0.3: "do not
 * rewrite working systems unnecessarily"). A new agent's onboarding (spec
 * s.36) should populate `ownsExclusiveCapabilities` so
 * src/lib/artur/collisions.ts can actually catch a conflict; an agent that
 * omits it is simply invisible to collision detection, not an error. */
export interface AgentContract {
  name: AgentName;
  mission: string;
  inputs: string[];
  outputs: string[];
  permissions: string[];
  prohibitedActions: string[];
  kpi: string[];
  escalationRules: string[];
  /** Who this agent's output ultimately reports to (a manager agent name,
   * "ARTUR", or "FOUNDER"). Undefined = not yet modeled in the reporting
   * hierarchy (spec s.8). */
  reportsTo?: string;
  /** Capability strings this agent claims EXCLUSIVE ownership of (spec
   * s.20's single-writer rule). Two contracts in AGENT_REGISTRY must never
   * share an entry here — see src/lib/artur/collisions.ts. */
  ownsExclusiveCapabilities?: string[];
  canRead?: string[];
  canWrite?: string[];
  canExecute?: string[];
  forbiddenCapabilities?: string[];
  /** Other agent names this agent may typed-hand-off to (spec s.24). */
  handoffTargets?: string[];
  escalationTarget?: string;
  criticalityLevel?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  active?: boolean;
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
