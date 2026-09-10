// Booking State Machine (spec s.1) — a pure, deterministic projection over
// the EXISTING persisted enums (TripRequest.status / Match.status /
// Trip.status). No new Prisma model, no LLM in the loop: every name below is
// derived by ordinary code from facts orchestrate.ts already writes.
//
// This module never mutates anything — it is read-only reporting/labeling
// for observability (e.g. a future status endpoint, or a test asserting
// "this booking is now in SEAT_HELD"). Real transitions are still gated
// exclusively by matching/orchestrate.ts's own CAS-guarded writes against
// the real RequestStatus/MatchStatus/TripStatus columns.
import type { MatchStatus, RequestStatus, TripStatus } from "@prisma/client";

export type BookingState =
  | "DEMAND_CREATED"
  | "SEARCHING"
  | "DRIVER_OFFERED"
  | "SEAT_HELD"
  | "BOOKED"
  | "IN_TRIP"
  | "COMPLETED"
  | "DECLINED"
  | "EXPIRED"
  | "CANCELLED"
  | "DRIVER_UNAVAILABLE"
  | "BREAKDOWN";

/** Reason-code prefixes written into the existing free-text
 * Match.declineReason / Trip.cancelReason columns (spec deliberately avoids
 * a schema migration for DRIVER_UNAVAILABLE/BREAKDOWN — see AGENTS/audit
 * notes — reusing the same "structured discriminator in a free-text field"
 * convention already used elsewhere in this codebase, e.g. SupportCase). */
export const CANCEL_REASON = {
  PASSENGER_CANCELLED: "PASSENGER_CANCELLED",
  DRIVER_CANCELLED: "DRIVER_CANCELLED",
  DRIVER_UNAVAILABLE: "DRIVER_UNAVAILABLE",
  BREAKDOWN: "BREAKDOWN",
  SEAT_UNAVAILABLE: "SEAT_UNAVAILABLE",
} as const;
export type CancelReasonCode = (typeof CANCEL_REASON)[keyof typeof CANCEL_REASON];

/** Formats a reason code (+ optional free-text detail) into the single
 * string stored in Match.declineReason / Trip.cancelReason, and the inverse
 * parse used by deriveBookingState below. Keeping both directions in one
 * place is what makes the prefix convention safe to rely on. */
export function formatCancelReason(code: CancelReasonCode, detail?: string | null): string {
  return detail ? `${code}: ${detail}` : code;
}

function reasonCodeOf(reason: string | null | undefined): CancelReasonCode | null {
  if (!reason) return null;
  const prefix = reason.split(":")[0];
  return (Object.values(CANCEL_REASON) as string[]).includes(prefix) ? (prefix as CancelReasonCode) : null;
}

export interface BookingStateInput {
  tripRequestStatus: RequestStatus;
  /** Whether at least one Match row has ever existed for this demand — the
   * only thing distinguishing a brand-new DEMAND_CREATED request from one
   * that's SEARCHING again after a decline/expiry cycle, since both are
   * RequestStatus.PENDING. Defaults to false (fresh demand). */
  hasHadAnyMatchAttempt?: boolean;
  /** The single currently-relevant Match for this demand (its most recent
   * row), if any. */
  activeMatchStatus?: MatchStatus | null;
  matchDeclineReason?: string | null;
  /** The Trip for this demand, if a booking was ever created. */
  tripStatus?: TripStatus | null;
  tripCancelReason?: string | null;
}

/** Pure, deterministic, exhaustive. Never guesses: every branch traces back
 * to a real persisted enum value or reason-code prefix, never free text. */
export function deriveBookingState(input: BookingStateInput): BookingState {
  if (input.tripStatus) {
    switch (input.tripStatus) {
      case "COMPLETED":
        return "COMPLETED";
      case "IN_PROGRESS":
        return "IN_TRIP";
      case "NO_SHOW":
        return "CANCELLED";
      case "CANCELLED": {
        const code = reasonCodeOf(input.tripCancelReason);
        if (code === CANCEL_REASON.BREAKDOWN) return "BREAKDOWN";
        if (code === CANCEL_REASON.DRIVER_UNAVAILABLE || code === CANCEL_REASON.DRIVER_CANCELLED) return "DRIVER_UNAVAILABLE";
        return "CANCELLED";
      }
      case "SCHEDULED":
        return "BOOKED";
    }
  }

  switch (input.activeMatchStatus) {
    case "PROPOSED_TO_DRIVER":
    case "AWAITING_DRIVER":
      return "DRIVER_OFFERED";
    case "AWAITING_PASSENGER":
      return "SEAT_HELD";
    case "CONFIRMED":
      return "BOOKED";
    case "DECLINED_BY_DRIVER":
    case "DECLINED_BY_PASSENGER":
      return "DECLINED";
    case "EXPIRED":
      return "EXPIRED";
    case "CANCELLED": {
      const code = reasonCodeOf(input.matchDeclineReason);
      if (code === CANCEL_REASON.BREAKDOWN) return "BREAKDOWN";
      return "CANCELLED";
    }
  }

  switch (input.tripRequestStatus) {
    case "PENDING":
      return input.hasHadAnyMatchAttempt ? "SEARCHING" : "DEMAND_CREATED";
    case "MATCHING":
      return "SEARCHING";
    case "MATCHED":
      return "SEAT_HELD";
    case "CONFIRMED":
      return "BOOKED";
    case "CANCELLED":
      return "CANCELLED";
    case "EXPIRED":
      return "EXPIRED";
    case "COMPLETED":
      return "COMPLETED";
  }
}
