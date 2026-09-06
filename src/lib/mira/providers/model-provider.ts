// MiraModelProvider — the swappable abstraction the rest of Mira talks to
// instead of any concrete AI SDK. Primary implementation is Gemini Flash
// (google-gemini.ts); MockMiraProvider (mock.ts) is deterministic and used
// in tests/dev/CI so nothing in this codebase requires a real API key to
// run. Business logic must never import "@ai-sdk/google" directly — only
// this file's factory does.
import type { Language } from "@prisma/client";
import type { MiraNormalizedFields, MiraRoleValue } from "../types";
import { MockMiraProvider } from "./mock";
import { GoogleGeminiMiraProvider } from "./google-gemini";

export interface MiraUnderstandInput {
  text: string;
  quickRole: string;
  quickIntent: string;
  detectedLanguage: Language;
  languageConfidence: number;
  conversationContext?: string;
}

export interface MiraUnderstandOutput {
  role: MiraRoleValue;
  roleConfidence: number;
  intent: string;
  intentConfidence: number;
  entities: MiraNormalizedFields;
  uncertainties: string[];
  requiresClarification: boolean;
  clarificationQuestion: string | null;
}

export interface MiraReplyInput {
  language: Language;
  situation: string;
  userText: string;
  conversationContext?: string;
  toneGuidance?: string;
}

export interface MiraReplyOutput {
  text: string;
}

export interface MiraModelProvider {
  readonly providerName: string;
  readonly modelId: string;
  understand(input: MiraUnderstandInput): Promise<MiraUnderstandOutput>;
  reply(input: MiraReplyInput): Promise<MiraReplyOutput>;
}

export type MiraProviderKind = "google" | "mock";

export interface MiraProviderStatus {
  configuredProvider: MiraProviderKind;
  modelId: string;
  ready: boolean;
  reason: string | null;
}

function configuredProviderKind(): MiraProviderKind {
  const raw = (process.env.MIRA_AI_PROVIDER ?? "mock").toLowerCase();
  return raw === "google" ? "google" : "mock";
}

/** Never throws, never makes a network call — safe to read from the
 * dispatcher UI (Mira Center -> Provider Status) at any time. */
export function getMiraProviderStatus(): MiraProviderStatus {
  const kind = configuredProviderKind();
  const modelId = process.env.MIRA_GEMINI_MODEL ?? "gemini-flash-latest";

  if (kind === "mock") {
    return { configuredProvider: "mock", modelId: "mock-deterministic", ready: true, reason: null };
  }

  const hasKey = Boolean(process.env.MIRA_GEMINI_API_KEY);
  return {
    configuredProvider: "google",
    modelId,
    ready: hasKey,
    reason: hasKey ? null : "MIRA_GEMINI_API_KEY is not set",
  };
}

let cachedProvider: MiraModelProvider | null = null;
let cachedProviderKind: MiraProviderKind | null = null;

/** Lazily constructs and caches the configured provider. Construction itself
 * never throws — both provider classes defer touching env vars/credentials
 * until a method is actually called (matching this repo's
 * getTelegramBot()/whatsapp.ts lazy-env-var convention), so a build/dev
 * server without Gemini credentials never crashes. */
export function getMiraModelProvider(): MiraModelProvider {
  const kind = configuredProviderKind();
  if (cachedProvider && cachedProviderKind === kind) return cachedProvider;

  cachedProvider = kind === "mock" ? new MockMiraProvider() : new GoogleGeminiMiraProvider();
  cachedProviderKind = kind;
  return cachedProvider;
}

/** Test-only escape hatch to reset the cached singleton between provider-kind changes. */
export function _resetMiraModelProviderCacheForTests() {
  cachedProvider = null;
  cachedProviderKind = null;
}
