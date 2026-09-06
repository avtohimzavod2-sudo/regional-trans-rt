// The 30 mandatory Jolchu benchmark scenarios. Split into two kinds:
//  - ROUTING_DECISION cases exercise decideJolchuRouting() in isolation —
//    the Mira<->Jolchu contract that must stay silent on ordinary chat.
//  - FULL_RESOLUTION cases exercise resolveRouteIntelligence() end to end,
//    including deliberately-injected failing providers (see test-doubles.ts)
//    for the fallback/outage scenarios, so nothing here needs a real API key.
import { MockRouteProvider } from "../route-providers/mock";
import { MockJolchuModelProvider } from "../providers/mock";
import { FailingRouteProvider, FailingJolchuModelProvider } from "./test-doubles";
import type { LocationResolutionDeps } from "../location/resolver";
import type {
  JolchuInputTypeValue,
  JolchuLocationInput,
  JolchuReasonCode,
  JolchuRequestStatusValue,
  TrafficStatusValue,
} from "../types";

export type JolchuBenchmarkCategory =
  | "ROUTING_DECISION"
  | "LOCATION_RESOLUTION"
  | "ROUTE_CALCULATION"
  | "AMBIGUITY"
  | "LAST_MILE"
  | "TRAFFIC"
  | "FALLBACK";

interface RoutingDecisionCase {
  kind: "ROUTING_DECISION";
  code: string;
  description: string;
  category: JolchuBenchmarkCategory;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  tags: string[];
  inputType: JolchuInputTypeValue;
  rawInput: string;
  expectedJolchuRequired: boolean;
  expectedReasonCode: JolchuReasonCode | null;
}

interface FullResolutionCase {
  kind: "FULL_RESOLUTION";
  code: string;
  description: string;
  category: JolchuBenchmarkCategory;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  tags: string[];
  inputType: JolchuInputTypeValue;
  rawInput: string;
  request: {
    reasonCode: JolchuReasonCode;
    origin?: JolchuLocationInput;
    destination?: JolchuLocationInput;
    waypoints?: JolchuLocationInput[];
    deps?: Partial<LocationResolutionDeps>;
  };
  expectedStatus: JolchuRequestStatusValue;
  expectedAmbiguity?: boolean;
  expectedAmbiguityCandidateCount?: number;
  expectedWaypointCount?: number;
  expectedLastMileDetected?: boolean;
  expectedTrafficStatus?: TrafficStatusValue;
  expectedRouteHallucinationForbidden?: boolean;
}

export type JolchuBenchmarkCase = RoutingDecisionCase | FullResolutionCase;

const mockDeps = (): LocationResolutionDeps => ({
  modelProvider: new MockJolchuModelProvider(),
  fallbackModelProvider: new MockJolchuModelProvider(),
  routeProvider: new MockRouteProvider(),
  fallbackRouteProvider: null,
});

