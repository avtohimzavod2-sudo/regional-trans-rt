// Deterministic language detection for Mira's fast layer. Handles the cases
// AGENTS.md calls out explicitly: literary Kyrgyz, Kyrgyz without ң/ө/ү,
// Kyrgyz typed on a Latin keyboard, Russian, English, and KY/RU code-switch
// within one message. This is a heuristic dictionary layer, not a model —
// it exists so Mira can log detectedLanguage/languageConfidence cheaply and
// decide when a provider call is actually needed, and so the benchmark can
// score language detection in isolation from the LLM.
import type { Language } from "@prisma/client";
import {
  approximateLatinKyrgyzToCyrillic,
  hasCyrillicScript,
  hasKyrgyzSpecialLetters,
  hasLatinScript,
  normalizeForMatching,
} from "./normalize";

export interface LanguageDetectionResult {
  language: Language;
  confidence: number; // 0..1
  codeSwitched: boolean;
  secondaryLanguage: Language | null;
  scriptGuess: "CYRILLIC" | "LATIN" | "MIXED" | "NONE";
}

// Folded (no ң/ө/ү) Kyrgyz words, both Cyrillic and a common romanized
// spelling, kept short and transport-domain-biased on purpose — this is a
// fast layer, not a dictionary of the whole language. Extend via
// src/lib/mira/training as real corpus grows (see MiraTrainingExample).
const KY_WORDS_CYRILLIC = [
  "керек", "эртен", "эртеӊ", "бугун", "кечээ", "саат", "орун", "унаа", "барам",
  "кетем", "жиберет", "жиберуу", "канча", "айдоочу", "жолоочу", "бала", "балдар",
  "кишибиз", "жок", "дейм", "дейт", "издеп", "издейм", "багыт", "жол", "менен",
  "болот", "мурун", "азыр", "качан", "кайда", "кайдан", "канчадан", "суранам",
];

const KY_WORDS_LATIN = [
  "kerek", "erte", "erten", "bugun", "kece", "saat", "orun", "unaa", "baram",
  "ketem", "jiberet", "kancha", "aidoochu", "joloochu", "bala", "kishi", "jok",
  "bar", "kайда", "kaida", "kaidan", "azyr", "kachan",
];

const RU_WORDS = [
  "нужно", "нужна", "нужен", "хочу", "завтра", "сегодня", "вечером", "утром",
  "место", "места", "машина", "водитель", "ребенок", "человек", "человека",
  "пассажир", "пассажиров", "билет", "поеду", "едем", "едет", "свободно",
  "свободных", "выезжаю", "спасибо", "пожалуйста", "здравствуйте", "можно",
];

const EN_WORDS = [
  "need", "car", "seat", "seats", "tomorrow", "today", "people", "person",
  "hi", "hello", "from", "to", "morning", "evening", "please", "thanks",
  "driver", "passenger", "how", "much", "when", "where",
];

function countHits(normalized: string, words: string[]): number {
  let hits = 0;
  for (const w of words) {
    if (normalized.includes(w)) hits += 1;
  }
  return hits;
}

/**
 * Pure, deterministic. Never throws, never returns a language with high
 * confidence unless there's real dictionary/script evidence — callers
 * should treat low-confidence results as "ask, don't assume" per the
 * clarification policy (AGENTS.md section 22).
 */
export function detectMiraLanguage(rawText: string): LanguageDetectionResult {
  const text = rawText ?? "";
  const normalized = normalizeForMatching(text);

  if (normalized.length === 0) {
    return { language: "RU", confidence: 0, codeSwitched: false, secondaryLanguage: null, scriptGuess: "NONE" };
  }

  const specialLetterHits = (text.match(/[өүң]/gi) ?? []).length;
  const cyrillic = hasCyrillicScript(text);
  const latin = hasLatinScript(text);

  const kyCyrillicHits = countHits(normalized, KY_WORDS_CYRILLIC) + specialLetterHits * 2;
  const kyLatinHits = latin ? countHits(normalized, KY_WORDS_LATIN) : 0;
  const kyLatinTransliterated = latin ? countHits(approximateLatinKyrgyzToCyrillic(normalized), KY_WORDS_CYRILLIC) : 0;
  const kyScore = kyCyrillicHits + kyLatinHits + kyLatinTransliterated * 0.5;

  const ruScore = countHits(normalized, RU_WORDS);
  const enScore = latin ? countHits(normalized, EN_WORDS) : 0;

  const scores: Record<Language, number> = { KY: kyScore, RU: ruScore, EN: enScore };
  const ranked = (Object.entries(scores) as [Language, number][]).sort((a, b) => b[1] - a[1]);
  const [topLang, topScore] = ranked[0];
  const [secondLang, secondScore] = ranked[1];

  const scriptGuess: LanguageDetectionResult["scriptGuess"] =
    cyrillic && latin ? "MIXED" : cyrillic ? "CYRILLIC" : latin ? "LATIN" : "NONE";

  if (topScore === 0) {
    // No dictionary evidence at all — fall back to script only, low confidence.
    if (hasKyrgyzSpecialLetters(text)) {
      return { language: "KY", confidence: 0.4, codeSwitched: false, secondaryLanguage: null, scriptGuess };
    }
    if (cyrillic) return { language: "RU", confidence: 0.3, codeSwitched: false, secondaryLanguage: null, scriptGuess };
    if (latin) return { language: "EN", confidence: 0.25, codeSwitched: false, secondaryLanguage: null, scriptGuess };
    return { language: "RU", confidence: 0, codeSwitched: false, secondaryLanguage: null, scriptGuess };
  }

  // Code-switch: a real second-language signal alongside the winner (e.g.
  // "Эртен утром Бишкектен Караколго 2 места керек" — KY wins, RU present).
  const codeSwitched = secondScore > 0 && secondScore >= Math.max(1, topScore * 0.4);

  const totalSignal = kyScore + ruScore + enScore;
  const confidence = Math.min(1, 0.45 + (topScore / Math.max(1, totalSignal)) * 0.5);

  return {
    language: topLang,
    confidence,
    codeSwitched,
    secondaryLanguage: codeSwitched ? secondLang : null,
    scriptGuess,
  };
}
