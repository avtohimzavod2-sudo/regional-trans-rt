// Market Acquisition Contractors — shared, DB-free types. This module is
// infrastructure (like src/lib/agents/trace.ts's logAgentAction) used by all
// three contractors, never a business capability of its own — see
// docs/AGENT_CONSTITUTION.md s.3 for why AcquisitionOutreachEvent writes are
// not an ownsExclusiveCapabilities entry.
import type { AcquisitionProspectType, AcquisitionSourceType, AgentName, Channel, OutreachStatus } from "@prisma/client";

export interface OutreachRequest {
  contractorAgent: AgentName;
  prospectType: AcquisitionProspectType;
  prospectRef: string;
  channel: Channel;
  sourceType: AcquisitionSourceType;
  sourceRef?: string | null;
  /** Recipient address in the given channel (telegram user id, WhatsApp E.164 number). */
  to: string;
  text: string;
  /** Caller-supplied, stable across retries of the *same* logical attempt —
   * see outreach-log.ts's P2002-based dedup, the same pattern
   * crm-auto/orchestrator.ts's recordOperationalEvent uses. */
  idempotencyKey: string;
  /** Normalized cross-type identity signal (src/lib/prospecting/identity.ts).
   * When present, an opt-out recorded against this fingerprint by ANY
   * contractor blocks outreach here too, even under a different
   * prospectType/prospectRef — see isDoNotContactFingerprint. Optional:
   * absent for any caller that hasn't computed one. */
  contactFingerprint?: string | null;
}

export interface OutreachOutcome {
  status: OutreachStatus;
  eventId: string;
  deduplicated: boolean;
}

/** One real-world sending channel. Never claims delivery it cannot verify —
 * `send` either resolves with the channel's own delivery signal or throws;
 * outreach-log.ts is the only place that turns that into an honest
 * OutreachStatus. */
export interface OutreachAdapter {
  channel: Channel;
  isConfigured(): boolean;
  send(to: string, text: string): Promise<{ delivered: boolean }>;
}
