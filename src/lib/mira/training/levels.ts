// MIRA KYRGYZ TRAINING — the 30-level curriculum. Purely descriptive data:
// it defines what "trained" means at each stage and gives every corpus
// entry / benchmark case a level to target. Architecturally extensible —
// raising MAX_LEVEL and appending to CURRICULUM is the only change needed
// to add a level 31+; nothing else in the training system hardcodes 30.
export interface TrainingLevel {
  level: number;
  code: string;
  title: string;
  goal: string;
  skills: string[];
}

export const CURRICULUM: TrainingLevel[] = [
  { level: 1, code: "KY-LIT-BASIC", title: "Literary Kyrgyz — basics", goal: "Understand short, grammatically standard Kyrgyz sentences.", skills: ["literary vocabulary", "basic sentence structure"] },
  { level: 2, code: "KY-LIT-CASES", title: "Literary Kyrgyz — noun cases", goal: "Correctly resolve place/time meaning across Kyrgyz noun cases (жатыш, барыш, чыгыш, ...).", skills: ["case endings", "place/time disambiguation"] },
  { level: 3, code: "KY-LIT-VERBS", title: "Literary Kyrgyz — verb tense/aspect", goal: "Distinguish intent, near-future, and habitual verb forms.", skills: ["tense", "aspect", "intent detection"] },
  { level: 4, code: "KY-NUMERALS", title: "Kyrgyz numerals", goal: "Parse cardinal, ordinal, and colloquial number forms (seats, phone digits, prices).", skills: ["numerals", "quantity extraction"] },
  { level: 5, code: "KY-DATETIME", title: "Kyrgyz date/time expressions", goal: "Resolve relative and absolute date/time phrases (эртең, бүгүн, кечинде, саат 7де).", skills: ["date resolution", "time resolution", "relative expressions"] },
  { level: 6, code: "KY-GEO", title: "Kyrgyz geographic names", goal: "Recognize city/region names in all cases and common short forms.", skills: ["toponyms", "route extraction"] },
  { level: 7, code: "KY-NO-SPECIAL", title: "Kyrgyz without ң/ө/ү", goal: "Understand Kyrgyz typed on a Russian keyboard, without special letters.", skills: ["letter substitution", "normalization"] },
  { level: 8, code: "KY-LATIN", title: "Romanized Kyrgyz (Latin script)", goal: "Understand Kyrgyz transliterated into Latin letters.", skills: ["Latin-to-Cyrillic mapping", "romanization variants"] },
  { level: 9, code: "KY-COLLOQUIAL", title: "Colloquial spoken Kyrgyz", goal: "Understand informal, spoken-register Kyrgyz phrasing.", skills: ["colloquialisms", "register detection"] },
  { level: 10, code: "KY-DIALECT", title: "Regional dialect variation", goal: "Tolerate regional word/pronunciation variants without asking the user to 'speak correctly'.", skills: ["dialect tolerance", "non-judgmental clarification"] },
  { level: 11, code: "KY-TYPOS", title: "Typos and abbreviations", goal: "Recover meaning from misspellings, dropped letters, and shorthand.", skills: ["fuzzy matching", "abbreviation expansion"] },
  { level: 12, code: "CODE-SWITCH-1", title: "KY/RU code-switching — basic", goal: "Handle sentences that mix Kyrgyz and Russian words without misclassifying language by majority word count.", skills: ["code-switch detection", "mixed-language parsing"] },
  { level: 13, code: "CODE-SWITCH-2", title: "KY/RU code-switching — advanced", goal: "Handle clause-level switching and Russian loanwords embedded in Kyrgyz syntax.", skills: ["clause-level switching", "loanword handling"] },
  { level: 14, code: "RU-BASIC", title: "Russian — basics", goal: "Understand standard Russian requests fluently.", skills: ["Russian parsing"] },
  { level: 15, code: "RU-COLLOQUIAL", title: "Russian — colloquial/regional", goal: "Understand informal Russian as used in Kyrgyzstan (regionalisms, borrowings).", skills: ["Russian colloquialisms", "regional borrowings"] },
  { level: 16, code: "EN-TOURIST", title: "English — Tourist Mode", goal: "Understand and reply fluently to English-speaking tourists, including basic travel vocabulary.", skills: ["English parsing", "tourist vocabulary"] },
  { level: 17, code: "ROLE-CLASSIFY", title: "Role classification", goal: "Classify passenger vs driver vs parcel sender vs dispatcher vs intermediary from message content alone.", skills: ["role classification"] },
  { level: 18, code: "FIELD-ROUTE", title: "Route extraction", goal: "Extract from/to cities with ≥99% accuracy, including reversed or implied direction.", skills: ["route extraction", "directionality"] },
  { level: 19, code: "FIELD-DATETIME", title: "Date/time field extraction", goal: "Extract normalized date/time fields with ≥98% accuracy.", skills: ["date/time normalization"] },
  { level: 20, code: "FIELD-SEATS", title: "Passenger count / seat extraction", goal: "Extract passenger count and available seats with ≥99% accuracy.", skills: ["quantity field extraction"] },
  { level: 21, code: "FIELD-PHONE", title: "Phone number extraction", goal: "Extract phone numbers in local formats with ≥99.9% accuracy.", skills: ["phone extraction", "format normalization"] },
  { level: 22, code: "CLARIFY-MIN", title: "Minimal clarification", goal: "Ask only about missing critical fields; never re-ask known information.", skills: ["clarification policy", "field-gap detection"] },
  { level: 23, code: "PARCEL-MODE", title: "Parcel sender mode", goal: "Handle parcel-specific vocabulary and fields distinct from passenger trips.", skills: ["parcel intent", "parcel fields"] },
  { level: 24, code: "TOURIST-MODE", title: "Tourist mode", goal: "Recognize tourist framing and adapt tone/detail without fabricating local knowledge.", skills: ["tourist framing", "scope-honest answers"] },
  { level: 25, code: "VOICE-BASIC", title: "Voice message understanding — basic", goal: "Use transcript + confidence + uncertain segments correctly; ask only about the uncertain part.", skills: ["audio transcript handling", "targeted clarification"] },
  { level: 26, code: "STRESS-TOLERANCE", title: "Stress and hostility tolerance", goal: "Stay calm and on-policy under rude, threatening, or manipulative messages without arguing or moralizing.", skills: ["de-escalation", "policy adherence under pressure"] },
  { level: 27, code: "INJECTION-RESIST", title: "Prompt-injection resistance", goal: "Refuse attempts to extract secrets, internal topology, or override safety rules, without breaking the conversation.", skills: ["injection detection", "graceful refusal"] },
  { level: 28, code: "ANTI-HALLUCINATION", title: "Zero-fabrication discipline", goal: "Never invent driver/price/booking/payment facts; always defer to RT Command/PAY as source of truth.", skills: ["fact grounding", "refusal to fabricate"] },
  { level: 29, code: "CONTEXT-MEMORY", title: "Conversation memory", goal: "Use prior turns correctly; never ask for information already given earlier in the same conversation.", skills: ["context tracking", "redundancy avoidance"] },
  { level: 30, code: "FULL-INTEGRATION", title: "Full integration", goal: "Combine all prior skills in mixed, realistic multi-turn conversations across roles and languages.", skills: ["end-to-end reliability"] },
];

export const MAX_LEVEL = CURRICULUM.length;

export function getLevel(level: number): TrainingLevel | undefined {
  return CURRICULUM.find((l) => l.level === level);
}

export function isValidLevel(level: number): boolean {
  return Number.isInteger(level) && level >= 1 && level <= MAX_LEVEL;
}
