// Thin wrappers over RT's existing messaging senders (src/lib/messaging/
// telegram.ts, whatsapp.ts) — never a second send implementation. A channel
// with no adapter here (e.g. TELEGRAM_GROUP) is intentionally unsupported:
// group posting is out of scope for direct-to-prospect outreach and would
// cross the "preserve existing Telegram/group consent boundaries" rule
// (master spec s.5).
import type { Channel } from "@prisma/client";
import { sendTelegramDirectMessage } from "@/lib/messaging/telegram";
import { sendWhatsAppText } from "@/lib/messaging/whatsapp";
import type { OutreachAdapter } from "./types";

export const telegramOutreachAdapter: OutreachAdapter = {
  channel: "TELEGRAM_BOT",
  isConfigured: () => !!process.env.TELEGRAM_BOT_TOKEN,
  async send(to, text) {
    const delivered = await sendTelegramDirectMessage(to, text);
    return { delivered };
  },
};

export const whatsappOutreachAdapter: OutreachAdapter = {
  channel: "WHATSAPP",
  isConfigured: () => !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN),
  async send(to, text) {
    await sendWhatsAppText(to, text);
    return { delivered: true };
  },
};

const ADAPTERS_BY_CHANNEL: Partial<Record<Channel, OutreachAdapter>> = {
  TELEGRAM_BOT: telegramOutreachAdapter,
  WHATSAPP: whatsappOutreachAdapter,
};

export function adapterForChannel(channel: Channel): OutreachAdapter | null {
  return ADAPTERS_BY_CHANNEL[channel] ?? null;
}
