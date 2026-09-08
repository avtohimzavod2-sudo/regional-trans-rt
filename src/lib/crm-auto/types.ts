// CRM Auto — pure types. CRM Auto services Drive CRM: it owns exactly one
// append-only Prisma model (DriveCrmEvent — see prisma/schema.prisma) and
// tracks four concepts only: operational ETA, breakdown/incident, backhaul
// opportunity, operational history. It never owns Mira CRM, never replaces
// RT OFFICE's demand<->supply matching, never orchestrates other RT agents,
// and never calculates money (spec PART 1/3).
import type { DriveCrmEventType, DriveCrmIncidentStatus } from "@prisma/client";

export interface RecordOperationalEventInput {
  driverId: string;
  /** Loose correlation id, deliberately not a Prisma relation — same
   * pattern as MiraConversation.collectedFields.pendingDeclineMatchId. */
  tripId?: string;
  offerId?: string;
  eventType: DriveCrmEventType;
  /** Only meaningful when eventType = BREAKDOWN_INCIDENT. */
  incidentStatus?: DriveCrmIncidentStatus;
  /** Only meaningful when eventType = OPERATIONAL_ETA. Must come from a
   * verified upstream calculation (e.g. Jolchu) — never invented here. */
  etaMinutes?: number;
  /** e.g. "JOLCHU", "DRIVER_REPORT", "RT_OFFICE", "SYSTEM" — never blank. */
  source: string;
  details?: Record<string, unknown>;
  /** Only meaningful when eventType = CORRECTION: the loose correlation id
   * (not a Prisma relation, same reasoning as tripId/offerId) of the earlier
   * DriveCrmEvent this row corrects. A CORRECTION never updates or deletes
   * that row — it is a new appended fact that supersedes it in meaning while
   * preserving full historical auditability. */
  correctsEventId?: string;
  /** Guards against duplicate webhook/event delivery re-recording the same fact. */
  idempotencyKey: string;
}

export interface RecordOperationalEventOutcome {
  eventId: string;
  /** True when this call was a duplicate delivery and the already-recorded
   * event was returned instead of creating a second row. */
  deduplicated: boolean;
}
