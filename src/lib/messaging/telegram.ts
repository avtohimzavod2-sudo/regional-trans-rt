import { Bot, InlineKeyboard } from "grammy";
import { isScenarioContext } from "@/lib/testing/scenario-context";
import { isDryRunRecipient, screenOutboundSend } from "./send-gate";

let botInstance: Bot | null = null;

/** Lazily construct the bot so builds without a token don't crash at import time. */
export function getTelegramBot(): Bot {
  if (!botInstance) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
    botInstance = new Bot(token);
  }
  return botInstance;
}

export function confirmDeclineKeyboard(matchId: string, role: "driver" | "passenger"): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Подтвердить / Ырастоо / Confirm", `${role}:confirm:${matchId}`)
    .text("❌ Отклонить / Баш тартуу / Decline", `${role}:decline:${matchId}`);
}

export async function sendTelegramMessage(chatId: string, text: string, keyboard?: InlineKeyboard) {
  if (screenOutboundSend("Telegram", chatId, text) === "RECORDED_DRY_RUN") return { dryRun: true } as const;
  const bot = getTelegramBot();
  return bot.api.sendMessage(chatId, text, keyboard ? { reply_markup: keyboard } : undefined);
}

export async function sendTelegramDirectMessage(userId: string, text: string): Promise<boolean> {
  // The one send that keeps its own pre-check rather than delegating outright.
  // A scenario with no dry-run sink is suppressed like a blocked chat (false)
  // instead of throwing, because callers of this function already treat false
  // as the honest not-delivered outcome — whereas screenOutboundSend throws,
  // which is right for the other three. Everything past this line is the
  // shared policy: recorded if synthetic and a sink is registered, refused if
  // synthetic outside a scenario.
  if (isScenarioContext() && !isDryRunRecipient(userId)) return false;
  if (screenOutboundSend("Telegram", userId, text) === "RECORDED_DRY_RUN") return true;
  try {
    await getTelegramBot().api.sendMessage(userId, text);
    return true;
  } catch {
    // User has never started a private chat with the bot, or has blocked it.
    return false;
  }
}
