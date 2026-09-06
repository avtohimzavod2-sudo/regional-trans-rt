// GoogleGeminiJolchuProvider — production language-understanding layer for
// Jolchu, backed by Gemini Flash. Mirrors src/lib/mira/providers/google-gemini.ts's
// lazy-credential pattern exactly: construction never throws, only a call
// does. Critically, the schema below has NO fields for coordinates,
// distance, duration, or traffic — the model is structurally prevented from
// answering with invented geography, it can only describe how to search.
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import type { JolchuModelProvider, JolchuUnderstandInput, JolchuUnderstandOutput } from "./model-provider";

const understandSchema = z.object({
  geocodeQuery: z
    .string()
    .describe("Cleaned, geocoder-friendly search text derived only from what the user said — never invent a place."),
  isLandmarkPhrasing: z.boolean(),
  isSettlementOnly: z.boolean(),
  possiblyAmbiguous: z.boolean(),
  notes: z.string().nullable(),
});

function requireApiKey(): string {
  const key = process.env.MIRA_GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "No Gemini credentials configured for Jolchu (MIRA_GEMINI_API_KEY) — GoogleGeminiJolchuProvider cannot make " +
        "live calls. Set JOLCHU_MODEL_PROVIDER=mock for a credential-free provider.",
    );
  }
  return key;
}

function modelId(): string {
  return process.env.JOLCHU_PRIMARY_MODEL ?? "gemini-flash-latest";
}

const SYSTEM_INSTRUCTIONS = [
  "You are the language-understanding layer of Жолчу (Jolchu), Regional Trans RT's internal Route Intelligence",
  "agent. You are NOT a mapping service and you must NEVER invent coordinates, distances, durations, traffic, or",
  "road conditions. Your only job is to read a human description of a place (in Kyrgyz, Russian, English, or a",
  "mix, including Kyrgyz typed without ң/ө/ү) and turn it into a clean search query for a real geocoding provider,",
  "and to flag whether the phrasing describes a landmark/relative location, a settlement with no street, or",
  "something inherently ambiguous (e.g. a name that could refer to a market, a district, and a village at once).",
].join(" ");

export class GoogleGeminiJolchuProvider implements JolchuModelProvider {
  readonly providerName = "google";
  get modelId(): string {
    return modelId();
  }

  private client() {
    return createGoogleGenerativeAI({ apiKey: requireApiKey() });
  }

  async understand(input: JolchuUnderstandInput): Promise<JolchuUnderstandOutput> {
    const google = this.client();
    const { object } = await generateObject({
      model: google(modelId()),
      schema: understandSchema,
      system: [
        SYSTEM_INSTRUCTIONS,
        `Location role: ${input.role}.`,
        input.language ? `Detected language: ${input.language}.` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      prompt: input.text,
    });

    return object;
  }
}
