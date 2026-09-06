import { afterEach, describe, expect, it } from "vitest";
import {
  GeminiAudioProvider,
  MockAudioProvider,
  _resetMiraAudioProviderCacheForTests,
  getMiraAudioProvider,
} from "./audio-provider";

afterEach(() => {
  _resetMiraAudioProviderCacheForTests();
  delete process.env.MIRA_AUDIO_PROVIDER;
  delete process.env.MIRA_GEMINI_API_KEY;
});

describe("MockAudioProvider", () => {
  it("returns a low-confidence, empty-transcript result and never throws", async () => {
    const provider = new MockAudioProvider();
    const result = await provider.transcribe({ audioRef: "file_123" });
    expect(result.confidence).toBe(0);
    expect(result.rawTranscript).toBe("");
    expect(result.uncertainSegments.length).toBeGreaterThan(0);
    expect(result.provider).toBe("mock-audio");
  });

  it("falls back to RU when no hint language is given", async () => {
    const provider = new MockAudioProvider();
    const result = await provider.transcribe({ audioRef: "file_123" });
    expect(result.language).toBe("RU");
  });

  it("honors a hint language", async () => {
    const provider = new MockAudioProvider();
    const result = await provider.transcribe({ audioRef: "file_123", hintLanguage: "KY" });
    expect(result.language).toBe("KY");
  });
});

describe("GeminiAudioProvider", () => {
  it("throws a clear, credential-specific error when no API key is set", async () => {
    delete process.env.MIRA_GEMINI_API_KEY;
    const provider = new GeminiAudioProvider();
    await expect(provider.transcribe({ audioRef: "file_123" })).rejects.toThrow(/MIRA_GEMINI_API_KEY/);
  });

  it("never throws at construction time even without credentials", () => {
    delete process.env.MIRA_GEMINI_API_KEY;
    expect(() => new GeminiAudioProvider()).not.toThrow();
  });
});

describe("getMiraAudioProvider", () => {
  it("defaults to the mock provider", () => {
    delete process.env.MIRA_AUDIO_PROVIDER;
    _resetMiraAudioProviderCacheForTests();
    expect(getMiraAudioProvider().providerName).toBe("mock-audio");
  });

  it("selects the google provider when configured", () => {
    process.env.MIRA_AUDIO_PROVIDER = "google";
    _resetMiraAudioProviderCacheForTests();
    expect(getMiraAudioProvider().providerName).toBe("google-gemini-audio");
  });
});
