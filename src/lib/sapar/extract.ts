// Deterministic, dependency-free extraction of shipment fields from raw
// customer text. No LLM call — mirrors the fast-layer/quick-classify style
// already used elsewhere in the project (mock Mira provider, quick-classify)
// so Sapar never needs a model call just to read "коробка 5 кг" and stays
// anti-hallucination-safe: every field is either found in the text or left
// null, never guessed (AGENTS spec s.40).
//
// Known, documented limitation: place-name extraction is heuristic (Russian
// prepositions "из/от/с ... в/до" and Kyrgyz case suffixes "-тен/-дон/-га"),
// not full morphological analysis. It covers the RT Kyrgyz Benchmark-style
// fixtures in sapar/extract.test.ts but will occasionally miss an unusual
// phrasing — same class of trade-off already accepted by Jolchu's and
// quick-classify's own keyword-based extraction.
import type { ShipmentExtraction } from "./types";

// Single-word capture only: a wider (multi-word) capture risks swallowing an
// unrelated following noun ("в Бишкек запчасть" -> destination must stop at
// "Бишкек"). Multi-word place names fall through to extractBySuffix's
// preceding-word lookback instead (see Cholpon Ataga in the fixtures).
// с = Cyrillic "с" ("from"/"with") — spelled out to avoid any risk of
// this literal being confused with the visually-identical Latin "c".
const FROM_PREPOSITION = /(?:^|\s)(?:из|от|с|from)\s+([a-zа-яё\-]+)/i;
const TO_PREPOSITION = /(?:^|\s)(?:в|до|to)\s+([a-zа-яё\-]+)/i;
// (?:^|\s) ... (?=\s|,|\.|$) instead of \b: JS's \b is defined off ASCII \w,
// so it never fires around Cyrillic letters at all (a space next to a
// Cyrillic letter isn't a "boundary" to the regex engine) — \b(Cyrillic)\b
// silently matches nothing, which is exactly what let this go unnoticed.
const FROM_SUFFIX = /(?:^|\s)([a-zа-яё\-]+(?:тен|тан|дон|дан|нен|нан|ten|tan|don|dan|nen|nan))(?=\s|,|\.|$)/i;
const TO_SUFFIX = /(?:^|\s)([a-zа-яё\-]+(?:га|ге|ко|го|ga|ge|ko|go))(?=\s|,|\.|$)/i;

const PLACE_STOPWORDS = new Set([
  "и",
  "керек",
  "бугун",
  "эртен",
  "завтра",
  "сегодня",
  "надо",
  "нужно",
  "отвезти",
  "забрать",
  "kg",
  "кг",
  "today",
  "tomorrow",
  "bar",
]);

function cleanPlacePhrase(raw: string | undefined): string | null {
  if (!raw) return null;
  const words = raw
    .trim()
    .split(/\s+/)
    .filter((w) => !PLACE_STOPWORDS.has(w.toLowerCase()) && !/^\d+$/.test(w));
  if (words.length === 0) return null;
  return words.join(" ");
}

function extractBySuffix(text: string, suffixPattern: RegExp): string | null {
  const match = suffixPattern.exec(text);
  if (!match) return null;
  const index = match.index;
  const before = text.slice(0, index).trim();
  const precedingWordMatch = /([a-zа-яё\-]+)\s*$/i.exec(before);
  const precedingWord =
    precedingWordMatch && !FROM_SUFFIX.test(precedingWordMatch[1]) && !TO_SUFFIX.test(precedingWordMatch[1])
      ? precedingWordMatch[1]
      : null;
  return precedingWord ? `${precedingWord} ${match[1]}` : match[1];
}

function extractPlace(text: string, prepositionPattern: RegExp, suffixPattern: RegExp): string | null {
  const prepositionMatch = prepositionPattern.exec(text);
  const fromPreposition = cleanPlacePhrase(prepositionMatch?.[1]);
  if (fromPreposition) return fromPreposition;
  return extractBySuffix(text, suffixPattern);
}

const PIECE_NOUN_PATTERN = /(\d+)\s*(?:коробк|box|штук|шт\.?|мешк|пач|аккумулятор|батаре)/i;
// Trailing (?=...) instead of \b for the same reason as FROM_SUFFIX/TO_SUFFIX
// above: \b never fires after a Cyrillic "кг".
const WEIGHT_DIGIT_FIRST = /(\d+(?:[.,]\d+)?)\s*(?:кг|kg)(?=\s|,|\.|$)/i;
const WEIGHT_UNIT_FIRST = /(?:кг|kg)\s*(\d+(?:[.,]\d+)?)/i;

const CARGO_NOUN_DICTIONARY: Array<[RegExp, string]> = [
  [/посылк/i, "посылка"],
  [/коробк/i, "коробка"],
  [/парчаст|запчаст/i, "запчасть"],
  [/телевизор/i, "телевизор"],
  [/аккумулятор/i, "аккумуляторы"],
  [/батаре/i, "батарейки"],
  [/груз/i, "груз"],
  [/parcel/i, "parcel"],
  [/posylk/i, "посылка"],
  [/package/i, "package"],
  [/box/i, "box"],
];

const FRAGILE_SIGNALS = ["хрупк", "бьющ", "fragile", "стекл"];
const PERISHABLE_SIGNALS = ["скоропортящ", "perishable"];
const TEMPERATURE_SIGNALS = ["заморож", "охлажд", "температур", "cold chain", "холодильник"];
const TIME_SIGNALS = ["завтра", "сегодня", "бугун", "эртен", "tomorrow", "today"];

function includesAny(normalized: string, signals: string[]): string | null {
  return signals.find((s) => normalized.includes(s)) ?? null;
}

export function extractShipmentFields(text: string): ShipmentExtraction {
  const normalized = text.trim().toLowerCase();

  const pieceMatch = PIECE_NOUN_PATTERN.exec(text);
  const pieces = pieceMatch ? Number(pieceMatch[1]) : null;

  const weightMatch = WEIGHT_DIGIT_FIRST.exec(text) ?? WEIGHT_UNIT_FIRST.exec(text);
  const weightKg = weightMatch ? Number(weightMatch[1].replace(",", ".")) : null;

  const cargoEntry = CARGO_NOUN_DICTIONARY.find(([pattern]) => pattern.test(text));
  const cargoDescription = cargoEntry ? cargoEntry[1] : null;

  return {
    pickupText: extractPlace(text, FROM_PREPOSITION, FROM_SUFFIX),
    destinationText: extractPlace(text, TO_PREPOSITION, TO_SUFFIX),
    cargoDescription,
    pieces,
    weightKg,
    dimensions: null,
    preferredPickupTime: includesAny(normalized, TIME_SIGNALS),
    declaredValueSom: null,
    fragile: includesAny(normalized, FRAGILE_SIGNALS) !== null,
    perishable: includesAny(normalized, PERISHABLE_SIGNALS) !== null,
    temperatureControlled: includesAny(normalized, TEMPERATURE_SIGNALS) !== null,
    specialHandling: null,
  };
}
