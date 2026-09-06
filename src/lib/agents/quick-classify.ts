// Cheap, deterministic "fast layer" used by RT Command before it spends a
// reasoning-model call. Handles the common, unambiguous cases (a clearly
// worded passenger request, a clearly worded driver offer, a cancellation,
// a parcel request) so only genuinely ambiguous messages reach the LLM-based
// extraction in `@/lib/nlp/extract`. Deliberately dictionary/regex based —
// no network calls — so it stays fully unit-testable and free to run on
// every inbound message.

export type MessageRole = "passenger" | "driver" | "dispatcher" | "parcel_sender" | "mixed" | "unknown";
export type MessageIntent = "trip_request" | "trip_offer" | "cancellation" | "parcel" | "unrecognized";

export interface QuickClassification {
  role: MessageRole;
  intent: MessageIntent;
  confidence: number; // 0..1 — how much the deterministic layer trusts this call
  matchedSignals: string[];
}

// Folds Kyrgyz-specific letters to their nearest Latin/Cyrillic-ASCII
// equivalents so informal spellings (no ө/ү/ң on the keyboard) still match
// the same dictionary as literary Kyrgyz, and lowercases for substring match.
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
  role: Exclude<MessageRole, "mixed" | "unknown">;
  intent: MessageIntent;
  phrases: string[];
  patterns?: RegExp[];
}

const SIGNAL_SETS: SignalSet[] = [
  {
    role: "passenger",
    intent: "trip_request",
    phrases: [
      // RU
      "нужно место", "нужны места", "нужна машина", "ищу машину", "ищу попутку",
      "ищу водителя", "нужен водитель", "нужно доехать", "хочу доехать", "хочу поехать",
      "мест нужно", "нужно мест", "еду пассажиром", "как пассажир",
      // KY (already folded through normalize: ө->о, ү->у, ң->н)
      "орун керек", "жол керек", "унаа керек", "айдоочу керек", "барам деп жатам",
      "бара турган унаа керек",
    ],
    patterns: [/нужн[оа]\s*\d*\s*мест/, /нужн[оа]\s+машин/],
  },
  {
    role: "driver",
    intent: "trip_offer",
    phrases: [
      // RU
      "мест свободно", "свободных мест", "свободные места", "выезжаю в",
      "выезд в", "еду с пассажирами", "беру пассажиров", "везу пассажиров",
      "есть места",
      // KY
      "бош орун", "орун бар", "чыгам", "айдайм", "жолоочу алам",
    ],
    patterns: [/\d+\s*мест[оа]?\s*свободн/],
  },
  {
    role: "parcel_sender",
    intent: "parcel",
    phrases: [
      "посылк", "передать посылку", "отправить посылку", "нужно отправить",
      "заберите посылку", "жук", "баштык жетки", "package", "parcel",
    ],
  },
];

const CANCELLATION_PHRASES = [
  "отмена", "отменить", "отменяю", "не поеду", "не смогу поехать", "не получится",
  "cancel", "жокко чыгар", "бербейм", "бара албайм", "барбайм",
];

function countMatches(haystack: string, set: SignalSet): string[] {
  const phraseHits = set.phrases.filter((p) => haystack.includes(p));
  const patternHits = (set.patterns ?? []).filter((p) => p.test(haystack)).map((p) => p.source);
  return [...phraseHits, ...patternHits];
}

/**
 * Classify role + intent from raw free text using deterministic dictionary
 * matching only. Returns role="unknown"/intent="unrecognized" with
 * confidence 0 whenever the message doesn't clearly match a known pattern —
 * callers should fall back to the LLM extractor in that case, never guess.
 */
export function quickClassifyMessage(text: string): QuickClassification {
  const normalized = normalize(text);

  const cancelHits = CANCELLATION_PHRASES.filter((p) => normalized.includes(p));
  if (cancelHits.length > 0) {
    return { role: "unknown", intent: "cancellation", confidence: Math.min(1, cancelHits.length / 2), matchedSignals: cancelHits };
  }

  const scored = SIGNAL_SETS.map((set) => ({ set, hits: countMatches(normalized, set) })).filter(
    (s) => s.hits.length > 0,
  );

  if (scored.length === 0) {
    return { role: "unknown", intent: "unrecognized", confidence: 0, matchedSignals: [] };
  }

  scored.sort((a, b) => b.hits.length - a.hits.length);
  const [best, second] = scored;

  if (second && second.hits.length === best.hits.length && second.set.role !== best.set.role) {
    return {
      role: "mixed",
      intent: "unrecognized",
      confidence: 0.3,
      matchedSignals: [...best.hits, ...second.hits],
    };
  }

  return {
    role: best.set.role,
    intent: best.set.intent,
    confidence: Math.min(1, best.hits.length / 2),
    matchedSignals: best.hits,
  };
}
