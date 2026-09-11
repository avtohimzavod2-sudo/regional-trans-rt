// MIRA-OWNED OUTBOUND BOUNDARY (spec s.11/s.16) — the single point through
// which any agent's private, operational message to a passenger or driver
// leaves the system. Per AGENT_CONSTITUTION.md and MIRA_AGENT_CONTRACT
// (mira/orchestrator.ts), Mira is the sole declared owner of the
// "external_customer_communication" capability. MATCH (matching/orchestrate.ts)
// previously called the raw messaging adapters directly for driver/passenger
// proposal, decline, and contact-reveal notifications — an undeclared bypass
// of that ownership boundary. It now routes through here instead.
//
// Mode-gated (mirrors src/lib/acquisition/outreach-log.ts's
// ACQUISITION_OUTREACH_MODE pattern): outside MIRA_OUTBOUND_MODE=LIVE, no
// export here ever reaches a real provider adapter, so a scenario/simulation
// run — not just a mocked unit test — can never send a real WhatsApp/Telegram
// message through this boundary. The safe default is always non-LIVE; an
// unrecognized value is treated as DRY_RUN, never LIVE.
import type { InlineKeyboard } from "grammy";
import { logAction } from "@/lib/audit";
import { confirmDeclineKeyboard, sendTelegramMessage } from "@/lib/messaging/telegram";
import { sendWhatsAppConfirmButtons, sendWhatsAppText } from "@/lib/messaging/whatsapp";

export { confirmDeclineKeyboard };

export type MiraOutboundMode = "LIVE" | "SANDBOX" | "DRY_RUN";

export function resolveOutboundMode(): MiraOutboundMode {
  const raw = (process.env.MIRA_OUTBOUND_MODE ?? "DRY_RUN").toUpperCase();
  return raw === "LIVE" || raw === "SANDBOX" ? raw : "DRY_RUN";
}

async function recordSuppressedSend(
  kind: "driver_private" | "passenger_text" | "passenger_confirm_buttons",
  channel: "TELEGRAM" | "WHATSAPP",
  to: string,
  mode: "SANDBOX" | "DRY_RUN",
) {
  await logAction({
    actorType: "AGENT",
    actorId: "MIRA",
    action: "mira.outbound.suppressed",
    entityType: "OutboundMessage",
    entityId: to,
    details: { kind, channel, mode },
  });
  return { status: mode } as const;
}

/** A driver's own private bot chat — used for Match proposals, decline/try-next
 * notices, and post-confirmation contact reveal. */
export async function notifyDriverPrivately(telegramUserId: string, text: string, keyboard?: InlineKeyboard) {
  const mode = resolveOutboundMode();
  if (mode !== "LIVE") return recordSuppressedSend("driver_private", "TELEGRAM", telegramUserId, mode);
  return sendTelegramMessage(telegramUserId, text, keyboard);
}

/** A passenger's WhatsApp thread — plain text, used for post-confirmation contact reveal. */
export async function notifyPassengerText(whatsappId: string, text: string) {
  const mode = resolveOutboundMode();
  if (mode !== "LIVE") return recordSuppressedSend("passenger_text", "WHATSAPP", whatsappId, mode);
  return sendWhatsAppText(whatsappId, text);
}

/** A passenger's WhatsApp thread with inline confirm/decline buttons — used
 * when a driver has accepted and the passenger must respond. */
export async function notifyPassengerWithConfirmButtons(whatsappId: string, text: string, matchId: string) {
  const mode = resolveOutboundMode();
  if (mode !== "LIVE") return recordSuppressedSend("passenger_confirm_buttons", "WHATSAPP", whatsappId, mode);
  return sendWhatsAppConfirmButtons(whatsappId, text, matchId);
}
