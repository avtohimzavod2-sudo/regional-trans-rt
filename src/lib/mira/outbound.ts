// MIRA-OWNED OUTBOUND BOUNDARY (spec s.11/s.16) — the single point through
// which any agent's private, operational message to a passenger or driver
// leaves the system. Per AGENT_CONSTITUTION.md and MIRA_AGENT_CONTRACT
// (mira/orchestrator.ts), Mira is the sole declared owner of the
// "external_customer_communication" capability. MATCH (matching/orchestrate.ts)
// previously called the raw messaging adapters directly for driver/passenger
// proposal, decline, and contact-reveal notifications — an undeclared bypass
// of that ownership boundary. It now routes through here instead.
//
// Deliberately thin: no duplicated send/DRY_RUN logic. Every export is a
// direct pass-through to the existing provider adapters, so behavior is
// unchanged — only the architectural ownership of the call site moves.
import type { InlineKeyboard } from "grammy";
import { confirmDeclineKeyboard, sendTelegramMessage } from "@/lib/messaging/telegram";
import { sendWhatsAppConfirmButtons, sendWhatsAppText } from "@/lib/messaging/whatsapp";

export { confirmDeclineKeyboard };

/** A driver's own private bot chat — used for Match proposals, decline/try-next
 * notices, and post-confirmation contact reveal. */
export async function notifyDriverPrivately(telegramUserId: string, text: string, keyboard?: InlineKeyboard) {
  return sendTelegramMessage(telegramUserId, text, keyboard);
}

/** A passenger's WhatsApp thread — plain text, used for post-confirmation contact reveal. */
export async function notifyPassengerText(whatsappId: string, text: string) {
  return sendWhatsAppText(whatsappId, text);
}

/** A passenger's WhatsApp thread with inline confirm/decline buttons — used
 * when a driver has accepted and the passenger must respond. */
export async function notifyPassengerWithConfirmButtons(whatsappId: string, text: string, matchId: string) {
  return sendWhatsAppConfirmButtons(whatsappId, text, matchId);
}
