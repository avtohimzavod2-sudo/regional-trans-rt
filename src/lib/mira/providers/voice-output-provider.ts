// Future voice-output abstraction. No real TTS is wired up yet — this is
// architecture only, per spec. Text must always remain a valid fallback,
// so callers should treat a "not implemented" response as normal, not as
// an error to surface to the user.
import type { Language } from "@prisma/client";

export interface VoiceSynthesisInput {
  text: string;
  language: Language;
  conversationId: string;
}

export interface VoiceSynthesisResult {
  provider: string;
  implemented: boolean;
  audioRef: string | null;
  mimeType: string | null;
  durationSec: number | null;
}

export interface MiraVoiceOutputProvider {
  readonly providerName: string;
  synthesize(input: VoiceSynthesisInput): Promise<VoiceSynthesisResult>;
}

/** The only implementation that exists today. Always reports
 * implemented: false so callers know to fall back to text — never silently
 * drop a reply while "waiting" on audio that will never arrive. */
export class NoopVoiceOutputProvider implements MiraVoiceOutputProvider {
  readonly providerName = "noop-voice";

  async synthesize(_input: VoiceSynthesisInput): Promise<VoiceSynthesisResult> {
    return {
      provider: this.providerName,
      implemented: false,
      audioRef: null,
      mimeType: null,
      durationSec: null,
    };
  }
}

let cachedVoiceProvider: MiraVoiceOutputProvider | null = null;

export function getMiraVoiceOutputProvider(): MiraVoiceOutputProvider {
  if (!cachedVoiceProvider) cachedVoiceProvider = new NoopVoiceOutputProvider();
  return cachedVoiceProvider;
}
