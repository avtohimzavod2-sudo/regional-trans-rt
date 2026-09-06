import { webhookCallback } from "grammy";
import { getTelegramBot } from "@/lib/messaging/telegram";
import { ingestAllowedGroupMessage, ingestDriverPrivateMessage } from "@/lib/ingest";
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
        await ingestDriverPrivateMessage(String(ctx.from.id), ctx.from.username ?? null, ctx.message.text);
        return;
      }

      if (ctx.chat.type === "group" || ctx.chat.type === "supergroup") {
        const group = await db.telegramGroup.findUnique({ where: { chatId: String(ctx.chat.id) } });
        if (!group || !group.isActive) return; // only listen where an admin explicitly connected the group
        await ingestAllowedGroupMessage({
          telegramGroupId: group.id,
          chatId: String(ctx.chat.id),
          senderId: String(ctx.from.id),
          senderUsername: ctx.from.username ?? null,
          text: ctx.message.text,
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

export async function POST(req: Request) {
  // Bot construction is deferred to request time so a missing
  // TELEGRAM_BOT_TOKEN doesn't break the build.
  return webhookCallback(bot(), "std/http")(req);
}
