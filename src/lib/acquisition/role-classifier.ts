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
  // Contragents #3/#4 (master spec s.7) — distinct from PARCEL_CARGO_POST
  // above, which is someone SENDING a parcel (demand); these two are someone
  // OFFERING to carry (supply), the same demand/supply split DRIVER already
  // has against PASSENGER.
  "DELIVERY_EXECUTOR",
  "CARGO_CARRIER",
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
  /** CARGO_CARRIER-only claims (master spec s.6) — captured as unverified
   * prospect claims, never promoted automatically into Partner Registry
   * facts. Left null for every other role. */
  capacityText: z.string().nullable(),
  temperatureCapability: z.boolean().nullable(),
  backhaulText: z.string().nullable(),
  /** DELIVERY_EXECUTOR-only claim: free-text city/zone coverage. */
  zonesText: z.string().nullable(),
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
      "Roles: PASSENGER (looking for a ride), DRIVER (offering seats), DISPATCHER_INTERMEDIARY (posting on behalf of multiple vehicles/drivers, not traveling themself), PARCEL_CARGO_POST (someone SENDING a parcel/cargo and looking for someone to carry it — demand side), DELIVERY_EXECUTOR (a courier/taxi/light-van offering to CARRY parcels or documents around a city or between nearby towns — supply side), CARGO_CARRIER (a truck/van/fleet operator offering FREIGHT transport capacity — larger loads, intercity/long-haul, possibly with a stated tonnage, refrigeration, or backhaul availability — supply side), BUSINESS_ADVERTISEMENT (a business advertising goods/services with a recurring delivery need, not a single trip or a single parcel), IRRELEVANT_SPAM (unrelated chatter, ads for unrelated products, spam), AMBIGUOUS (you cannot confidently tell).",
      "DELIVERY_EXECUTOR vs CARGO_CARRIER: a courier/car/light van doing local or town-to-town parcel drop-offs is DELIVERY_EXECUTOR even if phrased as a route (e.g. \"Курьер, доставлю документы/посылки по городу\"). A truck/fura/refrigerated vehicle offering real freight capacity, especially with tonnage, pallets, or a return-load (\"обратка\"/backhaul) mention, is CARGO_CARRIER (e.g. \"Фура 20 тонн Бишкек–Ош, есть обратка\"). Never confuse either with DRIVER (a car offering passenger SEATS, e.g. \"Бишкек Каракол 3 места, выезжаю сегодня\") or with PARCEL_CARGO_POST (someone who HAS a parcel and needs it carried, not someone offering to carry).",
      "Worked examples you must classify correctly: \"Бишкек Каракол 3 места, выезжаю сегодня\" -> DRIVER. \"Курьер, доставлю документы/посылки по городу\" -> DELIVERY_EXECUTOR. \"Фура 20 тонн Бишкек–Ош, есть обратка\" -> CARGO_CARRIER. \"Магазину нужна регулярная доставка в регионы\" -> BUSINESS_ADVERTISEMENT. \"Нужно 2 места Бишкек–Каракол\" -> PASSENGER.",
      "Only fill origin/destination/time/seats/vehicle/cargo/business/capacity/temperatureCapability/backhaul/zones fields when the text actually states them — never invent a value that is not present in the text.",
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
