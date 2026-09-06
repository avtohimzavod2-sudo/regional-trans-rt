import { describe, expect, it } from "vitest";
import { NoopVoiceOutputProvider, getMiraVoiceOutputProvider } from "./voice-output-provider";

describe("NoopVoiceOutputProvider", () => {
  it("always reports implemented: false so callers fall back to text", async () => {
    const provider = new NoopVoiceOutputProvider();
    const result = await provider.synthesize({ text: "Салам", language: "KY", conversationId: "conv_1" });
    expect(result.implemented).toBe(false);
    expect(result.audioRef).toBeNull();
  });
});

describe("getMiraVoiceOutputProvider", () => {
  it("returns a singleton noop provider", () => {
    const a = getMiraVoiceOutputProvider();
    const b = getMiraVoiceOutputProvider();
    expect(a).toBe(b);
    expect(a.providerName).toBe("noop-voice");
  });
});
