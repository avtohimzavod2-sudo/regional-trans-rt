// The Mira <-> Jolchu contract: Mira calls decideJolchuRouting() with the raw
// user text and decides NO_JOLCHU_REQUIRED vs JOLCHU_REQUIRED with an
// explicit reason. Ordinary chat/FAQ/greetings/unrelated questions — and
// even plain "Бишкектен Ошко 2 орун"-style trip requests between known
// corridor cities, which the existing quick-classify/ROUTE agent already
// handles — must NEVER trigger Jolchu. Jolchu only turns on for real
// geolocation complexity: coordinates, map links, landmarks, ambiguous
// addresses, traffic, ETA, and Last Mile questions.
//
// This module is intentionally standalone (no import from src/lib/mira/**)
// so Jolchu never reasons jointly with Mira — Mira calls this, gets a
// decision, and (if required) calls resolveRouteIntelligence() separately.
import type { JolchuReasonCode, JolchuRoutingDecision } from "./types";

const COORDINATE_SIGNAL = /-?\d{1,3}\.\d+\s*[,;]\s*-?\d{1,3}\.\d+/;
const MAP_LINK_SIGNAL = /(maps\.google\.[a-z.]+|goo\.gl\/maps|maps\.app\.goo\.gl|2gis\.[a-z.]+|go\.2gis\.com)/i;

const TRAFFIC_SIGNALS = ["пробк", "загружен", "затор", "traffic", "жол кыймылы"];
const ETA_SIGNALS = ["сколько ехать", "сколько времени", "во сколько приед", "eta", "качан жетем", "качан барам"];
const LAST_MILE_SIGNALS = ["после", "не доезжая", "за городом", "дальше города", "чыгаар алдында", "боюнда"];
const LANDMARK_SIGNALS = ["возле", "напротив", "рядом с", "около", "на трассе", "ориентир", "жанында", "маңдайында"];
const AMBIGUITY_SIGNALS = ["где именно", "какой из", "уточните адрес", "точный адрес"];
const ROUTE_BUILDING_SIGNALS = ["маршрут", "расстояние", "сколько км", "далеко ли", "маршрутту"];
const SETTLEMENT_ONLY_SIGNALS = ["село", "деревня", "айыл", "поселок", "посёлок"];

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function firstMatch(normalized: string, signals: string[]): string | null {
  return signals.find((s) => normalized.includes(s)) ?? null;
}

/** Pure, deterministic, language-agnostic-by-keyword-list routing decision —
 * no LLM call, so it costs nothing to run on every message and never risks
 * a hallucinated "yes, call Jolchu". */
export function decideJolchuRouting(text: string): JolchuRoutingDecision {
  const normalized = normalize(text);

  if (COORDINATE_SIGNAL.test(text)) {
    return { required: true, reasonCode: "LOCATION_RESOLUTION", matchedSignal: "coordinate_pattern" };
  }
  if (MAP_LINK_SIGNAL.test(text)) {
    return { required: true, reasonCode: "LOCATION_RESOLUTION", matchedSignal: "map_link" };
  }

  const traffic = firstMatch(normalized, TRAFFIC_SIGNALS);
  if (traffic) return { required: true, reasonCode: "TRAFFIC_CHECK", matchedSignal: traffic };

  const eta = firstMatch(normalized, ETA_SIGNALS);
  if (eta) return { required: true, reasonCode: "TRAFFIC_CHECK", matchedSignal: eta };

  const lastMile = firstMatch(normalized, LAST_MILE_SIGNALS);
  if (lastMile) return { required: true, reasonCode: "LAST_MILE", matchedSignal: lastMile };

  const ambiguity = firstMatch(normalized, AMBIGUITY_SIGNALS);
  if (ambiguity) return { required: true, reasonCode: "AMBIGUITY_CHECK", matchedSignal: ambiguity };

  const landmark = firstMatch(normalized, LANDMARK_SIGNALS);
  if (landmark) return { required: true, reasonCode: "LOCATION_RESOLUTION", matchedSignal: landmark };

  const settlementOnly = firstMatch(normalized, SETTLEMENT_ONLY_SIGNALS);
  if (settlementOnly) return { required: true, reasonCode: "LOCATION_RESOLUTION", matchedSignal: settlementOnly };

  const routeBuilding = firstMatch(normalized, ROUTE_BUILDING_SIGNALS);
  if (routeBuilding) return { required: true, reasonCode: "ROUTE_CALCULATION", matchedSignal: routeBuilding };

  return { required: false, reasonCode: null, matchedSignal: null };
}

export type { JolchuReasonCode, JolchuRoutingDecision };
