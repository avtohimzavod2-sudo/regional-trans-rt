// Seed training corpus (MIRA KYRGYZ TRAINING). Every entry here is
// synthetic — no real user conversation has been imported. This is
// deliberately small and hand-curated rather than scraped or generated in
// bulk, per the "don't claim full training" constraint: it exists to prove
// the pipeline (levels -> corpus -> benchmark -> KPI -> certification)
// works end to end, not to represent a finished training set.
import type { Language } from "@prisma/client";
import type { MiraNormalizedFields, MiraRoleValue } from "../types";
import { SYNTHETIC_PROVENANCE, validateProvenance, type ProvenanceMetadata } from "./provenance";
import { isValidLevel } from "./levels";

export interface TrainingCorpusEntry {
  level: number;
  category?: string;
  input: string;
  inputType: "TEXT" | "VOICE_TRANSCRIPT";
  language?: Language;
  dialect?: string;
  containsTypos?: boolean;
  containsRussianMix?: boolean;
  containsMissingKyrgyzLetters?: boolean;
  expectedRole?: MiraRoleValue;
  expectedIntent?: string;
  expectedNormalizedData?: MiraNormalizedFields;
  provenance: ProvenanceMetadata;
  notes?: string;
}

export const TRAINING_CORPUS: TrainingCorpusEntry[] = [
  {
    level: 1,
    category: "driver-offer",
    input: "Эртең Бишкектен Караколго саат жетиде кетем, үч орун бар",
    inputType: "TEXT",
    language: "KY",
    expectedRole: "DRIVER",
    expectedIntent: "trip_offer",
    expectedNormalizedData: { from: "BISHKEK", to: "KARAKOL", date: "TOMORROW", time: "07:00", seatsAvailable: 3 },
    provenance: SYNTHETIC_PROVENANCE,
  },
  {
    level: 7,
    category: "driver-offer",
    input: "Erten Bishkekten Karakolgo saat 7de ketem 3 orun bar",
    inputType: "TEXT",
    language: "KY",
    containsMissingKyrgyzLetters: true,
    expectedRole: "DRIVER",
    expectedIntent: "trip_offer",
    expectedNormalizedData: { from: "BISHKEK", to: "KARAKOL", date: "TOMORROW", time: "07:00", seatsAvailable: 3 },
    provenance: SYNTHETIC_PROVENANCE,
    notes: "Kyrgyz typed on a Russian keyboard — no ң/ө/ү.",
  },
  {
    level: 8,
    category: "driver-offer",
    input: "erte bishkekten karakolgo ketem 3 orun bar",
    inputType: "TEXT",
    language: "KY",
    expectedRole: "DRIVER",
    expectedIntent: "trip_offer",
    expectedNormalizedData: { from: "BISHKEK", to: "KARAKOL", date: "TOMORROW", seatsAvailable: 3 },
    provenance: SYNTHETIC_PROVENANCE,
    notes: "Romanized Kyrgyz, Latin script.",
  },
  {
    level: 12,
    category: "driver-offer",
    input: "Эртен Бишкектен Каракол тарапка едем, места 3",
    inputType: "TEXT",
    language: "KY",
    containsRussianMix: true,
    expectedRole: "DRIVER",
    expectedIntent: "trip_offer",
    expectedNormalizedData: { from: "BISHKEK", to: "KARAKOL", date: "TOMORROW", seatsAvailable: 3 },
    provenance: SYNTHETIC_PROVENANCE,
    notes: "KY/RU code-switch — 'едем' and 'места' are Russian mid-sentence.",
  },
  {
    level: 11,
    category: "driver-offer",
    input: "ертен бишкектн караколг кетем 3 орн бар",
    inputType: "TEXT",
    language: "KY",
    containsTypos: true,
    expectedRole: "DRIVER",
    expectedIntent: "trip_offer",
    expectedNormalizedData: { from: "BISHKEK", to: "KARAKOL", date: "TOMORROW", seatsAvailable: 3 },
    provenance: SYNTHETIC_PROVENANCE,
    notes: "Dropped letters — must still recover route and seat count.",
  },
  {
    level: 14,
    category: "passenger-request",
    input: "Здравствуйте, нужно 2 места из Бишкека в Ош завтра утром",
    inputType: "TEXT",
    language: "RU",
    expectedRole: "PASSENGER",
    expectedIntent: "trip_request",
    expectedNormalizedData: { from: "BISHKEK", to: "OSH", date: "TOMORROW", passengerCount: 2 },
    provenance: SYNTHETIC_PROVENANCE,
  },
  {
    level: 16,
    category: "tourist-request",
    input: "Hi, I need a ride for 2 people from Bishkek to Issyk-Kul tomorrow",
    inputType: "TEXT",
    language: "EN",
    expectedRole: "TOURIST",
    expectedIntent: "trip_request",
    expectedNormalizedData: { from: "BISHKEK", date: "TOMORROW", passengerCount: 2 },
    provenance: SYNTHETIC_PROVENANCE,
  },
  {
    level: 21,
    category: "phone-extraction",
    input: "Байланыш үчүн номерим 0555123456, Бишкектен Ошко эртең",
    inputType: "TEXT",
    language: "KY",
    expectedRole: "PASSENGER",
    expectedIntent: "trip_request",
    expectedNormalizedData: { from: "BISHKEK", to: "OSH", date: "TOMORROW", phone: "0555123456" },
    provenance: SYNTHETIC_PROVENANCE,
  },
  {
    level: 23,
    category: "parcel",
    input: "Бишкектен Нарынга посылка жиберем эртең",
    inputType: "TEXT",
    language: "KY",
    expectedRole: "PARCEL_SENDER",
    expectedIntent: "parcel_request",
    expectedNormalizedData: { from: "BISHKEK", to: "NARYN", date: "TOMORROW" },
    provenance: SYNTHETIC_PROVENANCE,
  },
  {
    level: 22,
    category: "clarification",
    input: "Ошко орун керек",
    inputType: "TEXT",
    language: "KY",
    expectedRole: "PASSENGER",
    expectedIntent: "trip_request",
    expectedNormalizedData: { to: "OSH" },
    provenance: SYNTHETIC_PROVENANCE,
    notes: "Missing 'from' and date — Mira should ask only for those, not repeat 'to'.",
  },
];

export function validateCorpusEntry(entry: TrainingCorpusEntry): string[] {
  const errors: string[] = [];
  if (!isValidLevel(entry.level)) errors.push(`level ${entry.level} is not a valid curriculum level`);
  if (!entry.input.trim()) errors.push("input must not be empty");
  errors.push(...validateProvenance(entry.provenance));
  return errors;
}

export function validateCorpus(entries: TrainingCorpusEntry[] = TRAINING_CORPUS): Record<number, string[]> {
  const invalid: Record<number, string[]> = {};
  entries.forEach((entry, i) => {
    const errors = validateCorpusEntry(entry);
    if (errors.length > 0) invalid[i] = errors;
  });
  return invalid;
}
