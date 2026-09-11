import { Bot, InlineKeyboard } from "grammy";
import { isScenarioContext, ScenarioSuppressedSendError } from "@/lib/testing/scenario-context";

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
  if (isScenarioContext()) throw new ScenarioSuppressedSendError("Telegram");
  const bot = getTelegramBot();
  return bot.api.sendMessage(chatId, text, keyboard ? { reply_markup: keyboard } : undefined);
}

export async function sendTelegramDirectMessage(userId: string, text: string): Promise<boolean> {
  // Suppressed like a blocked chat (false), not a thrown error: unlike
  // sendTelegramMessage, callers of this function already treat "false" as
  // the honest not-delivered outcome, so no exception is needed here.
  if (isScenarioContext()) return false;
  try {
    await getTelegramBot().api.sendMessage(userId, text);
    return true;
  } catch {
    // User has never started a private chat with the bot, or has blocked it.
    return false;
  }
}