export const BENCHMARK_CASES: JolchuBenchmarkCase[] = [
  // --- Routing decision: ordinary chat must NEVER activate Jolchu (5) ---
  {
    kind: "ROUTING_DECISION",
    code: "JLC-01",
    description: "Greeting must not trigger Jolchu",
    category: "ROUTING_DECISION",
    difficulty: "EASY",
    tags: ["negative", "greeting"],
    inputType: "UNKNOWN",
    rawInput: "Салам! Кандайсыз?",
    expectedJolchuRequired: false,
    expectedReasonCode: null,
  },
  {
    kind: "ROUTING_DECISION",
    code: "JLC-02",
    description: "Price/fare question must not trigger Jolchu (tariff is a separate future agent)",
    category: "ROUTING_DECISION",
    difficulty: "EASY",
    tags: ["negative", "price"],
    inputType: "UNKNOWN",
    rawInput: "Ошко чейин билет канчадан турат?",
    expectedJolchuRequired: false,
    expectedReasonCode: null,
  },
  {
    kind: "ROUTING_DECISION",
    code: "JLC-03",
    description: "Plain corridor trip request between known cities is handled by the existing ROUTE agent, not Jolchu",
    category: "ROUTING_DECISION",
    difficulty: "MEDIUM",
    tags: ["negative", "corridor"],
    inputType: "UNKNOWN",
    rawInput: "Бишкектен Ошко эртеӊ 2 орун керек",
    expectedJolchuRequired: false,
    expectedReasonCode: null,
  },
  {
    kind: "ROUTING_DECISION",
    code: "JLC-04",
    description: "Farewell must not trigger Jolchu",
    category: "ROUTING_DECISION",
    difficulty: "EASY",
    tags: ["negative", "farewell"],
    inputType: "UNKNOWN",
    rawInput: "Рахмат, саламатта болуӊуз",
    expectedJolchuRequired: false,
    expectedReasonCode: null,
  },
  {
    kind: "ROUTING_DECISION",
    code: "JLC-05",
    description: "Document/FAQ question must not trigger Jolchu",
    category: "ROUTING_DECISION",
    difficulty: "EASY",
    tags: ["negative", "faq"],
    inputType: "UNKNOWN",
    rawInput: "Жол үчүн кандай документтер керек?",
    expectedJolchuRequired: false,
    expectedReasonCode: null,
  },

  // --- Routing decision: real geo complexity must activate Jolchu (10) ---
  {
    kind: "ROUTING_DECISION",
    code: "JLC-06",
    description: "Raw coordinates in message text trigger LOCATION_RESOLUTION",
    category: "ROUTING_DECISION",
    difficulty: "EASY",
    tags: ["positive", "coordinates"],
    inputType: "COORDINATES",
    rawInput: "42.8746,74.5698 дегенге алып барыңызчы",
    expectedJolchuRequired: true,
    expectedReasonCode: "LOCATION_RESOLUTION",
  },
  {
    kind: "ROUTING_DECISION",
    code: "JLC-07",
    description: "Google Maps link triggers LOCATION_RESOLUTION",
    category: "ROUTING_DECISION",
    difficulty: "EASY",
    tags: ["positive", "google-maps-link"],
    inputType: "GOOGLE_MAPS_LINK",
    rawInput: "вот локация https://maps.google.com/?q=42.87,74.59",
    expectedJolchuRequired: true,
    expectedReasonCode: "LOCATION_RESOLUTION",
  },
  {
    kind: "ROUTING_DECISION",
    code: "JLC-08",
    description: "Traffic question triggers TRAFFIC_CHECK",
    category: "ROUTING_DECISION",
    difficulty: "EASY",
    tags: ["positive", "traffic"],
    inputType: "UNKNOWN",
    rawInput: "Бишкекте азыр пробка барбы?",
    expectedJolchuRequired: true,
    expectedReasonCode: "TRAFFIC_CHECK",
  },
  {
    kind: "ROUTING_DECISION",
    code: "JLC-09",
    description: "ETA question triggers TRAFFIC_CHECK",
    category: "ROUTING_DECISION",
    difficulty: "MEDIUM",
    tags: ["positive", "eta"],
    inputType: "UNKNOWN",
    rawInput: "Ошко качан жетем?",
    expectedJolchuRequired: true,
    expectedReasonCode: "TRAFFIC_CHECK",
  },
  {
    kind: "ROUTING_DECISION",
    code: "JLC-10",
    description: "Last Mile phrasing (beyond a settlement) triggers LAST_MILE",
    category: "ROUTING_DECISION",
    difficulty: "MEDIUM",
    tags: ["positive", "last-mile"],
    inputType: "UNKNOWN",
    rawInput: "После Каракола еще 10 км до села",
    expectedJolchuRequired: true,
    expectedReasonCode: "LAST_MILE",
  },
  {
    kind: "ROUTING_DECISION",
    code: "JLC-11",
    description: "Explicit request for exact-address clarification triggers AMBIGUITY_CHECK",
    category: "ROUTING_DECISION",
    difficulty: "MEDIUM",
    tags: ["positive", "ambiguity"],
    inputType: "UNKNOWN",
    rawInput: "Так эмне жерге, уточните адрес?",
    expectedJolchuRequired: true,
    expectedReasonCode: "AMBIGUITY_CHECK",
  },
  {
    kind: "ROUTING_DECISION",
    code: "JLC-12",
    description: "Landmark/ориентир phrasing triggers LOCATION_RESOLUTION",
    category: "ROUTING_DECISION",
    difficulty: "MEDIUM",
    tags: ["positive", "landmark"],
    inputType: "LANDMARK",
    rawInput: "Ош базардын жанында тосуп алыңыз",
    expectedJolchuRequired: true,
    expectedReasonCode: "LOCATION_RESOLUTION",
  },
  {
    kind: "ROUTING_DECISION",
    code: "JLC-13",
    description: "Settlement-without-street phrasing triggers LOCATION_RESOLUTION",
    category: "ROUTING_DECISION",
    difficulty: "MEDIUM",
    tags: ["positive", "settlement-only"],
    inputType: "SETTLEMENT_ONLY",
    rawInput: "Токмок районундагы кичине айылга алып барыңыз",
    expectedJolchuRequired: true,
    expectedReasonCode: "LOCATION_RESOLUTION",
  },
  {
    kind: "ROUTING_DECISION",
    code: "JLC-14",
    description: "Explicit route/distance question triggers ROUTE_CALCULATION",
    category: "ROUTING_DECISION",
    difficulty: "EASY",
    tags: ["positive", "route-building"],
    inputType: "UNKNOWN",
    rawInput: "Бишкектен Ошко чейинки маршрут канча км болот?",
    expectedJolchuRequired: true,
    expectedReasonCode: "ROUTE_CALCULATION",
  },
  {
    kind: "ROUTING_DECISION",
    code: "JLC-15",
    description: "2GIS link triggers LOCATION_RESOLUTION",
    category: "ROUTING_DECISION",
    difficulty: "EASY",
    tags: ["positive", "2gis-link"],
    inputType: "TWO_GIS_LINK",
    rawInput: "вот точка https://2gis.kg/bishkek/geo/74.5698,42.8746",
    expectedJolchuRequired: true,
    expectedReasonCode: "LOCATION_RESOLUTION",
  },

  // --- Full resolution: each input type Jolchu must understand (5) ---
  {
    kind: "FULL_RESOLUTION",
    code: "JLC-16",
    description: "Raw coordinates resolve directly, no route provider call needed",
    category: "LOCATION_RESOLUTION",
    difficulty: "EASY",
    tags: ["coordinates"],
    inputType: "COORDINATES",
    rawInput: "42.8746,74.5698",
    request: { reasonCode: "LOCATION_RESOLUTION", origin: "42.8746,74.5698", deps: mockDeps() },
    expectedStatus: "RESOLVED",
  },
  {
    kind: "FULL_RESOLUTION",
    code: "JLC-17",
    description: "Google Maps link with embedded coordinates resolves without geocoding",
    category: "LOCATION_RESOLUTION",
    difficulty: "EASY",
    tags: ["google-maps-link"],
    inputType: "GOOGLE_MAPS_LINK",
    rawInput: "https://maps.google.com/?q=42.8746,74.5698",
    request: { reasonCode: "LOCATION_RESOLUTION", origin: "https://maps.google.com/?q=42.8746,74.5698", deps: mockDeps() },
    expectedStatus: "RESOLVED",
  },
  {
    kind: "FULL_RESOLUTION",
    code: "JLC-18",
    description: "2GIS /geo/ link resolves with correct lon,lat -> lat,lon reordering",
    category: "LOCATION_RESOLUTION",
    difficulty: "MEDIUM",
    tags: ["2gis-link", "coordinate-order"],
    inputType: "TWO_GIS_LINK",
    rawInput: "https://2gis.kg/bishkek/geo/74.5698,42.8746",
    request: { reasonCode: "LOCATION_RESOLUTION", origin: "https://2gis.kg/bishkek/geo/74.5698,42.8746", deps: mockDeps() },
    expectedStatus: "RESOLVED",
  },
  {
    kind: "FULL_RESOLUTION",
    code: "JLC-19",
    description: "Telegram/WhatsApp-style live location payload resolves with high confidence",
    category: "LOCATION_RESOLUTION",
    difficulty: "EASY",
    tags: ["live-location"],
    inputType: "LIVE_LOCATION",
    rawInput: "{live location payload}",
    request: { reasonCode: "LOCATION_RESOLUTION", origin: { latitude: 42.8746, longitude: 74.5698, isLivePayload: true }, deps: mockDeps() },
    expectedStatus: "RESOLVED",
  },
  {
    kind: "FULL_RESOLUTION",
    code: "JLC-20",
    description: "Known settlement name (no street) resolves via gazetteer geocoding",
    category: "LOCATION_RESOLUTION",
    difficulty: "MEDIUM",
    tags: ["settlement-only"],
    inputType: "SETTLEMENT_ONLY",
    rawInput: "Бишкек",
    request: { reasonCode: "LOCATION_RESOLUTION", origin: "Бишкек", deps: mockDeps() },
    expectedStatus: "RESOLVED",
  },

  // --- Landmark, mixed language, ambiguity (5) ---
  {
    kind: "FULL_RESOLUTION",
    code: "JLC-21",
    description: "Known landmark text resolves and the landmark field is populated",
    category: "LOCATION_RESOLUTION",
    difficulty: "MEDIUM",
    tags: ["landmark"],
    inputType: "LANDMARK",
    rawInput: "Ош базар",
    request: { reasonCode: "LOCATION_RESOLUTION", origin: "Ош базар", deps: mockDeps() },
    expectedStatus: "RESOLVED",
  },
  {
    kind: "FULL_RESOLUTION",
    code: "JLC-22",
    description: "Ambiguous landmark (Аламедин: market/district/village) must return NEEDS_CONFIRMATION, never a guessed point",
    category: "AMBIGUITY",
    difficulty: "HARD",
    tags: ["ambiguity", "no-guessing"],
    inputType: "LANDMARK",
    rawInput: "Аламедин",
    request: { reasonCode: "AMBIGUITY_CHECK", origin: "Аламедин", deps: mockDeps() },
    expectedStatus: "NEEDS_CONFIRMATION",
    expectedAmbiguity: true,
    expectedAmbiguityCandidateCount: 3,
  },
  {
    kind: "FULL_RESOLUTION",
    code: "JLC-23",
    description: "Unresolvable free-text input must fail rather than fabricate a location",
    category: "LOCATION_RESOLUTION",
    difficulty: "MEDIUM",
    tags: ["no-hallucination"],
    inputType: "TEXT_ADDRESS",
    rawInput: "жасалма көчө 999, белгисиз жер",
    request: { reasonCode: "LOCATION_RESOLUTION", origin: "жасалма көчө 999, белгисиз жер", deps: mockDeps() },
    expectedStatus: "FAILED",
    expectedRouteHallucinationForbidden: true,
  },
  {
    kind: "FULL_RESOLUTION",
    code: "JLC-24",
    description: "Model provider outage falls back to the mock model and still resolves via geocoding",
    category: "FALLBACK",
    difficulty: "HARD",
    tags: ["fallback", "model-provider"],
    inputType: "LANDMARK",
    rawInput: "Ош базардын жанында",
    request: {
      reasonCode: "LOCATION_RESOLUTION",
      origin: "Ош базардын жанында",
      deps: { modelProvider: new FailingJolchuModelProvider(), fallbackModelProvider: new MockJolchuModelProvider(), routeProvider: new MockRouteProvider(), fallbackRouteProvider: null },
    },
    expectedStatus: "RESOLVED",
  },
  {
    kind: "FULL_RESOLUTION",
    code: "JLC-25",
    description: "Mixed Kyrgyz-Russian phrasing for a known hub still resolves",
    category: "LOCATION_RESOLUTION",
    difficulty: "MEDIUM",
    tags: ["mixed-language"],
    inputType: "TEXT_ADDRESS",
    rawInput: "мне надо в Ош шаарына",
    request: { reasonCode: "LOCATION_RESOLUTION", origin: "мне надо в Ош шаарына", deps: mockDeps() },
    expectedStatus: "RESOLVED",
  },

  // --- Route calculation, Last Mile, fallback chain, waypoints, traffic invariant (5) ---
  {
    kind: "FULL_RESOLUTION",
    code: "JLC-26",
    description: "Full route calculation between two known hubs returns real road distance, not a straight line",
    category: "ROUTE_CALCULATION",
    difficulty: "MEDIUM",
    tags: ["route-calculation"],
    inputType: "TEXT_ADDRESS",
    rawInput: "Бишкектен Караколго чейинки маршрут",
    request: { reasonCode: "ROUTE_CALCULATION", origin: "Бишкек", destination: "Каракол", deps: mockDeps() },
    expectedStatus: "RESOLVED",
  },
  {
    kind: "FULL_RESOLUTION",
    code: "JLC-27",
    description: "Destination beyond a known hub is segmented into MAIN + LAST_MILE",
    category: "LAST_MILE",
    difficulty: "HARD",
    tags: ["last-mile"],
    inputType: "COORDINATES",
    rawInput: "Бишкектен Караколдон 10 км ары жердеги чекитке",
    request: { reasonCode: "LAST_MILE", origin: "Бишкек", destination: "42.40,78.40", deps: mockDeps() },
    expectedStatus: "RESOLVED",
    expectedLastMileDetected: true,
  },
  {
    kind: "FULL_RESOLUTION",
    code: "JLC-28",
    description: "Google Maps down -> 2GIS fallback still produces a resolved route",
    category: "FALLBACK",
    difficulty: "HARD",
    tags: ["fallback", "route-provider"],
    inputType: "TEXT_ADDRESS",
    rawInput: "Бишкектен Ошко чейин (Google Maps убактылуу иштебей турат)",
    request: {
      reasonCode: "ROUTE_CALCULATION",
      origin: "Бишкек",
      destination: "Ош",
      deps: { modelProvider: new MockJolchuModelProvider(), fallbackModelProvider: new MockJolchuModelProvider(), routeProvider: new FailingRouteProvider("google_maps"), fallbackRouteProvider: new MockRouteProvider() },
    },
    expectedStatus: "RESOLVED",
  },
  {
    kind: "FULL_RESOLUTION",
    code: "JLC-29",
    description: "Both route providers unavailable must return ROUTE_PROVIDER_UNAVAILABLE, never a fabricated route",
    category: "FALLBACK",
    difficulty: "HARD",
    tags: ["fallback", "both-down", "no-hallucination"],
    inputType: "LANDMARK",
    rawInput: "Ош базар (эки провайдер тең иштебейт)",
    request: {
      reasonCode: "LOCATION_RESOLUTION",
      origin: "Ош базар",
      deps: { modelProvider: new MockJolchuModelProvider(), fallbackModelProvider: new MockJolchuModelProvider(), routeProvider: new FailingRouteProvider("google_maps"), fallbackRouteProvider: new FailingRouteProvider("two_gis") },
    },
    expectedStatus: "FAILED",
    expectedRouteHallucinationForbidden: true,
  },
  {
    kind: "FULL_RESOLUTION",
    code: "JLC-30",
    description: "Waypoint handling and the mock-mode traffic invariant (never fabricate live traffic/ETA)",
    category: "TRAFFIC",
    difficulty: "MEDIUM",
    tags: ["waypoints", "traffic-invariant", "mock-mode"],
    inputType: "TEXT_ADDRESS",
    rawInput: "Бишкектен Ошко, Балыкчы аркылуу",
    request: { reasonCode: "ROUTE_CALCULATION", origin: "Бишкек", destination: "Ош", waypoints: ["Балыкчы"], deps: mockDeps() },
    expectedStatus: "RESOLVED",
    expectedWaypointCount: 1,
    expectedTrafficStatus: "UNKNOWN",
  },
];
