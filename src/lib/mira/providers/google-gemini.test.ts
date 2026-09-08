import { afterEach, describe, expect, it } from "vitest";
import { GoogleGeminiMiraProvider, MiraProviderValidationError, validateUnderstandObject } from "./google-gemini";

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

// validateUnderstandObject is a pure, synchronous function — these tests
// call it directly with hand-built schema-shaped objects, no network/model
// call and no vi.mock needed. This is what "reject malformed structured
// output safely" is actually asserting: generateObject's own zod parsing
// only enforces shape, not these cross-field/content invariants.
function validObject() {
  return {
    role: "PASSENGER" as const,
    roleConfidence: 0.8,
    intent: "REQUEST_TRIP",
    intentConfidence: 0.8,
    from: "BISHKEK",
    to: "KARAKOL",
    date: "TOMORROW",
    time: null,
    passengerCount: 2,
    seatsAvailable: null,
    seatsRequired: null,
    phone: null,
    car: null,
    plate: null,
    price: null,
    luggage: null,
    children: null,
    parcel: null,
    pickup: null,
    dropOff: null,
    notes: null,
    uncertainties: [] as string[],
    requiresClarification: false,
    clarificationQuestion: null as string | null,
  };
}

describe("validateUnderstandObject", () => {
  it("accepts a well-formed object", () => {
    expect(() => validateUnderstandObject(validObject())).not.toThrow();
  });

  it("rejects requiresClarification=true with an empty clarificationQuestion", () => {
    const obj = { ...validObject(), requiresClarification: true, clarificationQuestion: null };
    expect(() => validateUnderstandObject(obj)).toThrow(MiraProviderValidationError);
  });

  it("rejects requiresClarification=true with a blank/whitespace clarificationQuestion", () => {
    const obj = { ...validObject(), requiresClarification: true, clarificationQuestion: "   " };
    expect(() => validateUnderstandObject(obj)).toThrow(MiraProviderValidationError);
  });

  it("rejects requiresClarification=false with a non-null clarificationQuestion", () => {
    const obj = { ...validObject(), requiresClarification: false, clarificationQuestion: "Кайда барасыз?" };
    expect(() => validateUnderstandObject(obj)).toThrow(MiraProviderValidationError);
  });

  it("rejects an empty intent string", () => {
    const obj = { ...validObject(), intent: "" };
    expect(() => validateUnderstandObject(obj)).toThrow(MiraProviderValidationError);
  });

  it('rejects an empty string for "from" instead of null', () => {
    const obj = { ...validObject(), from: "" };
    expect(() => validateUnderstandObject(obj)).toThrow(MiraProviderValidationError);
  });

  it("rejects a negative passengerCount", () => {
    const obj = { ...validObject(), passengerCount: -1 };
    expect(() => validateUnderstandObject(obj)).toThrow(MiraProviderValidationError);
  });

  it("rejects a negative price", () => {
    const obj = { ...validObject(), price: -500 };
    expect(() => validateUnderstandObject(obj)).toThrow(MiraProviderValidationError);
  });

  it("collects multiple reasons in a single thrown error", () => {
    const obj = { ...validObject(), intent: "", passengerCount: -1 };
    try {
      validateUnderstandObject(obj);
      throw new Error("expected validateUnderstandObject to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(MiraProviderValidationError);
      expect((err as InstanceType<typeof MiraProviderValidationError>).reasons.length).toBe(2);
    }
  });
});
