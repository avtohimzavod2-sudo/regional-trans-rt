// The paid extraction provider. Byte-for-byte the prompt that was inline in
// nlp/extract.ts before the provider split — moved, not rewritten, so the
// refactor cannot quietly change what a real model is asked.
//
// Selected only by RT_NLP_PROVIDER=anthropic. Reads its credential lazily, at
// call time, matching the getTelegramBot()/whatsapp.ts convention: constructing
// the provider on a machine with no ANTHROPIC_API_KEY must not crash a build or
// a dev server.
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { extractionSchema, type ExtractionResult, type TripExtractionInput, type TripExtractionProvider } from "./types";

export const ANTHROPIC_EXTRACTION_MODEL = "claude-sonnet-5";

export class AnthropicTripExtractionProvider implements TripExtractionProvider {
  readonly providerName = "anthropic";
  readonly modelId = ANTHROPIC_EXTRACTION_MODEL;

  async extract({ text, stops, hint, today }: TripExtractionInput): Promise<ExtractionResult> {
    const stopList = stops
      .map((s) => `- key="${s.key}": ${s.nameRu} / ${s.nameKy} / ${s.nameEn} (aliases: ${s.aliases.join(", ") || "-"})`)
      .join("\n");

    const { object } = await generateObject({
      model: anthropic(this.modelId),
      schema: extractionSchema,
      system: [
        "You extract structured intercity ride-share data from short messages written in Russian, Kyrgyz, or English.",
        "The corridor has exactly these stops (use ONLY these keys, never invent a new stop key):",
        stopList,
        `Today's date is ${today.toISOString().slice(0, 10)}. Resolve relative dates like "завтра"/"эртең"/"tomorrow" against it.`,
        "If the message is a passenger looking for a ride, kind=PASSENGER_REQUEST.",
        "If the message is a driver offering seats, kind=DRIVER_OFFER.",
        "If it's unrelated chatter, spam, or you cannot confidently identify origin+destination, kind=UNRECOGNIZED.",
        "Never output a phone number field — contact numbers are handled separately and must not appear in your output.",
        hint === "PASSENGER_LIKELY" ? "Context hint: this message most likely comes from a passenger." : "",
        hint === "DRIVER_LIKELY" ? "Context hint: this message most likely comes from a driver." : "",
      ]
        .filter(Boolean)
        .join("\n"),
      prompt: text,
    });

    return object;
  }
}
