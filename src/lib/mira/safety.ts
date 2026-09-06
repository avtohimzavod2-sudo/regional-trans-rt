// Mira's always-on safety layer: prompt-injection resistance and the
// single-persona rule (never leak internal agent names/topology/secrets).
// Pure, deterministic, no I/O — every provider (mock or Gemini) is expected
// to pass its own reply text through requiresSafetyOverride() before it
// reaches a user, so a bad model output can never leak internals even if
// the system-instruction is ignored by the underlying LLM.
import type { Language } from "@prisma/client";

const INJECTION_PATTERNS: RegExp[] = [
  /игнорируй\s+(правила|инструкции|систем)/i,
  /ignore\s+(previous|all|your)\s+(instructions|rules)/i,
  /покажи\s+(телефон|номер)\s+(водител|пассажир)/i,
  /покажи.{0,30}prompt/i,
  /system\s*prompt/i,
  /api[\s_-]?key/i,
  /какие\s+агенты/i,
  /reveal\s+your\s+(prompt|instructions|system)/i,
  /show\s+me\s+the\s+(driver|passenger)'?s?\s+phone/i,
  /дай\s+доступ\s+к\s+(базе|системе)/i,
];

// Internal agent/system names that must never appear verbatim in anything
// sent to a user — Mira is the only persona the outside world knows about.
const INTERNAL_NAME_PATTERNS: RegExp[] = [
  /\bRT\s*COMMAND\b/i,
  /\bMATCH\s*Agent\b/i,
  /\bTRUST\s*Agent\b/i,
  /\bPAY\s*Agent\b/i,
  /\bROUTE\s*Agent\b/i,
  /\bSUPPORT\s*Agent\b/i,
  /\bSCOUT\s*Agent\b/i,
  /\bQUALITY\s*Agent\b/i,
  /\bANALYTICS\s*Agent\b/i,
  /\bNETWORK\s*Agent\b/i,
  /\bPARCEL\s*Agent\b/i,
];

export interface SafetyCheckResult {
  isInjectionAttempt: boolean;
  leaksInternals: boolean;
  safe: boolean;
}

/** Checks inbound user text for a prompt-injection attempt. Never throws. */
export function detectInjectionAttempt(text: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(text));
}

/** Checks a candidate reply (from any provider) for internal-topology leaks
 * before it is ever sent to a user. */
export function leaksInternalTopology(text: string): boolean {
  return INTERNAL_NAME_PATTERNS.some((p) => p.test(text));
}

export function checkSafety(userText: string, candidateReply: string): SafetyCheckResult {
  const isInjectionAttempt = detectInjectionAttempt(userText);
  const leaksInternals = leaksInternalTopology(candidateReply);
  return { isInjectionAttempt, leaksInternals, safe: !leaksInternals };
}

const REFUSAL_TEXT: Record<Language, string> = {
  KY: "Мен бул маалыматты бере албайм, бирок сизге сапар табууга даярмын.",
  RU: "Я не могу поделиться этим, но готова помочь с поездкой.",
  EN: "I can't share that, but I'm happy to help you find a trip.",
};

export function safetyRefusalText(language: Language): string {
  return REFUSAL_TEXT[language] ?? REFUSAL_TEXT.RU;
}
