// DRIVER AGENT — thin wrapper around the existing Telegram private-chat
// ingestion path (src/lib/ingest.ts), adding RT AI Workforce trace/audit
// tagging without duplicating the extraction/matching logic already there.
import { ingestDriverPrivateMessage } from "@/lib/ingest";
import { logAgentAction } from "./trace";
import type { AgentContext, AgentContract } from "./types";

export const DRIVER_AGENT_CONTRACT: AgentContract = {
  name: "DRIVER",
  mission: "Turn an inbound Telegram driver message into a normalized DriverOffer and hand it to MATCH.",
  inputs: ["Telegram user id", "Telegram username (optional)", "raw message text", "raw message record id (optional)"],
  outputs: ["DriverOffer, or null if the message wasn't a recognizable offer"],
  permissions: ["read/write Driver", "write DriverOffer", "read Corridor/Stop", "write AuditLogEntry"],
  prohibitedActions: ["never invent a route/date/seat count that the message didn't actually contain", "never propose matches for a driver who isn't ACTIVE"],
  kpi: ["% of driver messages successfully turned into a DriverOffer"],
  escalationRules: ["a driver still PENDING_VERIFICATION gets an offer recorded but not matched, until a dispatcher verifies them"],
};

export async function handleDriverMessage(
  ctx: AgentContext,
  telegramUserId: string,
  telegramUsername: string | null,
  text: string,
  rawMessageId?: string,
) {
  const offer = await ingestDriverPrivateMessage(telegramUserId, telegramUsername, text, rawMessageId);

  await logAgentAction({
    ctx,
    agent: "DRIVER",
    action: offer ? "driver.offer_created" : "driver.message_unrecognized",
    entityType: "DriverOffer",
    entityId: offer?.id ?? telegramUserId,
    details: { telegramUserId },
  });

  return offer;
}
