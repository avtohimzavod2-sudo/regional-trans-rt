// Passenger financial boundary (Mira Pass 1 spec s.18-s.20). Mira is NOT a
// cashier: she never mutates Tyyin treasury records, never sends passenger
// money directly to Tyyin, and never uses Sapargul (Sapargul belongs only to
// Sapar's cargo/parcel financial contour — see docs/FINANCIAL_BOUNDARIES.md).
// A dedicated passenger cashier has not been finalized in this codebase yet
// (TreasuryDepartment.PASSENGER exists in the schema but is not wired to any
// cashier flow). Rather than inventing a fully autonomous cashier agent or
// misusing Sapargul, this module gives a future passenger cashier a clean,
// typed, provenance-carrying handoff record to consume.
//
// The record lives in its own PassengerFinancialIntent table. Spec s.23 says
// prefer EXTEND/REUSE over a new model, and the first version of this module
// followed that by writing to AuditLogEntry — but that log's
// (entityType, entityId) index is deliberately non-unique, so dedupe there can
// only ever be a best-effort read-then-write, and on a payment path losing
// that race means charging a passenger twice. Reuse loses to a
// database-enforced guarantee when money is involved (cold audit B4). The
// AuditLogEntry write is still made, as the trace.
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
  /** The conversation the fee was agreed in. Carried explicitly rather than
   * parsed back out of idempotencyKey, which is an opaque dedupe token. */
  conversationId: string;
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
    conversationId: params.conversationId,
    originatingContext: "MIRA_PASSENGER_WORKFLOW",
    financialProcessor: null,
    idempotencyKey: `MIRA_PASSENGER_FINANCIAL_INTENT:${params.conversationId}:${params.eventKey}`,
  };
}

const ENTITY_TYPE = "PassengerFinancialIntent";
const ACTION = "MIRA_PASSENGER_FINANCIAL_INTENT_RECORDED";

/** Postgres unique-violation, surfaced by Prisma as P2002. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

/** Records the intent on PassengerFinancialIntent, deduped on idempotencyKey
 * by a UNIQUE constraint (spec s.19: "Do not create duplicate charges when the
 * same event/message is processed twice.").
 *
 * The dedupe is the database's job, not this function's. The previous version
 * did findFirst-before-create against AuditLogEntry, which has no unique index
 * on entityId — correct under sequential replay, but two concurrent
 * deliveries of the same inbound message could both read "absent" and both
 * insert. On a payment path that is a double charge, so the guarantee now
 * lives in a constraint that cannot be raced (cold audit B4).
 *
 * Ordering matters: the row is written FIRST, and the audit trace only after
 * it is known to be new. Logging first would produce a trace entry for a
 * charge that then lost the race and was never recorded.
 *
 * Callers can treat `created: false` as "already handled, do nothing" — it
 * means the intent exists exactly once, whether this call or a concurrent one
 * put it there. */
export async function recordPassengerFinancialIntent(ctx: AgentContext, intent: PassengerFinancialIntent) {
  try {
    const record = await db.passengerFinancialIntent.create({
      data: {
        paymentType: intent.paymentType,
        reason: intent.reason,
        amountSom: intent.amountSom,
        currency: intent.currency,
        conversationId: intent.conversationId,
        customerRef: intent.customerRef,
        tripId: intent.tripId ?? null,
        bookingId: intent.bookingId ?? null,
        originatingContext: intent.originatingContext,
        financialProcessor: intent.financialProcessor,
        idempotencyKey: intent.idempotencyKey,
      },
    });

    const entry = await logAgentAction({
      ctx,
      agent: "MIRA",
      action: ACTION,
      entityType: ENTITY_TYPE,
      entityId: intent.idempotencyKey,
      details: { ...intent },
    });

    return { created: true as const, record, entry };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    // Lost the race, or a plain replay. Either way the intent is already
    // recorded exactly once. Re-read rather than assume, so the caller gets
    // the real row and never a synthesized one.
    const record = await db.passengerFinancialIntent.findUnique({
      where: { idempotencyKey: intent.idempotencyKey },
    });
    return { created: false as const, record, entry: null };
  }
}
