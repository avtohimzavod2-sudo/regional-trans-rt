// Mira Session — the durable conversation state RT Command itself does not
// keep (Command only ever sees one message at a time). Backed by
// MiraConversation/MiraMessage. All functions here do real I/O; keep
// business/decision logic in envelope.ts and reply-templates.ts instead.
import { db } from "@/lib/db";
import type { Channel, Language, MiraRole, MiraSenderType, Prisma } from "@prisma/client";
import type { MiraNormalizedFields } from "./types";

const ACTIVE_STATUSES = ["ACTIVE", "AWAITING_USER"] as const;

/** Finds the most recent still-open conversation for this contact on this
 * channel, or starts a new one. One conversation per (channel, external id)
 * is kept open at a time — completed/abandoned conversations are left
 * alone so history isn't mutated. */
export async function getOrCreateActiveConversation(channel: Channel, externalUserId: string) {
  const existing = await db.miraConversation.findFirst({
    where: { channel, externalUserId, status: { in: [...ACTIVE_STATUSES] } },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing;

  return db.miraConversation.create({
    data: { channel, externalUserId, status: "ACTIVE" },
  });
}

export async function appendUserMessage(
  conversationId: string,
  params: {
    rawText: string;
    audioRef?: string | null;
    transcript?: string | null;
    normalizedText?: string | null;
    detectedLanguage?: Language | null;
    languageConfidence?: number | null;
    role?: MiraRole | null;
    intent?: string | null;
    entities?: MiraNormalizedFields | null;
    uncertainties?: string[];
    requiresClarification?: boolean;
    traceId?: string | null;
  },
) {
  return db.miraMessage.create({
    data: {
      conversationId,
      sender: "USER" as MiraSenderType,
      rawText: params.rawText,
      audioRef: params.audioRef,
      transcript: params.transcript,
      normalizedText: params.normalizedText,
      detectedLanguage: params.detectedLanguage,
      languageConfidence: params.languageConfidence,
      role: params.role,
      intent: params.intent,
      entities: (params.entities as Prisma.InputJsonValue | undefined) ?? undefined,
      uncertainties: params.uncertainties ?? [],
      requiresClarification: params.requiresClarification ?? false,
      traceId: params.traceId,
    },
  });
}

export async function appendMiraMessage(conversationId: string, text: string, traceId?: string | null) {
  return db.miraMessage.create({
    data: { conversationId, sender: "MIRA" as MiraSenderType, rawText: text, traceId },
  });
}

export async function updateConversationState(
  conversationId: string,
  params: {
    role?: MiraRole;
    detectedLanguage?: Language;
    status?: "ACTIVE" | "AWAITING_USER" | "COMPLETED" | "ABANDONED" | "ESCALATED";
    activeIntent?: string | null;
    collectedFields?: MiraNormalizedFields;
    missingFields?: string[];
    lastAgentDecision?: string | null;
    lastTraceId?: string | null;
  },
) {
  return db.miraConversation.update({
    where: { id: conversationId },
    data: {
      role: params.role,
      detectedLanguage: params.detectedLanguage,
      status: params.status,
      activeIntent: params.activeIntent,
      collectedFields: (params.collectedFields as Prisma.InputJsonValue | undefined) ?? undefined,
      missingFields: params.missingFields,
      lastAgentDecision: params.lastAgentDecision,
      lastTraceId: params.lastTraceId,
    },
  });
}

/** Last few turns of a conversation, formatted as a compact transcript for
 * provider context. Never includes raw phone numbers beyond what the user
 * already sent in-band — this is conversation memory, not a data export. */
export async function recentTranscript(conversationId: string, limit = 6): Promise<string> {
  const msgs = await db.miraMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return msgs
    .reverse()
    .map((m) => `${m.sender === "USER" ? "User" : "Mira"}: ${m.rawText ?? m.transcript ?? ""}`)
    .join("\n");
}
