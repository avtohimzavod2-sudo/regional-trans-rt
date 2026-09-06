// Audio ingestion pipeline abstraction: validation -> speech understanding
// -> language detection -> normalized transcript -> Mira understanding.
// Architected now, wired into webhooks later — Telegram/WhatsApp voice
// message *download* isn't implemented in this codebase yet, so nothing
// calls transcribe() in production today. This module exists so that work
// is additive when it lands, not a redesign.
import type { Language } from "@prisma/client";

export interface AudioTranscribeInput {
  audioRef: string; // opaque reference (e.g. Telegram file_id, WhatsApp media id)
  mimeType?: string;
  hintLanguage?: Language | null;
}

export interface AudioTranscriptResult {
  provider: string;
  rawTranscript: string;
  normalizedTranscript: string;
  language: Language;
  languageConfidence: number;
  /** Substrings of rawTranscript the provider was not confident about. Mira
   * should ask only about these, never request a full repeat. */
  uncertainSegments: string[];
  durationSec: number | null;
  confidence: number; // 0..1 overall transcription confidence
}

export interface AudioUnderstandingProvider {
  readonly providerName: string;
  transcribe(input: AudioTranscribeInput): Promise<AudioTranscriptResult>;
}

/** Deterministic, network-free. Used in tests/dev/CI and as the default —
 * always reports low confidence and an empty transcript, so callers built
 * against it are forced to handle the "ask about the uncertain part"
 * path correctly rather than assuming audio always transcribes cleanly. */
export class MockAudioProvider implements AudioUnderstandingProvider {
  readonly providerName = "mock-audio";

  async transcribe(input: AudioTranscribeInput): Promise<AudioTranscriptResult> {
    return {
      provider: this.providerName,
      rawTranscript: "",
      normalizedTranscript: "",
      language: input.hintLanguage ?? "RU",
      languageConfidence: 0,
      uncertainSegments: ["entire message"],
      durationSec: null,
      confidence: 0,
    };
  }
}

/** Production adapter. Gemini's multimodal audio understanding is called
 * lazily — constructing this class never touches env vars or the network;
 * only transcribe() does, so a missing MIRA_GEMINI_API_KEY never crashes
 * the app. Until real audio download is wired into the webhooks, this
 * class exists for architectural completeness and future use. */
export class GeminiAudioProvider implements AudioUnderstandingProvider {
  readonly providerName = "google-gemini-audio";

  async transcribe(_input: AudioTranscribeInput): Promise<AudioTranscriptResult> {
    const key = process.env.MIRA_GEMINI_API_KEY;
    if (!key) {
      throw new Error(
        "MIRA_GEMINI_API_KEY is not set — GeminiAudioProvider cannot make live calls. " +
          "Set MIRA_AUDIO_PROVIDER=mock for a credential-free provider.",
      );
    }
    throw new Error(
      "GeminiAudioProvider.transcribe is not wired to a live audio source yet — " +
        "no Telegram/WhatsApp voice-message download path exists in this codebase. " +
        "This is an intentional architecture stub, not a bug.",
    );
  }
}

export type MiraAudioProviderKind = "google" | "mock";

function configuredAudioProviderKind(): MiraAudioProviderKind {
  const raw = (process.env.MIRA_AUDIO_PROVIDER ?? "mock").toLowerCase();
  return raw === "google" ? "google" : "mock";
}

let cachedAudioProvider: AudioUnderstandingProvider | null = null;
let cachedAudioProviderKind: MiraAudioProviderKind | null = null;

export function getMiraAudioProvider(): AudioUnderstandingProvider {
  const kind = configuredAudioProviderKind();
  if (cachedAudioProvider && cachedAudioProviderKind === kind) return cachedAudioProvider;
  cachedAudioProvider = kind === "mock" ? new MockAudioProvider() : new GeminiAudioProvider();
  cachedAudioProviderKind = kind;
  return cachedAudioProvider;
}

export function _resetMiraAudioProviderCacheForTests() {
  cachedAudioProvider = null;
  cachedAudioProviderKind = null;
}
