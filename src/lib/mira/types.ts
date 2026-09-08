// Shared Mira types. Kept dependency-free (no db/provider imports) so every
// other Mira module can import from here without cycles.
import type { Language } from "@prisma/client";

export type MiraRoleValue =
  | "PASSENGER"
  | "DRIVER"
  | "DISPATCHER"
  | "INTERMEDIARY"
  | "PARCEL_SENDER"
  | "PARTNER"
  | "TOURIST"
  | "UNKNOWN";

export type MiraChannel = "WHATSAPP" | "TELEGRAM_BOT" | "TELEGRAM_GROUP";

/** Structured fields Mira normalizes a conversation towards. Every field is
 * optional — only what the user actually said is ever filled in. */
export interface MiraNormalizedFields {
  from?: string | null;
  to?: string | null;
  date?: string | null; // ISO yyyy-mm-dd or a relative-word token resolved upstream
  time?: string | null; // HH:mm
  passengerCount?: number | null;
  seatsAvailable?: number | null;
  seatsRequired?: number | null;
  phone?: string | null;
  car?: string | null;
  plate?: string | null;
  price?: number | null;
  luggage?: string | null;
  children?: boolean | null;
  genderPreference?: "FEMALE_ONLY" | null;
  parcel?: string | null;
  pickup?: string | null;
  dropOff?: string | null;
  returnRoute?: boolean | null;
  lastMile?: boolean | null;
  notes?: string | null;
  // Mira Pass 1 spec s.12 — correlates a passenger's pending WhatsApp button
  // decline back to its Match row for the next free-text reply, without a
  // new Match/TripRequest schema field (reuses this existing Json column
  // instead, per spec s.23: prefer EXTEND/REUSE over a new model/column).
  pendingDeclineMatchId?: string | null;
}

export const REQUIRED_FIELDS_BY_ROLE: Record<string, (keyof MiraNormalizedFields)[]> = {
  PASSENGER: ["from", "to", "date", "passengerCount"],
  DRIVER: ["from", "to", "date", "seatsAvailable"],
  PARCEL_SENDER: ["from", "to"],
};

// Maps src/lib/agents/quick-classify.ts's MessageRole onto Mira's richer role
// set, so both the mock provider and the orchestrator's fast-layer fallback
// agree on the same mapping.
const QUICK_ROLE_TO_MIRA_ROLE: Record<string, MiraRoleValue> = {
  passenger: "PASSENGER",
  driver: "DRIVER",
  parcel_sender: "PARCEL_SENDER",
  dispatcher: "DISPATCHER",
  mixed: "UNKNOWN",
  unknown: "UNKNOWN",
};

export function mapQuickRoleToMiraRole(quickRole: string): MiraRoleValue {
  return QUICK_ROLE_TO_MIRA_ROLE[quickRole] ?? "UNKNOWN";
}

/** The strict internal contract Mira builds from raw inbound input before
 * talking to RT Command. Mirrors AGENTS.md section 21 (MiraInboundEnvelope). */
export interface MiraInboundEnvelope {
  channel: MiraChannel;
  messageId?: string;
  conversationId: string;
  actor: { externalUserId: string; username?: string | null };
  rawText: string;
  audioRef?: string | null;
  transcript?: string | null;
  language: Language;
  languageConfidence: number;
  role: MiraRoleValue;
  roleConfidence: number;
  intent: string;
  intentConfidence: number;
  entities: MiraNormalizedFields;
  normalizedRequest: MiraNormalizedFields;
  uncertainties: string[];
  requiresClarification: boolean;
  traceId?: string;
}
