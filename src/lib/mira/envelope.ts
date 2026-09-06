// Builds the strict MiraInboundEnvelope contract (AGENTS.md section 21) from
// the fast-layer + provider outputs. Pure — takes already-computed detection
// and understanding results and assembles the envelope; does no I/O itself.
import type { MiraChannel, MiraInboundEnvelope, MiraNormalizedFields, MiraRoleValue } from "./types";
import type { LanguageDetectionResult } from "./language/detect";
import type { MiraUnderstandOutput } from "./providers/model-provider";

export function buildInboundEnvelope(params: {
  channel: MiraChannel;
  messageId?: string;
  conversationId: string;
  externalUserId: string;
  username?: string | null;
  rawText: string;
  audioRef?: string | null;
  transcript?: string | null;
  detection: LanguageDetectionResult;
  understanding: MiraUnderstandOutput;
  traceId?: string;
}): MiraInboundEnvelope {
  const entities: MiraNormalizedFields = params.understanding.entities;

  return {
    channel: params.channel,
    messageId: params.messageId,
    conversationId: params.conversationId,
    actor: { externalUserId: params.externalUserId, username: params.username ?? null },
    rawText: params.rawText,
    audioRef: params.audioRef ?? null,
    transcript: params.transcript ?? null,
    language: params.detection.language,
    languageConfidence: params.detection.confidence,
    role: params.understanding.role as MiraRoleValue,
    roleConfidence: params.understanding.roleConfidence,
    intent: params.understanding.intent,
    intentConfidence: params.understanding.intentConfidence,
    entities,
    normalizedRequest: entities,
    uncertainties: params.understanding.uncertainties,
    requiresClarification: params.understanding.requiresClarification,
    traceId: params.traceId,
  };
}
