// Passenger financial boundary (Mira Pass 1 spec s.18-s.20). Mira is NOT a
// cashier: she never mutates Tyyin treasury records, never sends passenger
// money directly to Tyyin, and never uses Sapargul (Sapargul belongs only to
// Sapar's cargo/parcel financial contour — see docs/FINANCIAL_BOUNDARIES.md).
// A dedicated passenger cashier has not been finalized in this codebase yet
// (TreasuryDepartment.PASSENGER exists in the schema but is not wired to any
// cashier flow). Rather than inventing a fully autonomous cashier agent or
// misusing Sapargul, this module gives a future passenger cashier a clean,
// typed, provenance-carrying handoff record to consume — reusing the
// existing AuditLogEntry event log (spec s.23: prefer EXTEND/REUSE over a
// new model) instead of a new payment table.
import { db } from "@/lib/db";
import type { AgentContext } from "@/lib/agents/types";
import { logAgentAction } from "@/lib/agents/trace";

export type PassengerPaymentType = "PASSENGER_EXTRA_BAGGAGE_FEE";
export type PassengerFinancialReason = "SIGNIFICANT_EXCESS_BAGGAGE";

export interface PassengerFinancialIntent {
  paymentType: PassengerPaymentType;
  amountSom: number;
  currency: "KGS";
  sourceDepartment: "PASSENGER_TRANSPORT";
  reason: PassengerFinancialReason;
  tripId?: string | null;
  bookingId?: string | null;
  customerRef: string;
  originatingContext: "MIRA_PASSENGER_WORKFLOW";
  /** Never populated in Pass 1 — no passenger cashier/processor exists yet
   * (spec s.18 exclusion). Left explicitly null, never fabricated. */
  financialProcessor: null;
  idempotencyKey: string;
}

export interface BuildSignificantExcessBaggageIntentParams {
  conversationId: string;
  customerRef: string;
  amountSom: number;
  tripId?: string | null;
  bookingId?: string | null;
  /** A stable per-event discriminator (e.g. the inbound message id/traceId)
   * so re-processing the same message never produces a second charge. */
  eventKey: string;
}

/** Builds (but does not persist) the typed financial handoff for RT's 100
 * KGS significant-excess-baggage fee — never Mira's own invention, never
 * merged with the driver's separate surcharge (see baggage-policy.ts). */
export function buildSignificantExcessBaggageFinancialIntent(params: BuildSignificantExcessBaggageIntentParams): PassengerFinancialIntent {
  return {
    paymentType: "PASSENGER_EXTRA_BAGGAGE_FEE",
    amountSom: params.amountSom,
    currency: "KGS",
    sourceDepartment: "PASSENGER_TRANSPORT",
    reason: "SIGNIFICANT_EXCESS_BAGGAGE",
    tripId: params.tripId ?? null,
    bookingId: params.bookingId ?? null,
    customerRef: params.customerRef,
    originatingContext: "MIRA_PASSENGER_WORKFLOW",
    financialProcessor: null,
    idempotencyKey: `MIRA_PASSENGER_FINANCIAL_INTENT:${params.conversationId}:${params.eventKey}`,
  };
}

const ENTITY_TYPE = "PassengerFinancialIntent";
const ACTION = "MIRA_PASSENGER_FINANCIAL_INTENT_RECORDED";

/** Records the intent as an AuditLogEntry, deduped on idempotencyKey via a
 * findFirst-before-create check (spec s.19: "Do not create duplicate charges
 * when the same event/message is processed twice."). NOTE: unlike
 * NotificationDelivery.idempotencyKey, AuditLogEntry has no unique DB
 * constraint on entityId, so this check-then-create is best-effort, not
 * atomic under true concurrent double-delivery — a real uniqueness
 * guarantee would need a dedicated indexed column (documented as a
 * remaining gap, not silently claimed as airtight). */
export async function recordPassengerFinancialIntent(ctx: AgentContext, intent: PassengerFinancialIntent) {
  const existing = await db.auditLogEntry.findFirst({
    where: { entityType: ENTITY_TYPE, entityId: intent.idempotencyKey, action: ACTION },
  });
  if (existing) return { created: false as const, entry: existing };

  const entry = await logAgentAction({
    ctx,
    agent: "MIRA",
    action: ACTION,
    entityType: ENTITY_TYPE,
    entityId: intent.idempotencyKey,
    details: { ...intent },
  });
  return { created: true as const, entry };
}
