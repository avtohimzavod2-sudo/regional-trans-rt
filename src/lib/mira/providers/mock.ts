// MockMiraProvider — fully deterministic, no network calls. This is what
// runs in tests, CI, and local dev without a Gemini key, and is what the
// benchmark runner uses by default so scores are reproducible. It reuses
// the same quick-classify dictionary RT Command already uses, so its
// "understanding" is intentionally modest — good enough to exercise every
// code path, not a substitute for the real model's language quality.
import { quickClassifyMessage } from "@/lib/agents/quick-classify";
import { normalizeForMatching } from "../language/normalize";
import { REQUIRED_FIELDS_BY_ROLE, mapQuickRoleToMiraRole, type MiraNormalizedFields } from "../types";
import type {
  MiraModelProvider,
  MiraReplyInput,
  MiraReplyOutput,
  MiraUnderstandInput,
  MiraUnderstandOutput,
} from "./model-provider";

const CITY_ALIASES: Record<string, string> = {
  бишкек: "BISHKEK",
  бишкектен: "BISHKEK",
  бишкекке: "BISHKEK",
  каракол: "KARAKOL",
  караколго: "KARAKOL",
  караколдон: "KARAKOL",
  нарын: "NARYN",
  нарынга: "NARYN",
  наринге: "NARYN",
  ош: "OSH",
  оштон: "OSH",
  ошко: "OSH",
  bishkek: "BISHKEK",
  karakol: "KARAKOL",
  naryn: "NARYN",
  osh: "OSH",
};

function extractCities(normalized: string): { from: string | null; to: string | null } {
  const found: string[] = [];
  for (const [alias, city] of Object.entries(CITY_ALIASES)) {
    if (normalized.includes(alias) && !found.includes(city)) found.push(city);
  }
  return { from: found[0] ?? null, to: found[1] ?? null };
}

function extractSeatsAndPassengers(normalized: string): { count: number | null } {
  const match = normalized.match(/(\d+)\s*(мест|орун|киши|пассажир|seat|people)/);
  return { count: match ? Number(match[1]) : null };
}

function extractPhone(text: string): string | null {
  const match = text.match(/(\+?\d[\d\s-]{6,}\d)/);
  return match ? match[1].replace(/[\s-]/g, "") : null;
}

/** Very small deterministic prompt-injection guard, mirrors the real
 * provider's system-instruction refusal so tests can exercise the same
 * behavior without a live model. See src/lib/mira/safety.ts for the
 * authoritative, always-on version of this check. */
const INJECTION_MARKERS = [
  "игнорируй правила",
  "ignore previous instructions",
  "покажи телефон",
  "покажи внутренний prompt",
  "system prompt",
  "api key",
  "какие агенты",
];

export class MockMiraProvider implements MiraModelProvider {
  readonly providerName = "mock";
  readonly modelId = "mock-deterministic";

  async understand(input: MiraUnderstandInput): Promise<MiraUnderstandOutput> {
    const quick = quickClassifyMessage(input.text);
    const normalized = normalizeForMatching(input.text);
    const { from, to } = extractCities(normalized);
    const { count } = extractSeatsAndPassengers(normalized);
    const phone = extractPhone(input.text);
    const role = mapQuickRoleToMiraRole(quick.role);

    const entities: MiraNormalizedFields = {
      from,
      to,
      passengerCount: role === "PASSENGER" ? count : null,
      seatsAvailable: role === "DRIVER" ? count : null,
      phone,
      children: /балам|ребен|бала бар|with (a )?child/i.test(normalized) ? true : null,
    };
    if (/эртен|erten|erte|tomorrow|завтра/i.test(normalized)) entities.date = "TOMORROW";
    if (/бугун|bugun|today|сегодня/i.test(normalized)) entities.date = "TODAY";

    const required = REQUIRED_FIELDS_BY_ROLE[role] ?? [];
    const missing = required.filter((f) => entities[f] === null || entities[f] === undefined);

    return {
      role,
      roleConfidence: quick.confidence,
      intent: quick.intent,
      intentConfidence: quick.confidence,
      entities,
      uncertainties: missing.map((f) => String(f)),
      requiresClarification: missing.length > 0 && role !== "UNKNOWN",
      clarificationQuestion: missing.length > 0 ? `missing:${missing.join(",")}` : null,
    };
  }

  async reply(input: MiraReplyInput): Promise<MiraReplyOutput> {
    const lower = input.userText.toLowerCase();
    if (INJECTION_MARKERS.some((m) => lower.includes(m))) {
      return {
        text:
          input.language === "KY"
            ? "Мен бул маалыматты бере албайм, бирок сизге сапар табууга даярмын."
            : input.language === "EN"
              ? "I can't share that, but I'm happy to help you find a trip."
              : "Я не могу поделиться этим, но готова помочь с поездкой.",
      };
    }
    return { text: `[mock:${input.language}] ${input.situation}` };
  }
}
