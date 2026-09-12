// The deterministic extraction provider — default, and the reason an
// end-to-end run of RT's core loop is possible without a paid API call.
//
// Not a stub that returns a canned object. It genuinely parses the same three
// languages against the same corridor stop list the model gets, using this
// repo's established dictionary/regex idiom (src/lib/agents/quick-classify.ts,
// src/lib/prospecting/role-classifier.ts). What it gives up against a model is
// tolerance of unusual phrasing — so it says UNRECOGNIZED far more readily,
// which is the correct direction to fail: an unparsed message becomes a
// clarification request, never an invented trip.
//
// Everything it cannot establish is null, never guessed. In particular it
// never infers a travel date from silence: a request with no date is
// incomplete demand, and defaulting it to today would put a passenger in a car
// they did not ask to be in.
import { quickClassifyMessage } from "@/lib/agents/quick-classify";
import type {
  ExtractionResult,
  MessageHint,
  StopContext,
  TripExtractionInput,
  TripExtractionProvider,
} from "./types";

/** Same folding as quick-classify.ts: informal Kyrgyz typed without ө/ү/ң must
 * match the same dictionary as the literary spelling. Punctuation becomes
 * whitespace, which is right for word matching and wrong for dates — see
 * `soften` below. */
function normalize(text: string): string {
  return soften(text)
    .replace(/[.,!?;:()"'«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The same folding without the punctuation strip. `05.10` and `08:30` are
 * dates and times whose separators carry the meaning: normalize() turns them
 * into `05 10` and `08 30`, so anything reading a written date or clock time
 * has to read this instead. */
function soften(text: string): string {
  return text
    .toLowerCase()
    .replace(/ө/g, "о")
    .replace(/ү/g, "у")
    .replace(/ң/g, "н")
    .replace(/\s+/g, " ")
    .trim();
}

/** JS `\b` is defined on [A-Za-z0-9_], so there is no word boundary next to a
 * Cyrillic letter: `/\bзавтра\b/` is a pattern that can never fire, silently.
 * Every word-anchored match in this file goes through here instead, where the
 * boundaries are Unicode letter/number lookarounds. */
function wordRe(alternation: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternation})(?![\\p{L}\\p{N}])`, "u");
}

const KY_MARKERS = wordRe("эртен|эртенки|бугун|бурсугуни|орун|орундук|керек|бар|барам|жол|саат|киши|унаа|жолоочу");

function detectLanguage(text: string): ExtractionResult["language"] {
  const t = normalize(text);
  // Kyrgyz first: it is written in Cyrillic too, so a Russian check that only
  // looked for Cyrillic would swallow every Kyrgyz message.
  if (KY_MARKERS.test(t)) return "KY";
  if (/[а-яё]/.test(t)) return "RU";
  return "EN";
}

interface StopHit {
  stop: StopContext;
  at: number;
}

/** Finds each stop's earliest mention. Longest-label-first so a stop whose
 * name contains another stop's name ("Cholpon-Ata" vs "Ata") is not stolen by
 * the shorter one. */
function findStops(text: string, stops: StopContext[]): StopHit[] {
  const haystack = normalize(text);
  const hits: StopHit[] = [];

  for (const stop of stops) {
    // The bare key is included because the composite "<corridor>:<stop>" key
    // ingest.ts builds is not something a passenger would ever type, but the
    // stop's own key ("karakol") frequently is.
    const bareKey = stop.key.slice(stop.key.indexOf(":") + 1).replace(/-/g, " ");
    const labels = [stop.nameRu, stop.nameKy, stop.nameEn, bareKey, ...stop.aliases]
      .map(normalize)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    let earliest = -1;
    for (const label of labels) {
      const at = haystack.indexOf(label);
      if (at !== -1 && (earliest === -1 || at < earliest)) earliest = at;
    }
    if (earliest !== -1) hits.push({ stop, at: earliest });
  }

  return hits.sort((a, b) => a.at - b.at);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Relative words resolve against `today`; absolute forms are taken as written.
 * Returns null when the message names no date at all. */
function findTravelDate(text: string, today: Date): string | null {
  // soften(), not normalize(): the separators in `05.10` are the date.
  const t = soften(text);

  const explicitIso = t.match(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/);
  if (explicitIso) return `${explicitIso[1]}-${explicitIso[2]}-${explicitIso[3]}`;

  // dd.mm or dd.mm.yyyy — the everyday written form in all three languages.
  const dotted = t.match(/(?<!\d)(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?!\d)/);
  if (dotted) {
    const day = Number(dotted[1]);
    const month = Number(dotted[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const rawYear = dotted[3] ? Number(dotted[3]) : today.getUTCFullYear();
      const year = rawYear < 100 ? 2000 + rawYear : rawYear;
      return `${year}-${pad(month)}-${pad(day)}`;
    }
  }

  // Longest relative word first: "послезавтра" contains "завтра".
  if (wordRe("послезавтра|бурсугуни|day after tomorrow").test(t)) return isoDate(addDays(today, 2));
  if (wordRe("завтра|эртен|эртенки|tomorrow").test(t)) return isoDate(addDays(today, 1));
  if (wordRe("сегодня|бугун|today").test(t)) return isoDate(today);

  return null;
}

function findSeats(text: string): number | null {
  const t = normalize(text);

  // A number attached to a seat word, in either order: "2 места", "мест 2",
  // "eki orun" is out of scope (spelled-out numerals are exactly the kind of
  // phrasing this provider declines to guess at).
  const seatWord = "(?:мест[оа]?|мест|орундук|орун|seats?|pax|человека?|киши)";
  const after = t.match(new RegExp(`(?<!\\d)(\\d)\\s*${seatWord}`, "u"));
  if (after) return clampSeats(Number(after[1]));
  const before = t.match(new RegExp(`${seatWord}\\s*(\\d)(?!\\d)`, "u"));
  if (before) return clampSeats(Number(before[1]));

  // A lone person travelling usually says so rather than writing "1".
  if (wordRe("один|одна|жалгыз|alone|solo").test(t)) return 1;

  return null;
}

function clampSeats(n: number): number | null {
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : null;
}

/** "в 8:30", "saat 8de", "at 08:00", "8 утра". Bare hours are accepted only
 * with a time preposition, so "2 места" cannot become 02:00. */
function findTimeWindowStart(text: string): string | null {
  // soften(), not normalize(): the colon in `08:30` is the time.
  const t = soften(text);

  const hhmm = t.match(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/);
  if (hhmm) return `${pad(Number(hhmm[1]))}:${hhmm[2]}`;

  const bare = t.match(
    /(?<![\p{L}\p{N}])(?:в|саат|at)\s*([01]?\d|2[0-3])(?![\p{N}:])(?!\s*(?:мест|орун|seat|киши|pax))/u,
  );
  if (bare) return `${pad(Number(bare[1]))}:00`;

  return null;
}

/** Only when the message says so. Never inferred from a bag emoji or from the
 * absence of a mention. */
function findLuggage(text: string): string | null {
  const t = normalize(text);
  const m = t.match(wordRe("багаж\\p{L}*|чемодан\\p{L}*|сумк\\p{L}*|жук|luggage|suitcases?|bags?"));
  return m ? m[0] : null;
}

function findCarInfo(text: string): string | null {
  // Kyrgyz plates: two digits, KG, three digits, three letters — and common
  // informal spacings of the same.
  const plate = text.match(/\b\d{2}\s?[A-ZА-Я]{2}\s?\d{3}\s?[A-ZА-Я]{3}\b/i);
  return plate ? plate[0].trim() : null;
}

// quick-classify.ts is RT Command's pre-LLM triage layer and its dictionary is
// ru/ky only — English never had to be deterministic there, because anything it
// could not read fell through to the model. It is that fallback this provider
// replaces, so the English half lives here rather than being bolted onto a
// shared classifier whose callers did not ask for it.
const EN_PASSENGER = [
  "looking for a ride", "looking for a car", "need a ride", "need a car",
  "need a seat", "need seats", "any seats", "ride from", "get a ride",
  "book a seat", "book seats",
];
const EN_DRIVER = [
  "i am driving", "i'm driving", "im driving", "driving to", "driving from",
  "seats available", "free seats", "have seats", "taking passengers",
  "offering a ride", "spare seats",
];

function decideKind(text: string, hint: MessageHint): ExtractionResult["kind"] {
  const quick = quickClassifyMessage(text);
  if (quick.intent === "trip_offer" || quick.role === "driver") return "DRIVER_OFFER";
  if (quick.intent === "trip_request" || quick.role === "passenger") return "PASSENGER_REQUEST";

  const lowered = soften(text);
  const driverHits = EN_DRIVER.filter((p) => lowered.includes(p)).length;
  const passengerHits = EN_PASSENGER.filter((p) => lowered.includes(p)).length;
  if (driverHits > passengerHits) return "DRIVER_OFFER";
  if (passengerHits > driverHits) return "PASSENGER_REQUEST";

  // The hint is the caller's channel knowledge (a private driver-bot chat, a
  // passenger's WhatsApp thread), which is a real signal — but it only breaks
  // a tie the text itself left open, it never overrides the text.
  if (hint === "DRIVER_LIKELY") return "DRIVER_OFFER";
  if (hint === "PASSENGER_LIKELY") return "PASSENGER_REQUEST";
  return "UNRECOGNIZED";
}

export const RULE_BASED_EXTRACTION_MODEL = "rule-based-deterministic";

export class RuleBasedTripExtractionProvider implements TripExtractionProvider {
  readonly providerName = "rule-based";
  readonly modelId = RULE_BASED_EXTRACTION_MODEL;

  async extract({ text, stops, hint, today }: TripExtractionInput): Promise<ExtractionResult> {
    const language = detectLanguage(text);
    const hits = findStops(text, stops);
    const kind = decideKind(text, hint);

    const origin = hits[0]?.stop ?? null;
    // The second *distinct* stop. A message that names one stop twice has not
    // named a route.
    const destination = hits.find((h) => h.stop.key !== origin?.key)?.stop ?? null;

    const travelDate = findTravelDate(text, today);
    const seats = findSeats(text);

    // Fail closed to UNRECOGNIZED, exactly as the model prompt instructs:
    // without both endpoints there is no route, and ingest.ts would reject it
    // a few lines later anyway. Saying so here keeps the reason legible.
    const recognized = kind !== "UNRECOGNIZED" && origin !== null && destination !== null;

    return {
      kind: recognized ? kind : "UNRECOGNIZED",
      language,
      originStopKey: recognized ? origin.key : null,
      destinationStopKey: recognized ? destination.key : null,
      travelDate: recognized ? travelDate : null,
      timeWindowStart: recognized ? findTimeWindowStart(text) : null,
      timeWindowEnd: null,
      seats: recognized ? seats : null,
      luggage: recognized ? findLuggage(text) : null,
      // Deliberately never populated. A pickup point is free-text geography
      // that Жолчу has to resolve, and inventing one from a substring would
      // hand matching an address nobody verified (spec s.5, s.15).
      pickupPoint: null,
      carInfo: kind === "DRIVER_OFFER" ? findCarInfo(text) : null,
      // Reported, not asserted: full route plus date plus seats is a message
      // this parser genuinely understood; anything less is partial.
      confidence: recognized ? (travelDate && seats ? 0.9 : 0.6) : 0.2,
    };
  }
}
