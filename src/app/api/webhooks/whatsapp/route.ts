import { NextRequest, NextResponse } from "next/server";
import { parseWhatsAppWebhookPayload, verifyWhatsAppWebhook } from "@/lib/messaging/whatsapp";
import { handleInboundMessage } from "@/lib/agents/command";
import { handlePassengerResponse } from "@/lib/matching/orchestrate";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const challenge = verifyWhatsAppWebhook(
    searchParams.get("hub.mode"),
    searchParams.get("hub.verify_token"),
    searchParams.get("hub.challenge"),
  );
  if (challenge) return new NextResponse(challenge, { status: 200 });
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const payload = await req.json();
  const { texts, buttonReplies } = parseWhatsAppWebhookPayload(payload);

  for (const msg of texts) {
    await handleInboundMessage({ channel: "WHATSAPP", senderId: msg.from, text: msg.text, rawMessageId: msg.messageId });
  }

  for (const reply of buttonReplies) {
    const [role, action, matchId] = reply.buttonId.split(":");
    if (role === "passenger" && (action === "confirm" || action === "decline")) {
      await handlePassengerResponse(matchId, action === "confirm");
    }
  }

  return NextResponse.json({ ok: true });
}
