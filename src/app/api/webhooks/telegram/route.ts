import { timingSafeEqual } from "node:crypto";
import { webhookCallback } from "grammy";
import { getTelegramBot } from "@/lib/messaging/telegram";
import { handleInboundMessage } from "@/lib/agents/command";
import { handleMiraInbound } from "@/lib/mira/orchestrator";
import { handleDriverResponse } from "@/lib/matching/orchestrate";
import { messages, detectLangFallback } from "@/lib/i18n/messages";
import { db } from "@/lib/db";

let handlersRegistered = false;

function bot() {
  const b = getTelegramBot();
  if (!handlersRegistered) {
    handlersRegistered = true;

    b.command("start", async (ctx) => {
      const lang = detectLangFallback(ctx.message?.text ?? "");
      await ctx.reply(messages.welcomeDriver[lang]);
    });

    b.on("message:text", async (ctx) => {
      if (ctx.chat.type === "private") {
        // Private chats go through Mira so she owns the single outward reply;
        // RT Command's own template send is suppressed (notify:false inside).
        await handleMiraInbound({
          channel: "TELEGRAM_BOT",
          senderId: String(ctx.from.id),
          senderUsername: ctx.from.username ?? null,
          text: ctx.message.text,
          rawMessageId: String(ctx.message.message_id),
        });
        return;
      }

      if (ctx.chat.type === "group" || ctx.chat.type === "supergroup") {
        const group = await db.telegramGroup.findUnique({ where: { chatId: String(ctx.chat.id) } });
        if (!group || !group.isActive) return; // only listen where an admin explicitly connected the group
        await handleInboundMessage({
          channel: "TELEGRAM_GROUP",
          senderId: String(ctx.from.id),
          senderUsername: ctx.from.username ?? null,
          text: ctx.message.text,
          telegramGroupId: group.id,
          chatId: String(ctx.chat.id),
        });
      }
    });

    b.on("callback_query:data", async (ctx) => {
      const [role, action, matchId] = ctx.callbackQuery.data.split(":");
      if (role === "driver" && (action === "confirm" || action === "decline")) {
        await handleDriverResponse(matchId, action === "confirm");
        await ctx.answerCallbackQuery();
        await ctx.editMessageReplyMarkup(undefined);
      } else {
        await ctx.answerCallbackQuery();
      }
    });
  }
  return b;
}

/**
 * Own explicit, timing-safe check ahead of grammy's built-in secretToken
 * option: grammy's compareSecretToken treats an undefined token as "accept
 * all requests" (see compareSecretToken in grammy/out/convenience/webhook.js),
 * which is the opposite of fail-closed. Checking here, before `bot()` is even
 * constructed, means a missing/wrong secret never reaches bot registration,
 * bot.init(), or any Mira/matching/CRM handler.
 */
function isAuthorizedTelegramRequest(req: Request): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return false;
  const header = req.headers.get("x-telegram-bot-api-secret-token");
  if (!header) return false;
  const headerBytes = Buffer.from(header, "utf8");
  const secretBytes = Buffer.from(secret, "utf8");
  if (headerBytes.length !== secretBytes.length) return false;
  return timingSafeEqual(headerBytes, secretBytes);
}

export async function POST(req: Request) {
  if (!isAuthorizedTelegramRequest(req)) {
    return new Response('"unauthorized"', { status: 401 });
  }
  // Bot construction is deferred to request time so a missing
  // TELEGRAM_BOT_TOKEN doesn't break the build. secretToken is also passed
  // to webhookCallback as defense-in-depth, redundant with the check above.
  return webhookCallback(bot(), "std/http", { secretToken: process.env.TELEGRAM_WEBHOOK_SECRET })(req);
}
