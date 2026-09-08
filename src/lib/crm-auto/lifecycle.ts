// CRM Auto — pure, deterministic validation. No DB access here (same split
// as matching/engine.ts vs matching/orchestrate.ts). Critical transitions
// (e.g. resolving a breakdown) must be deterministic code, not a free-form
// LLM decision (spec s.8).
import type { DriveCrmEventType, DriveCrmIncidentStatus } from "@prisma/client";

export interface OperationalEventDraft {
  eventType: DriveCrmEventType;
  incidentStatus?: DriveCrmIncidentStatus;
  etaMinutes?: number;
  source: string;
  /** Only meaningful when eventType = CORRECTION. */
  correctsEventId?: string;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateOperationalEvent(draft: OperationalEventDraft): ValidationResult {
  if (!draft.source || draft.source.trim().length === 0) {
    return { valid: false, reason: "source must not be blank — CRM Auto never records an unattributed fact" };
  }

  if (draft.eventType === "OPERATIONAL_ETA") {
    if (draft.etaMinutes === undefined || draft.etaMinutes === null) {
      return { valid: false, reason: "OPERATIONAL_ETA requires a verified etaMinutes value — CRM Auto never invents an ETA" };
    }
    if (draft.etaMinutes < 0) {
      return { valid: false, reason: "etaMinutes must not be negative" };
    }
  } else if (draft.etaMinutes !== undefined) {
    return { valid: false, reason: "etaMinutes is only meaningful for OPERATIONAL_ETA" };
  }

  if (draft.eventType === "BREAKDOWN_INCIDENT") {
    if (!draft.incidentStatus) {
      return { valid: false, reason: "BREAKDOWN_INCIDENT requires an incidentStatus (OPEN or RESOLVED)" };
    }
  } else if (draft.incidentStatus) {
    return { valid: false, reason: "incidentStatus is only meaningful for BREAKDOWN_INCIDENT" };
  }

  if (draft.eventType === "CORRECTION") {
    if (!draft.correctsEventId || draft.correctsEventId.trim().length === 0) {
      return { valid: false, reason: "CORRECTION requires a non-blank correctsEventId — an exceptional correction must reference the exact event it corrects" };
    }
  } else if (draft.correctsEventId) {
    return { valid: false, reason: "correctsEventId is only meaningful for CORRECTION" };
  }

  return { valid: true };
}

/** A RESOLVED breakdown event may only be recorded when an OPEN incident
 * currently exists for that driver — CRM Auto never invents a resolution
 * out of thin air, and never lets two OPEN incidents silently coexist. */
export function canResolveBreakdown(hasOpenIncident: boolean): ValidationResult {
  if (!hasOpenIncident) {
    return { valid: false, reason: "no OPEN breakdown incident exists for this driver to resolve" };
  }
  return { valid: true };
}

/** A new OPEN breakdown may only be recorded when no other OPEN incident
 * already exists for that driver — prevents duplicate concurrent incidents
 * for the same driver from independent report sources. */
export function canOpenBreakdown(hasOpenIncident: boolean): ValidationResult {
  if (hasOpenIncident) {
    return { valid: false, reason: "an OPEN breakdown incident already exists for this driver — resolve it before opening another" };
  }
  return { valid: true };
}
