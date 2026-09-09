// Shared Kyrgyz-market-language intelligence (master spec s.6) for all three
// Market Acquisition Contractors. Mirrors src/lib/nlp/extract.ts's
// generateObject pattern exactly (same model, same "never invent a value
// that isn't in the text" discipline, same "never extract a phone number"
// rule) rather than a second, competing NLU implementation — this module
// only differs in WHAT it classifies (source-text role, not a structured
// trip request) and its role vocabulary is a superset RT Command's
// PASSENGER_REQUEST/DRIVER_OFFER/UNRECOGNIZED never needed.
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

export const MARKET_ROLE_VALUES = [
  "PASSENGER",
  "DRIVER",
  "DISPATCHER_INTERMEDIARY",
  "PARCEL_CARGO_POST",
  "BUSINESS_ADVERTISEMENT",
  "IRRELEVANT_SPAM",
  "AMBIGUOUS",
] as const;
export type MarketRole = (typeof MARKET_ROLE_VALUES)[number];

const marketRoleSchema = z.object({
  role: z.enum(MARKET_ROLE_VALUES),
  language: z.enum(["RU", "KY", "EN"]),
  confidence: z.number().min(0).max(1),
  originText: z.string().nullable(),
  destinationText: z.string().nullable(),
  departureTimeText: z.string().nullable(),
  passengerCount: z.number().int().min(1).max(50).nullable(),
  seatsAvailable: z.number().int().min(1).max(50).nullable(),
  vehicleText: z.string().nullable(),
  cargoDescription: z.string().nullable(),
  businessCategoryGuess: z.string().nullable(),
});

export type MarketRoleClassification = z.infer<typeof marketRoleSchema>;

// Below this, a contractor must treat the source text as AMBIGUOUS rather
// than act on it (master spec s.6: "if confidence is insufficient" — the
// fragment cut off before specifying the exact behavior, so this is the
// conservative reading: never act, never invent).
export const MIN_ACTIONABLE_CONFIDENCE = 0.55;

/** Classifies one raw sighting/announcement text against RT's real
 * Kyrgyzstan market language — literary Kyrgyz, Kyrgyz written without
 * special letters, colloquial Kyrgyz, spelling mistakes, abbreviations,
 * Russian, mixed Kyrgyz-Russian, route/local-place variants, driver/
 * passenger slang, business advertisement language. Never extracts a phone
 * number (contacts stay out-of-band, same rule as extractTripMessage). */
export async function classifyMarketRole(text: string): Promise<MarketRoleClassification> {
  const { object } = await generateObject({
    model: anthropic("claude-sonnet-5"),
    schema: marketRoleSchema,
    system: [
      "You classify short real-world Kyrgyzstan intercity-transport/delivery market messages by ROLE.",
      "Messages may be written in: literary Kyrgyz; Kyrgyz written WITHOUT special Kyrgyz letters (ө/ү/ң replaced with o/u/n); colloquial Kyrgyz; Kyrgyz with spelling mistakes/abbreviations; Russian; or mixed Kyrgyz-Russian in the same sentence.",
      "Infer intent from meaning, not fixed phrases. Example forms you must handle (not an exhaustive or literal list): \"ошко кетем 2 орун бар\" (driver, 2 free seats), \"каракол бишкек эрте\" (route + time, ambiguous role without more context), \"место бар\" (driver, seat available), \"вечером чыгам\" (departing this evening), \"попутчик керек\" (passenger, looking for a ride).",
      "Roles: PASSENGER (looking for a ride), DRIVER (offering seats), DISPATCHER_INTERMEDIARY (posting on behalf of multiple vehicles/drivers, not traveling themself), PARCEL_CARGO_POST (sending/carrying a parcel or cargo, not a person), BUSINESS_ADVERTISEMENT (a business advertising goods/services with a delivery need, not a trip), IRRELEVANT_SPAM (unrelated chatter, ads for unrelated products, spam), AMBIGUOUS (you cannot confidently tell).",
      "Only fill origin/destination/time/seats/vehicle/cargo/business fields when the text actually states them — never invent a value that is not present in the text.",
      "Never output a phone number in any field — contact numbers are handled separately and must not appear in your output.",
      "confidence must honestly reflect how sure you are; when genuinely unclear, prefer role=AMBIGUOUS with a low confidence over guessing a specific role.",
    ].join("\n"),
    prompt: text,
  });

  return object;
}

/** A contractor may only act on a classification that clears the confidence
 * floor AND isn't spam/ambiguous — every contractor's prospect-creation path
 * must call this before writing anything (see boundary.test.ts per agent). */
export function isActionableClassification(classification: MarketRoleClassification): boolean {
  return (
    classification.confidence >= MIN_ACTIONABLE_CONFIDENCE &&
    classification.role !== "IRRELEVANT_SPAM" &&
    classification.role !== "AMBIGUOUS"
  );
}
