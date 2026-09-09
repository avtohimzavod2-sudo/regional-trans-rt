// MATCH AGENT — thin wrapper around the existing matching orchestration
// (src/lib/matching/engine.ts + orchestrate.ts), adding RT AI Workforce
// trace/audit tagging without duplicating the scoring logic already there.
import { proposeMatchesForOffer, proposeMatchesForRequest } from "@/lib/matching/orchestrate";
import { logAgentAction } from "./trace";
import type { AgentContext, AgentContract } from "./types";

export const MATCH_AGENT_CONTRACT: AgentContract = {
  name: "MATCH",
  mission: "Score and propose the best passenger<->driver pairing for a pending TripRequest or open DriverOffer.",
  inputs: ["TripRequest id or DriverOffer id"],
  outputs: ["a proposed Match sent to the driver, or null if no eligible candidate exists"],
  permissions: ["read TripRequest/DriverOffer/Driver", "write Match", "write AuditLogEntry"],
  prohibitedActions: ["never propose a match with insufficient seats or a different travel date", "never propose more than one active match per request/offer at a time"],
  kpi: ["% of requests matched within their time window", "average time-to-match"],
  escalationRules: ["QUALITY Agent independently re-validates proposals; a flagged proposal should be reviewed before it reaches TRUST's contact-reveal stage"],
  // Driver/passenger notifications about a Match go through Mira's outbound
  // boundary (src/lib/mira/outbound.ts) rather than a second public persona —
  // MATCH itself never owns external_customer_communication.
  forbiddenCapabilities: ["external_customer_communication"],
};

export async function matchRequest(ctx: AgentContext, requestId: string) {
  const match = await proposeMatchesForRequest(requestId);

  await logAgentAction({
    ctx,
    agent: "MATCH",
    action: match ? "match.proposed" : "match.no_candidate",
    entityType: "TripRequest",
    entityId: requestId,
    details: { matchId: match?.id ?? null },
  });

  return match;
}

export async function matchOffer(ctx: AgentContext, offerId: string) {
  const match = await proposeMatchesForOffer(offerId);

  await logAgentAction({
    ctx,
    agent: "MATCH",
    action: match ? "match.proposed" : "match.no_candidate",
    entityType: "DriverOffer",
    entityId: offerId,
    details: { matchId: match?.id ?? null },
  });

  return match;
}
