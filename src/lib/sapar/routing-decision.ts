// The Mira <-> Sapar contract, mirroring src/lib/jolchu/routing-decision.ts.
// decideSaparRouting() decides whether an inbound message is a cargo/parcel
// delivery request, standalone and dependency-free (no import from
// src/lib/mira/**), so Mira calls this, gets a decision, and — if
// required — calls Sapar's orchestrator separately. Unlike Jolchu (a
// backend enrichment), a positive Sapar decision replaces Mira's normal RT
// Command routing for that message: Sapar becomes the primary handler
// (AGENTS spec s.2), not an add-on.
import type { SaparRoutingDecision } from "./types";

// Unambiguous cargo/parcel nouns — a single match is enough on its own.
const CARGO_NOUN_SIGNALS = [
  "посылк",
  "коробк",
  "груз",
  "package",
  "parcel",
  "posylk",
  "box",
  "cargo",
  "запчаст",
  "баштык",
  "сумк",
  "жүк",
  "жук",
  "телевизор",
  "аккумулятор",
  "батаре",
];

// Delivery-action verbs. On their own these can also describe a passenger
// trip ("довезите меня до вокзала"), so a match is suppressed when the text
// looks like it's talking about a person, not cargo (see PERSON_GUARD_SIGNALS).
const DELIVERY_VERB_SIGNALS = ["отправ", "довезт", "доставит", "доставк", "привезт", "жонот", "жеткир", "deliver", "ship "];
const PICKUP_VERB_SIGNALS = ["забер", "заберите", "забрать", "подобрать", "pickup", "pick up"];
const DROPOFF_VERB_SIGNALS = ["отвезт", "отвезти", "привезти"];
const PERSON_GUARD_SIGNALS = ["меня", "нас ", "мени", "биз"];

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function firstMatch(normalized: string, signals: string[]): string | null {
  return signals.find((s) => normalized.includes(s)) ?? null;
}

/** Pure, deterministic, language-agnostic-by-keyword-list routing decision —
 * no LLM call, so it costs nothing to run on every message and never risks
 * a hallucinated "yes, this is a delivery". */
export function decideSaparRouting(text: string): SaparRoutingDecision {
  const normalized = normalize(text);

  const noun = firstMatch(normalized, CARGO_NOUN_SIGNALS);
  if (noun) return { required: true, matchedSignal: noun };

  const isAboutAPerson = PERSON_GUARD_SIGNALS.some((s) => normalized.includes(s));

  const deliveryVerb = firstMatch(normalized, DELIVERY_VERB_SIGNALS);
  if (deliveryVerb && !isAboutAPerson) return { required: true, matchedSignal: deliveryVerb };

  const pickupVerb = firstMatch(normalized, PICKUP_VERB_SIGNALS);
  const dropoffVerb = firstMatch(normalized, DROPOFF_VERB_SIGNALS);
  if (pickupVerb && dropoffVerb && !isAboutAPerson) {
    return { required: true, matchedSignal: "pickup_and_dropoff_combo" };
  }

  return { required: false, matchedSignal: null };
}
