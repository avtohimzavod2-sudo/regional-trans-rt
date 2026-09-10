// RT OFFICE — Driver Live Signals classifier. Deliberately dictionary/regex
// based, no network calls, no LLM (spec rule #4: never use an LLM guess for
// an operational fact) — mirrors src/lib/agents/quick-classify.ts's style
// exactly. Returns signalType=null/confidence=0 whenever the text does not
// clearly match a known driver-telemetry phrase; callers must never guess in
// that case (fall through to normal Mira handling, never invent a signal).
export type DriverTelemetrySignalType =
  | "ON_DUTY"
  | "WAITING_PASSENGERS"
  | "DEPARTED"
  | "ARRIVED"
  | "SEATS_UPDATED"
  | "DELAYED"
  | "BREAKDOWN_OPENED"
  | "BREAKDOWN_RESOLVED"
  | "LOCATION_UPDATE"
  | "ETA_REQUEST"
  | "TRIP_COMPLETED";

export interface DriverTelemetryClassification {
  signalType: DriverTelemetrySignalType | null;
  confidence: number; // 0..1
  matchedSignals: string[];
  /** Only populated for SEATS_UPDATED, when a number was actually present. */
  seatsAvailable?: number;
  /** Only populated for DELAYED, when a minute count was actually present. */
  delayMinutes?: number;
  /** Only populated for LOCATION_UPDATE/ETA_REQUEST — the raw text, handed
   * to Jolchu's resolveRouteIntelligence as free-text location input.
   * Never geocoded here (spec rule #2: never self-compute ETA/geography). */
  freeText?: string;
}

// Same fold as quick-classify.ts's normalize(): informal Kyrgyz spellings
// (no ө/ү/ң on the keyboard) still match the dictionary.
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ө/g, "о")
    .replace(/ү/g, "у")
    .replace(/ң/g, "н")
    .replace(/[.,!?;:()"'«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface SignalSet {
  signalType: DriverTelemetrySignalType;
  phrases: string[];
}

// Order matters: sets whose phrases are substrings of a later set's phrases
// (e.g. "поломка устранена" contains "поломка") are listed and checked
// first, so a resolved-breakdown report is never misread as a new breakdown,
// and a trip-completion report is never misread as a mere arrival.
const SIGNAL_SETS: SignalSet[] = [
  {
    signalType: "BREAKDOWN_RESOLVED",
    phrases: [
      "поломка устранена", "поломку устранил", "поломку починил", "все починил",
      "всё починил", "машину починил", "уже исправно", "все исправно", "всё исправно",
      "бузулган түзөттум", "унаа түзөлдү",
    ],
  },
  {
    signalType: "BREAKDOWN_OPENED",
    phrases: [
      "поломка", "сломался", "сломалась", "авария", "не могу ехать", "машина сломалась",
      "унаа бузулду", "бузулду",
    ],
  },
  {
    signalType: "TRIP_COMPLETED",
    phrases: [
      "рейс завершен", "рейс завершён", "рейс закончил", "закончил рейс", "рейс окончен",
      "поездка завершена", "рейс бүттү", "сапар бүттү",
    ],
  },
  {
    signalType: "ARRIVED",
    phrases: [
      "прибыл", "приехал", "приехали", "уже на месте", "добрался", "жеттим", "жетип келдим",
    ],
  },
  {
    signalType: "DEPARTED",
    phrases: [
      "выехал", "выехали", "тронулся", "тронулись", "поехали", "жолго чыктым", "чыктым",
    ],
  },
  {
    signalType: "WAITING_PASSENGERS",
    phrases: [
      "жду пассажиров", "жду пассажира", "ожидаю пассажиров", "ожидаю пассажира",
      "жолоочу күтүп жатам", "күтүп жатам",
    ],
  },
  {
    signalType: "ON_DUTY",
    phrases: [
      "вышел на линию", "на линии", "готов к рейсу", "готов работать", "заступил на смену",
      "линияга чыктым",
    ],
  },
];

const SEATS_KEYWORD_PATTERN = /(своб|мест)/;
const SEATS_NUMBER_PATTERN = /(\d+)\s*(?:своб|мест)/;

const DELAY_PHRASES = ["задержка", "задерживаюсь", "опаздываю", "опоздание", "с опозданием"];
const DELAY_MINUTES_PATTERN = /(\d+)\s*мин/;

const ETA_REQUEST_PHRASES = [
  "сколько ехать", "сколько осталось", "сколько времени в пути", "какой это eta",
  "нужен eta", "дай eta", "сколько до", "жолчу дай eta",
];

const LOCATION_PHRASES = [
  "я нахожусь", "моя локация", "местоположение", "геолокация", "я сейчас в", "я возле", "я на трассе",
];

function countMatches(haystack: string, phrases: string[]): string[] {
  return phrases.filter((p) => haystack.includes(p));
}

/**
 * Classify a driver's free-text Telegram message into one of the 11 real
 * operational signals (spec rule #6). Deterministic dictionary matching
 * only — never invents a signal for ambiguous or unrelated text, and never
 * infers an operational conclusion (e.g. no signal here is ever "delayed" or
 * "broken" unless the driver explicitly said so — spec rule #3/#4).
 */
export function classifyDriverTelemetryText(rawText: string): DriverTelemetryClassification {
  const normalized = normalize(rawText);

  for (const set of SIGNAL_SETS) {
    const hits = countMatches(normalized, set.phrases);
    if (hits.length > 0) {
      return { signalType: set.signalType, confidence: Math.min(1, hits.length / 1), matchedSignals: hits };
    }
  }

  if (SEATS_KEYWORD_PATTERN.test(normalized)) {
    const numberMatch = normalized.match(SEATS_NUMBER_PATTERN);
    if (numberMatch) {
      return {
        signalType: "SEATS_UPDATED",
        confidence: 1,
        matchedSignals: [numberMatch[0]],
        seatsAvailable: Number.parseInt(numberMatch[1], 10),
      };
    }
  }

  const delayHits = countMatches(normalized, DELAY_PHRASES);
  if (delayHits.length > 0) {
    const minutesMatch = normalized.match(DELAY_MINUTES_PATTERN);
    return {
      signalType: "DELAYED",
      confidence: Math.min(1, delayHits.length),
      matchedSignals: delayHits,
      delayMinutes: minutesMatch ? Number.parseInt(minutesMatch[1], 10) : undefined,
    };
  }

  const etaHits = countMatches(normalized, ETA_REQUEST_PHRASES);
  if (etaHits.length > 0) {
    return { signalType: "ETA_REQUEST", confidence: 1, matchedSignals: etaHits, freeText: rawText.trim() };
  }

  const locationHits = countMatches(normalized, LOCATION_PHRASES);
  if (locationHits.length > 0) {
    return { signalType: "LOCATION_UPDATE", confidence: 0.6, matchedSignals: locationHits, freeText: rawText.trim() };
  }

  return { signalType: null, confidence: 0, matchedSignals: [] };
}
