import { afterEach, describe, expect, it } from "vitest";
import { GoogleGeminiMiraProvider } from "./google-gemini";

afterEach(() => {
  delete process.env.MIRA_GEMINI_API_KEY;
  delete process.env.MIRA_GEMINI_MODEL;
});

describe("GoogleGeminiMiraProvider", () => {
  it("never throws at construction time even without credentials", () => {
    delete process.env.MIRA_GEMINI_API_KEY;
    expect(() => new GoogleGeminiMiraProvider()).not.toThrow();
  });

  it("reports providerName 'google' and defaults modelId to gemini-flash-latest", () => {
    delete process.env.MIRA_GEMINI_MODEL;
    const provider = new GoogleGeminiMiraProvider();
    expect(provider.providerName).toBe("google");
    expect(provider.modelId).toBe("gemini-flash-latest");
  });

  it("reflects MIRA_GEMINI_MODEL when set", () => {
    process.env.MIRA_GEMINI_MODEL = "gemini-2.5-flash";
    const provider = new GoogleGeminiMiraProvider();
    expect(provider.modelId).toBe("gemini-2.5-flash");
  });

  it("understand() throws a clear, credential-specific error when no API key is set", async () => {
    delete process.env.MIRA_GEMINI_API_KEY;
    const provider = new GoogleGeminiMiraProvider();
    await expect(
      provider.understand({
        text: "Бишкектен Ошко 2 орун",
        quickRole: "DRIVER",
        quickIntent: "OFFER_TRIP",
        detectedLanguage: "KY",
        languageConfidence: 0.9,
      }),
    ).rejects.toThrow(/MIRA_GEMINI_API_KEY/);
  });

  it("reply() throws a clear, credential-specific error when no API key is set", async () => {
    delete process.env.MIRA_GEMINI_API_KEY;
    const provider = new GoogleGeminiMiraProvider();
    await expect(
      provider.reply({ language: "RU", situation: "test", userText: "привет" }),
    ).rejects.toThrow(/MIRA_GEMINI_API_KEY/);
  });
});
