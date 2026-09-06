import { Bot, InlineKeyboard } from "grammy";

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
  const bot = getTelegramBot();
  return bot.api.sendMessage(chatId, text, keyboard ? { reply_markup: keyboard } : undefined);
}

export async function sendTelegramDirectMessage(userId: string, text: string): Promise<boolean> {
  try {
    await getTelegramBot().api.sendMessage(userId, text);
    return true;
  } catch {
    // User has never started a private chat with the bot, or has blocked it.
    return false;
  }
}
