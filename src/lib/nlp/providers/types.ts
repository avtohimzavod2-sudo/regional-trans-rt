// TripExtractionProvider — the swappable abstraction behind nlp/extract.ts.
//
// Extraction was the last agent boundary in this codebase still hard-wired to
// a paid model with no deterministic alternative: Mira, Jolchu and Artur all
// have a mock provider that is the default and needs no credentials, and
// extraction did not. That is the reason no end-to-end run could reach a
// TripRequest without calling Anthropic — the demand side of RT's core loop
// was untestable by construction.
//
// Business logic must never import "@ai-sdk/anthropic" directly; only the
// factory in ./index.ts does.
import { z } from "zod";

export interface StopContext {
  key: string;
  nameRu: string;
  nameKy: string;
  nameEn: string;
  aliases: string[];
}

export type MessageHint = "PASSENGER_LIKELY" | "DRIVER_LIKELY" | "UNKNOWN";

export const extractionSchema = z.object({
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

export interface TripExtractionInput {
  text: string;
  stops: StopContext[];
  hint: MessageHint;
  today: Date;
}

export interface TripExtractionProvider {
  readonly providerName: string;
  readonly modelId: string;
  extract(input: TripExtractionInput): Promise<ExtractionResult>;
}
