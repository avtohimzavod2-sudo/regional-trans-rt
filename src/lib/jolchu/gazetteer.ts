// Jolchu's own small reference gazetteer — deliberately NOT coupled to the
// unrelated `Stop` model (src/lib/agents/route.ts's corridor stops), which
// has no coordinates and belongs to a different agent's domain. This is the
// kind of "known hubs / known landmarks" reference data the mandatory
// monthly data-refresh cycle (see data-refresh.ts) is meant to keep current.
// Used by MockRouteProvider (deterministic geocoding without any API key)
// and by last-mile hub detection (route/last-mile.ts).

export interface KnownHub {
  key: string;
  aliases: string[]; // lowercased, matched as substrings
  nameRu: string;
  nameKy: string;
  latitude: number;
  longitude: number;
}

export const KNOWN_HUBS: KnownHub[] = [
  {
    key: "BISHKEK",
    aliases: ["бишкек", "бишкектен", "бишкекке", "бишкекте", "bishkek"],
    nameRu: "Бишкек",
    nameKy: "Бишкек",
    latitude: 42.8746,
    longitude: 74.5698,
  },
  {
    key: "BALYKCHY",
    aliases: ["балыкчы", "балыкчыдан", "балыкчыга", "balykchy"],
    nameRu: "Балыкчы",
    nameKy: "Балыкчы",
    latitude: 42.4611,
    longitude: 76.1867,
  },
  {
    key: "CHOLPON_ATA",
    aliases: ["чолпон-ата", "чолпон ата", "cholpon-ata", "cholpon ata"],
    nameRu: "Чолпон-Ата",
    nameKy: "Чолпон-Ата",
    latitude: 42.6503,
    longitude: 77.0864,
  },
  {
    key: "BOSTERI",
    aliases: ["бостери", "bosteri"],
    nameRu: "Бостери",
    nameKy: "Бостери",
    latitude: 42.6244,
    longitude: 77.2419,
  },
  {
    key: "KARAKOL",
    aliases: ["каракол", "караколго", "караколдон", "караколго", "karakol"],
    nameRu: "Каракол",
    nameKy: "Каракол",
    latitude: 42.4907,
    longitude: 78.3931,
  },
  {
    key: "OSH",
    aliases: ["ош", "оштон", "ошко", "ошто", "osh"],
    nameRu: "Ош",
    nameKy: "Ош",
    latitude: 40.5283,
    longitude: 72.7985,
  },
  {
    key: "NARYN",
    aliases: ["нарын", "нарынга", "нарындан", "naryn"],
    nameRu: "Нарын",
    nameKy: "Нарын",
    latitude: 41.4288,
    longitude: 75.9911,
  },
  {
    key: "JALAL_ABAD",
    aliases: ["жалал-абад", "джалал-абад", "жалалабад", "jalal-abad"],
    nameRu: "Жалал-Абад",
    nameKy: "Жалал-Абад",
    latitude: 40.9333,
    longitude: 73.0,
  },
  {
    key: "TALAS",
    aliases: ["талас", "talas"],
    nameRu: "Талас",
    nameKy: "Талас",
    latitude: 42.5226,
    longitude: 72.2419,
  },
  {
    key: "MANAS_AIRPORT",
    aliases: ["манас аэропорт", "аэропорт манас", "manas airport", "аэропорт манас атындагы"],
    nameRu: "Аэропорт Манас",
    nameKy: "Манас аэропорту",
    latitude: 43.0613,
    longitude: 74.4776,
  },
];

export interface KnownLandmark {
  key: string;
  aliases: string[];
  nameRu: string;
  latitude: number;
  longitude: number;
  /** These are intentionally ambiguous in real life; the mock provider uses
   * this to exercise the confidence/ambiguity path deterministically. */
  ambiguous?: boolean;
}

export const KNOWN_LANDMARKS: KnownLandmark[] = [
  {
    key: "OSH_BAZAAR",
    aliases: ["ош базар", "ошский рынок", "osh bazaar"],
    nameRu: "Ошский рынок (Бишкек)",
    latitude: 42.8752,
    longitude: 74.5866,
  },
  {
    key: "TSUM",
    aliases: ["цум"],
    nameRu: "ЦУМ (Бишкек)",
    latitude: 42.8765,
    longitude: 74.6039,
  },
  {
    key: "ALAMEDIN_AMBIGUOUS",
    aliases: ["аламедин"],
    nameRu: "Аламедин (рынок/район/село — требует уточнения)",
    latitude: 42.8801,
    longitude: 74.6512,
    ambiguous: true,
  },
];

export function findKnownHubByText(normalizedText: string): KnownHub | null {
  for (const hub of KNOWN_HUBS) {
    if (hub.aliases.some((alias) => normalizedText.includes(alias))) return hub;
  }
  return null;
}
