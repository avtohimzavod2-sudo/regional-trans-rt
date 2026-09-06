// PII sanitization/redaction pipeline. Any real conversation text must be
// passed through sanitizeForTraining() before it may be stored as a
// MiraTrainingExample/MiraLanguageFailure with sourceType RT_SANITIZED.
// Deterministic and regex-based on purpose — a training pipeline must be
// auditable, not "trust the model to redact itself."
export interface SanitizeResult {
  sanitized: string;
  redactionCount: number;
  redactedCategories: string[];
}

interface RedactionRule {
  category: string;
  pattern: RegExp;
  replacement: string;
}

const RULES: RedactionRule[] = [
  // Kyrgyz/Russian mobile numbers: +996 XXX XXXXXX, 0XXX XXXXXX, with any
  // separators. Deliberately broad — false positives (redacting a stray
  // 6+ digit number) are the safe failure mode here.
  { category: "PHONE", pattern: /(\+?\d[\d\s\-()]{7,}\d)/g, replacement: "[PHONE]" },
  { category: "EMAIL", pattern: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, replacement: "[EMAIL]" },
  { category: "TELEGRAM_HANDLE", pattern: /@[a-zA-Z0-9_]{4,}/g, replacement: "[HANDLE]" },
  // KG vehicle plates, e.g. "01 KG 123 ABC" / "A123BCD".
  { category: "PLATE", pattern: /\b\d{2}\s?KG\s?\d{3}\s?[A-Z]{2,3}\b/gi, replacement: "[PLATE]" },
];

export function sanitizeForTraining(text: string): SanitizeResult {
  let sanitized = text;
  let redactionCount = 0;
  const redactedCategories: string[] = [];

  for (const rule of RULES) {
    const matches = sanitized.match(rule.pattern);
    if (matches && matches.length > 0) {
      redactionCount += matches.length;
      redactedCategories.push(rule.category);
      sanitized = sanitized.replace(rule.pattern, rule.replacement);
    }
  }

  return { sanitized, redactionCount, redactedCategories };
}

/** A conversation is only safe to promote out of REDACTION_PENDING once
 * a human has confirmed no PII survives sanitization — this check just
 * catches the mechanical cases (leftover digit runs / handles / emails)
 * so an obviously-unsanitized text can never be marked SANITIZED. */
export function looksFullySanitized(text: string): boolean {
  // Use match(), not test() — these patterns carry the "g" flag, and a
  // global regex's test() mutates lastIndex across calls, which would make
  // repeated calls to this function alternate between true/false for the
  // same input. match() resets lastIndex itself and is safe to call
  // repeatedly with a shared RegExp instance.
  return RULES.every((rule) => text.match(rule.pattern) === null);
}
