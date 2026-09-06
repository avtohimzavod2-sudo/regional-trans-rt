import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

export interface StopContext {
  key: string;
  nameRu: string;
  nameKy: string;
  nameEn: string;
  aliases: string[];
}

export type MessageHint = "PASSENGER_LIKELY" | "DRIVER_LIKELY" | "UNKNOWN";

const extractionSchema = z.object({
  kind: z.enum(["PASSENGER_REQUEST", "DRIVER_OFFER", "UNRECOGNIZED"]),
  language: z.enum(["RU", "KY", "EN"]),
  originStopKey: z.string().nullable(),
  destinationStopKey: z.string().nullable(),
  travelDate: z.string().nullable().describe("ISO date yyyy-mm-dd, resolved from relative words like 'tomorrow'"),
  timeWindowStart: z.string().nullable().describe("HH:mm 24h, null if not mentioned"),
  timeWindowEnd: z.string().nullable().describe("HH:mm 24h, null if not mentioned"),
  seats: z.number().int().min(1).max(8).nullable(),
  luggage: z.string().nullable(),
  pickupPoint: z.string().nullable(),
  carInfo: z.string().nullable().describe("Driver's car model/plate, only for DRIVER_OFFER"),
  confidence: z.number().min(0).max(1),
});

export type ExtractionResult = z.infer<typeof extractionSchema>;

export interface ExtractedStops {
  origin: StopContext | null;
  destination: StopContext | null;
}

function resolveStop(key: string | null, stops: StopContext[]): StopContext | null {
  if (!key) return null;
  return stops.find((s) => s.key === key) ?? null;
}

/**
 * Parse a free-text WhatsApp/Telegram message (ru/ky/en) into a structured
 * trip request or driver offer draft, constrained to the known corridor stops.
 * Never invents stops outside the provided list, and never extracts phone
 * numbers from the message body (contacts are handled out-of-band).
 */
export async function extractTripMessage(params: {
  text: string;
  stops: StopContext[];
  hint?: MessageHint;
  today: Date;
}): Promise<{ result: ExtractionResult; origin: StopContext | null; destination: StopContext | null }> {
  const { text, stops, hint = "UNKNOWN", today } = params;

  const stopList = stops
    .map((s) => `- key="${s.key}": ${s.nameRu} / ${s.nameKy} / ${s.nameEn} (aliases: ${s.aliases.join(", ") || "-"})`)
    .join("\n");

  const { object } = await generateObject({
    model: anthropic("claude-sonnet-5"),
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

  return {
    result: object,
    origin: resolveStop(object.originStopKey, stops),
    destination: resolveStop(object.destinationStopKey, stops),
  };
}
