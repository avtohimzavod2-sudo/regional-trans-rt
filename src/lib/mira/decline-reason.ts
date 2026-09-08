// Decline-reason capture (Mira Pass 1 spec s.12). Canonical categories, a
// once-only prompt in KY/RU/EN, and a pure ask-once gate. Storage reuses
// MiraConversation.collectedFields (an existing Json column) rather than
// adding a new table — spec s.23: prefer EXTEND/REUSE over a new model. The
// canonical string codes below are also the natural fit for the existing
// free-text Match.declineReason field when this is wired into the live
// passenger-match decline flow.
import type { Language } from "@prisma/client";

export type DeclineReasonCategory =
  | "PRICE"
  | "DEPARTURE_TIME"
  | "WAIT_TOO_LONG"
  | "NO_SUITABLE_VEHICLE"
  | "PICKUP_LOCATION"
  | "DROP_OFF_LOCATION"
  | "DRIVER_PREFERENCE"
  | "LUGGAGE_CONDITION"
  | "FOUND_OTHER_TRANSPORT"
  | "CHANGED_PLANS"
  | "TRUST_OR_SAFETY"
  | "OTHER"
  | "UNKNOWN";

export interface DeclineReasonResult {
  category: DeclineReasonCategory;
  freeText: string | null;
}

const DECLINE_PROMPT: Record<Language, string> = {
  RU: "Поняла. Если не сложно, подскажите, пожалуйста, что не подошло: цена, время, машина или другое? Это поможет нам улучшить сервис.",
  KY: "Түшүндүм. Оор болбосо, эмне жакпай калганын айтып берсеңиз: баасыбы, убактысыбы, унаасыбы же башкабы? Бул кызматыбызды жакшыртууга жардам берет.",
  EN: "Understood. If you don't mind, could you tell me what didn't work — the price, the time, the vehicle, or something else? It helps us improve the service.",
};

/** The "ask once" prompt text — never re-issued for the same decline, per
 * spec s.12: "Mira may politely ask ONCE... must not pressure the customer." */
export function buildDeclineReasonPrompt(language: Language): string {
  return DECLINE_PROMPT[language] ?? DECLINE_PROMPT.RU;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ө/g, "о")
    .replace(/ү/g, "у")
    .replace(/ң/g, "н")
    .trim();
}

const CATEGORY_SIGNALS: Array<{ category: DeclineReasonCategory; phrases: string[] }> = [
  { category: "PRICE", phrases: ["цена", "дорого", "дорогая", "недешево", "баасы", "кымбат", "price", "expensive"] },
  { category: "DEPARTURE_TIME", phrases: ["время", "поздно", "рано", "не то время", "убакыт", "кеч", "эрте", "time"] },
  { category: "WAIT_TOO_LONG", phrases: ["долго ждать", "долго жду", "жду уже", "күтүп", "узак күттүм", "too long", "waiting"] },
  { category: "NO_SUITABLE_VEHICLE", phrases: ["машина не подошла", "не та машина", "унаа жакпады", "vehicle", "car did not"] },
  { category: "PICKUP_LOCATION", phrases: ["место посадки", "забор не устраивает", "алуучу жер", "pickup"] },
  { category: "DROP_OFF_LOCATION", phrases: ["высадк", "точка назначения не устраивает", "түшүрүү жер", "drop off", "dropoff"] },
  { category: "DRIVER_PREFERENCE", phrases: ["не понравился водитель", "предпочитаю другого водителя", "айдоочу жакпады", "driver"] },
  { category: "LUGGAGE_CONDITION", phrases: ["багаж", "вещи не помещаются", "жүк", "luggage"] },
  { category: "FOUND_OTHER_TRANSPORT", phrases: ["нашел другую машину", "нашел другой транспорт", "башка унаа таптым", "found another", "other transport"] },
  { category: "CHANGED_PLANS", phrases: ["передумал", "планы изменились", "ойлонуп", "changed my mind", "changed plans"] },
  { category: "TRUST_OR_SAFETY", phrases: ["не доверяю", "страшно", "небезопасно", "ишенбейм", "safety", "trust"] },
];

/** Classifies free text into a canonical decline-reason category, or
 * UNKNOWN if nothing matches — never fabricates a specific reason from
 * ambiguous text. */
export function classifyDeclineReasonText(text: string): DeclineReasonResult {
  const normalized = normalize(text);
  for (const { category, phrases } of CATEGORY_SIGNALS) {
    if (phrases.some((p) => normalized.includes(p))) {
      return { category, freeText: text };
    }
  }
  if (normalized.length === 0) return { category: "UNKNOWN", freeText: null };
  return { category: "OTHER", freeText: text };
}

/** UNKNOWN when the customer declines to explain — recorded, never re-asked
 * (spec s.12: "If customer does not want to answer: do not ask again."). */
export function unknownDeclineReason(): DeclineReasonResult {
  return { category: "UNKNOWN", freeText: null };
}

export interface DeclineReasonConversationFlags {
  declineReasonAsked?: boolean;
  declineReasonCategory?: DeclineReasonCategory;
}

/** Ask-once gate: true only if Mira has never asked this conversation for a
 * decline reason yet. Reads/writes the flag through the conversation's
 * existing collectedFields Json blob — no new column. */
export function shouldAskDeclineReason(flags: DeclineReasonConversationFlags | null | undefined): boolean {
  return !flags?.declineReasonAsked;
}
