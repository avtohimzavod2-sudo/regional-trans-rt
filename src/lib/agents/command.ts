// RT COMMAND — the single entrypoint the user (and the webhooks) actually
// talk to. Accepts an inbound message, classifies it with the free
// quick-classify fast layer first, decides which specialist agent(s) to
// dispatch to, and returns a normalized result. Callers should route through
// here instead of calling ingest.ts/orchestrate.ts directly, so every
// inbound message gets a traceId and an audit trail.
import type { AgentName } from "@prisma/client";
import { db } from "@/lib/db";
import { ingestAllowedGroupMessage } from "@/lib/ingest";
import { quickClassifyMessage, type QuickClassification } from "./quick-classify";
import { handlePassengerMessage } from "./passenger";
import { handleDriverMessage } from "./driver";
import { openSupportCase } from "./support";
import { logAgentAction, rootContext } from "./trace";
import { nextHop, type AgentContext, type AgentContract } from "./types";

export const COMMAND_AGENT_CONTRACT: AgentContract = {
  name: "COMMAND",
  mission: "Accept every inbound message, determine role/intent, and dispatch to only the specialist agents actually needed.",
  inputs: ["channel", "sender id", "raw message text"],
  outputs: ["a routed result carrying the traceId and which agents handled it"],
  permissions: ["read/write via the specialist agents it dispatches to", "write AuditLogEntry"],
  prohibitedActions: ["never run every agent for every message", "never let an agent-to-agent chain exceed MAX_AGENT_HOPS"],
  kpi: ["% of messages resolved without an LLM call (fast-layer hit rate)", "average agents invoked per message"],
  escalationRules: ["quick-classify confidence 0 in a group chat skips the LLM extractor entirely — nothing to escalate, it's just noise"],
};

export type InboundChannel = "WHATSAPP" | "TELEGRAM_BOT" | "TELEGRAM_GROUP";

export interface InboundMessage {
  channel: InboundChannel;
  senderId: string; // whatsappId for WHATSAPP, telegramUserId otherwise
  senderUsername?: string | null;
  text: string;
  telegramGroupId?: string; // required for TELEGRAM_GROUP
  chatId?: string; // required for TELEGRAM_GROUP
  rawMessageId?: string;
}

export type RouteDecision =
  | { kind: "ATTEMPT_CANCELLATION_THEN_INGEST" }
  | { kind: "INGEST_PASSENGER" }
  | { kind: "INGEST_DRIVER" }
  | { kind: "SKIP_GROUP_MESSAGE" }
  | { kind: "INGEST_GROUP" };

/**
 * Pure: decide what to do with a message given its channel and the free
 * fast-layer classification. No I/O — fully unit-testable.
 */
export function decideRoute(channel: InboundChannel, quick: QuickClassification): RouteDecision {
  if (quick.intent === "cancellation") return { kind: "ATTEMPT_CANCELLATION_THEN_INGEST" };
  if (channel === "WHATSAPP") return { kind: "INGEST_PASSENGER" };
  if (channel === "TELEGRAM_BOT") return { kind: "INGEST_DRIVER" };
  if (quick.intent === "unrecognized" && quick.confidence === 0) return { kind: "SKIP_GROUP_MESSAGE" };
  return { kind: "INGEST_GROUP" };
}

export interface CommandResult {
  traceId: string;
  routedTo: AgentName[];
  outcome:
    | "trip_request_created"
    | "driver_offer_created"
    | "cancellation_case_opened"
    | "group_message_recorded"
    | "group_message_skipped"
    | "unrecognized";
  data?: unknown;
}

async function tryOpenCancellationCase(ctx: AgentContext, msg: InboundMessage) {
  if (msg.channel === "TELEGRAM_GROUP") return null;

  const trip =
    msg.channel === "WHATSAPP"
      ? await db.trip.findFirst({ where: { status: "SCHEDULED", passenger: { whatsappId: msg.senderId } }, orderBy: { createdAt: "desc" } })
      : await db.trip.findFirst({ where: { status: "SCHEDULED", driver: { telegramUserId: msg.senderId } }, orderBy: { createdAt: "desc" } });

  if (!trip) return null;

  return openSupportCase(ctx, {
    tripId: trip.id,
    caseType: "CANCELLATION",
    openedByType: "AGENT",
    openedById: "COMMAND",
    description: msg.text,
  });
}

async function dispatchIngest(ctx: AgentContext, kind: Exclude<RouteDecision["kind"], "ATTEMPT_CANCELLATION_THEN_INGEST">, msg: InboundMessage): Promise<CommandResult> {
  switch (kind) {
    case "INGEST_PASSENGER": {
      const request = await handlePassengerMessage(nextHop(ctx), msg.senderId, msg.text, msg.rawMessageId);
      return { traceId: ctx.traceId, routedTo: ["COMMAND", "PASSENGER"], outcome: request ? "trip_request_created" : "unrecognized", data: request };
    }
    case "INGEST_DRIVER": {
      const offer = await handleDriverMessage(nextHop(ctx), msg.senderId, msg.senderUsername ?? null, msg.text, msg.rawMessageId);
      return { traceId: ctx.traceId, routedTo: ["COMMAND", "DRIVER"], outcome: offer ? "driver_offer_created" : "unrecognized", data: offer };
    }
    case "SKIP_GROUP_MESSAGE": {
      await logAgentAction({ ctx, agent: "COMMAND", action: "command.group_message_skipped_fast_layer", entityType: "InboundMessage", entityId: msg.senderId });
      return { traceId: ctx.traceId, routedTo: ["COMMAND"], outcome: "group_message_skipped" };
    }
    case "INGEST_GROUP": {
      if (!msg.telegramGroupId || !msg.chatId) throw new Error("TELEGRAM_GROUP messages require telegramGroupId and chatId");
      const rawMessage = await ingestAllowedGroupMessage({
        telegramGroupId: msg.telegramGroupId,
        chatId: msg.chatId,
        senderId: msg.senderId,
        senderUsername: msg.senderUsername ?? null,
        text: msg.text,
      });
      return { traceId: ctx.traceId, routedTo: ["COMMAND"], outcome: "group_message_recorded", data: rawMessage };
    }
  }
}

export async function handleInboundMessage(msg: InboundMessage): Promise<CommandResult> {
  const ctx = rootContext();
  const quick = quickClassifyMessage(msg.text);

  await logAgentAction({
    ctx,
    agent: "COMMAND",
    action: "command.message_received",
    entityType: "InboundMessage",
    entityId: msg.senderId,
    details: { channel: msg.channel, quick },
  });

  const decision = decideRoute(msg.channel, quick);

  if (decision.kind === "ATTEMPT_CANCELLATION_THEN_INGEST") {
    const opened = await tryOpenCancellationCase(ctx, msg);
    if (opened) {
      return { traceId: ctx.traceId, routedTo: ["COMMAND", "SUPPORT"], outcome: "cancellation_case_opened", data: opened };
    }
    // No active trip found for this sender — the cancellation-shaped wording
    // wasn't actually about a real trip, so fall through to normal ingestion.
    const fallback = decideRoute(msg.channel, { ...quick, intent: "unrecognized" });
    return dispatchIngest(ctx, fallback.kind as Exclude<RouteDecision["kind"], "ATTEMPT_CANCELLATION_THEN_INGEST">, msg);
  }

  return dispatchIngest(ctx, decision.kind, msg);
}
