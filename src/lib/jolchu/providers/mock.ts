// MockJolchuModelProvider — fully deterministic, no network calls. Default
// provider for tests/dev/CI. Its "understanding" is intentionally modest: it
// only ever strips filler words and flags landmark/settlement phrasing — it
// never invents a geocode result itself, that stays the RouteProvider's job.
import { KNOWN_LANDMARKS } from "../gazetteer";
import type { JolchuModelProvider, JolchuUnderstandInput, JolchuUnderstandOutput } from "./model-provider";

const LANDMARK_MARKERS = ["возле", "напротив", "рядом с", "около", "после", "не доезжая", "жанында", "боюнда"];
const SETTLEMENT_MARKERS = ["село", "деревня", "айыл", "поселок", "посёлок", "village"];
const FILLER_PREFIXES = /^(эй|алло|привет|салам|здравствуйте)[,!\s]*/i;

export class MockJolchuModelProvider implements JolchuModelProvider {
  readonly providerName = "mock";
  readonly modelId = "mock-deterministic";

  async understand(input: JolchuUnderstandInput): Promise<JolchuUnderstandOutput> {
    const cleaned = input.text.trim().replace(FILLER_PREFIXES, "").trim();
    const normalized = cleaned.toLowerCase();

    const isLandmarkPhrasing = LANDMARK_MARKERS.some((m) => normalized.includes(m));
    const isSettlementOnly = SETTLEMENT_MARKERS.some((m) => normalized.includes(m)) && !/\d/.test(normalized);
    const matchedLandmark = KNOWN_LANDMARKS.find((l) => l.aliases.some((a) => normalized.includes(a)));
    const possiblyAmbiguous = Boolean(matchedLandmark?.ambiguous);

    return {
      geocodeQuery: cleaned || input.text,
      isLandmarkPhrasing,
      isSettlementOnly,
      possiblyAmbiguous,
      notes: matchedLandmark ? `matched known landmark: ${matchedLandmark.key}` : null,
    };
  }
}
