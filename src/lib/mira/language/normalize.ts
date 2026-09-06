// Kyrgyz-aware text normalization. Deterministic, no network calls — these
// helpers exist so Mira's dictionary/heuristic layers (detection, quick
// understanding, benchmark scoring) all agree on the same folded form,
// regardless of whether the user typed literary Kyrgyz, Kyrgyz without
// ң/ө/ү (Cyrillic keyboard without the extra keys), or Kyrgyz romanized on a
// plain English keyboard ("erte karakolgo ketem").

/** Folds the three Kyrgyz-specific Cyrillic letters to their nearest
 * Cyrillic-ASCII equivalents, e.g. "бүгүн" -> "бугун". This is how most
 * Kyrgyz speakers type on a Russian-only keyboard/phone layout. */
export function foldKyrgyzSpecialLetters(text: string): string {
  return text
    .replace(/ө/g, "о")
    .replace(/Ө/g, "О")
    .replace(/ү/g, "у")
    .replace(/Ү/g, "У")
    .replace(/ң/g, "н")
    .replace(/Ң/g, "Н");
}

/** Lowercase, fold special letters, strip punctuation, collapse whitespace.
 * The shared normal form used across quick-classify, language detection,
 * and benchmark scoring so they never disagree on trivial formatting. */
export function normalizeForMatching(text: string): string {
  return foldKyrgyzSpecialLetters(text.toLowerCase())
    .replace(/[.,!?;:()"'«»№]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Best-effort romanized-Kyrgyz -> Cyrillic transliteration, for the common
// "no Kyrgyz keyboard available" case (AGENTS.md level 12/level 11). This is
// intentionally approximate: it is only ever used to widen dictionary
// matching, never to produce text shown to a user.
const LATIN_TO_CYRILLIC_KY: [RegExp, string][] = [
  [/sh/g, "ш"],
  [/ch/g, "ч"],
  [/zh/g, "ж"],
  [/ts/g, "ц"],
  [/yu/g, "ю"],
  [/ya/g, "я"],
  [/yo/g, "ё"],
  [/j/g, "ж"],
  [/a/g, "а"],
  [/b/g, "б"],
  [/c/g, "к"],
  [/d/g, "д"],
  [/e/g, "е"],
  [/f/g, "ф"],
  [/g/g, "г"],
  [/h/g, "х"],
  [/i/g, "и"],
  [/k/g, "к"],
  [/l/g, "л"],
  [/m/g, "м"],
  [/n/g, "н"],
  [/o/g, "о"],
  [/p/g, "п"],
  [/q/g, "к"],
  [/r/g, "р"],
  [/s/g, "с"],
  [/t/g, "т"],
  [/u/g, "у"],
  [/v/g, "в"],
  [/w/g, "в"],
  [/x/g, "кс"],
  [/y/g, "й"],
  [/z/g, "з"],
];

/** Approximate romanized-Kyrgyz -> Cyrillic transliteration, used only to
 * widen dictionary matching for text typed on an English keyboard (e.g.
 * "erte karakolgo ketem"). Never used for anything user-facing. */
export function approximateLatinKyrgyzToCyrillic(text: string): string {
  let out = text.toLowerCase();
  for (const [pattern, replacement] of LATIN_TO_CYRILLIC_KY) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export function hasCyrillicScript(text: string): boolean {
  return /[а-яёөүң]/i.test(text);
}

export function hasLatinScript(text: string): boolean {
  return /[a-z]/i.test(text);
}

export function hasKyrgyzSpecialLetters(text: string): boolean {
  return /[өүң]/i.test(text);
}
