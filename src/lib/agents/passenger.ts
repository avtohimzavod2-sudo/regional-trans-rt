// PASSENGER AGENT — thin wrapper around the existing WhatsApp ingestion path
// (src/lib/ingest.ts), adding RT AI Workforce trace/audit tagging without
// duplicating the extraction/matching logic that already lives there.
import { ingestPassengerMessage } from "@/lib/ingest";
import { logAgentAction } from "./trace";
import type { AgentContext, AgentContract } from "./types";

export const PASSENGER_AGENT_CONTRACT: AgentContract = {
  name: "PASSENGER",
  mission: "Turn an inbound WhatsApp passenger message into a normalized TripRequest and hand it to MATCH.",
  inputs: ["WhatsApp sender id", "raw message text", "raw message record id (optional)"],
  outputs: ["TripRequest, or null if the message wasn't a recognizable request"],
  permissions: ["read/write Passenger", "write TripRequest", "read Corridor/Stop", "write AuditLogEntry"],
  prohibitedActions: ["never invent an origin/destination/date/seat count that the message didn't actually contain"],
  kpi: ["% of passenger messages successfully turned into a TripRequest"],
  escalationRules: ["low-confidence extraction is already handled by falling back to messages.unrecognized in ingest.ts"],
};

export async function handlePassengerMessage(ctx: AgentContext, whatsappId: string, text: string, rawMessageId?: string) {
  const request = await ingestPassengerMessage(whatsappId, text, rawMessageId);

  await logAgentAction({
    ctx,
    agent: "PASSENGER",
    action: request ? "passenger.request_created" : "passenger.message_unrecognized",
    entityType: "TripRequest",
    entityId: request?.id ?? whatsappId,
    details: { whatsappId },
  });

  return request;
}
