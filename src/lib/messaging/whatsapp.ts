import { createHmac, timingSafeEqual } from "node:crypto";

const GRAPH_VERSION = "v21.0";

function apiUrl(path: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) throw new Error("WHATSAPP_PHONE_NUMBER_ID is not set");
  return `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/${path}`;
}

function authHeaders() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN is not set");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function sendWhatsAppText(to: string, body: string) {
  const res = await fetch(apiUrl("messages"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });
  if (!res.ok) {
    throw new Error(`WhatsApp send failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function sendWhatsAppConfirmButtons(to: string, body: string, matchId: string) {
  const res = await fetch(apiUrl("messages"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: [
            { type: "reply", reply: { id: `passenger:confirm:${matchId}`, title: "Подтвердить" } },
            { type: "reply", reply: { id: `passenger:decline:${matchId}`, title: "Отклонить" } },
          ],
        },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`WhatsApp interactive send failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export function verifyWhatsAppWebhook(mode: string | null, token: string | null, challenge: string | null) {
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && token && expected && token === expected) {
    return challenge;
  }
  return null;
}

/**
 * Verifies Meta's X-Hub-Signature-256 header against the exact raw request
 * body using WHATSAPP_APP_SECRET. Fails closed: an unconfigured secret
 * rejects every request rather than accepting unsigned deliveries. Uses
 * timingSafeEqual so a wrong signature cannot be brute-forced byte-by-byte
 * via response-time differences.
 */
export function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !signatureHeader) return false;

  const [scheme, providedHex] = signatureHeader.split("=");
  if (scheme !== "sha256" || !providedHex || !/^[0-9a-f]{64}$/i.test(providedHex)) return false;

  const expectedHex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return timingSafeEqual(Buffer.from(expectedHex, "hex"), Buffer.from(providedHex, "hex"));
}

export interface WhatsAppInboundText {
  from: string;
  text: string;
  messageId: string;
}

export interface WhatsAppInboundButtonReply {
  from: string;
  buttonId: string;
  messageId: string;
}

export function parseWhatsAppWebhookPayload(payload: unknown): {
  texts: WhatsAppInboundText[];
  buttonReplies: WhatsAppInboundButtonReply[];
} {
  const texts: WhatsAppInboundText[] = [];
  const buttonReplies: WhatsAppInboundButtonReply[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries = (payload as any)?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const messages = change.value?.messages ?? [];
      for (const msg of messages) {
        if (msg.type === "text" && msg.text?.body) {
          texts.push({ from: msg.from, text: msg.text.body, messageId: msg.id });
        } else if (msg.type === "interactive" && msg.interactive?.button_reply) {
          buttonReplies.push({
            from: msg.from,
            buttonId: msg.interactive.button_reply.id,
            messageId: msg.id,
          });
        }
      }
    }
  }
  return { texts, buttonReplies };
}
