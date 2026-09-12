// Runtime-validated shape of Akzhol's passenger-direction management report.
//
// Akzhol is the passenger-direction manager. This module makes that role real
// in code as a READ/ANALYSIS layer over events and data the operational agents
// already own — not as a new "AI persona", and not as an orchestrator. Akzhol
// is deliberately NOT in AGENT_REGISTRY: registering an agent contract would
// claim an execution surface that does not and should not exist (Founder
// decision C: "НЕ создавай пустых 'AI персонажей' ради registry").
//
// What Akzhol is not, enforced by boundary.test.ts rather than by convention:
//   - not an orchestrator — it starts no workflow and calls no agent;
//   - not a cashier and not a transaction owner — it reads no money amounts;
//   - not a replacement for Mira, Sapar, RT OFFICE or CRM — it never writes
//     to their tables, and has no write access of any kind.
//
// Same validation discipline as src/lib/artur/types.ts: every builder parses
// its assembled object before returning, so a malformed section fails loudly
// instead of quietly reaching a manager view as a plausible-looking number.
import { z } from "zod";

// The same five-value vocabulary Artur already uses (src/lib/artur/types.ts)
// rather than a competing one. Akzhol only ever emits the top three.
const anomalySeveritySchema = z.enum(["INFO", "NORMAL", "ATTENTION", "HIGH", "CRITICAL"]);
export type AnomalySeverity = z.infer<typeof anomalySeveritySchema>;

/** A ratio is null, never 0, when its denominator is 0 — "nothing happened"
 * and "0% of what happened" are different facts, and reporting the first as
 * the second is how a manager ends up acting on a number that means nothing
 * (same rule as computeWeekOverWeekChange's null percentageChange). */
export const ratioSchema = z.number().nullable();

const declineReasonCountSchema = z.object({
  /** Verbatim Match.declineReason, or the sentinel below when the row carried
   * no reason at all. Never re-worded: a manager acting on decline reasons
   * needs what was actually recorded. */
  reason: z.string(),
  count: z.number().int(),
});

/** Used when a decline was recorded with no reason. Not a guess at why. */
export const NO_REASON_RECORDED = "(no reason recorded)";

const directionRowSchema = z.object({
  /** "Bishkek → Osh", built from Stop.nameRu on both ends. */
  direction: z.string(),
  originStopId: z.string(),
  destinationStopId: z.string(),
  requests: z.number().int(),
});

export const passengerOperationalAnomalySchema = z.object({
  /** Stable machine code — the thing to alert or chart on. */
  code: z.string(),
  severity: anomalySeveritySchema,
  /** Plain-language statement of what was observed. Composed from the
   * measured numbers by pure code, never by a language model. */
  detail: z.string(),
  observedValue: z.number(),
  threshold: z.number(),
});
export type PassengerOperationalAnomaly = z.infer<typeof passengerOperationalAnomalySchema>;

export const passengerDirectionReportSchema = z.object({
  periodFrom: z.string(),
  periodTo: z.string(),

  /** Acquisition funnel ahead of RT Core: prospects the passenger acquisition
   * contractor worked, plus its outreach attempts. Distinct from demand —
   * a prospect is someone RT reached out to, a request is someone who asked. */
  leads: z.object({
    newProspects: z.number().int(),
    contactedProspects: z.number().int(),
    convertedProspects: z.number().int(),
    outreachAttempts: z.number().int(),
    /** SENT only. DRY_RUN/SANDBOX attempts are counted in outreachAttempts
     * but must never be reported as having reached a real person. */
    outreachActuallySent: z.number().int(),
    conversionRate: ratioSchema,
  }),

  demand: z.object({
    requests: z.number().int(),
    seatsRequested: z.number().int(),
  }),

  bookings: z.object({
    matchesProposedToPassenger: z.number().int(),
    confirmed: z.number().int(),
    confirmationRate: ratioSchema,
  }),

  declines: z.object({
    byPassenger: z.number().int(),
    byDriver: z.number().int(),
    expired: z.number().int(),
    cancelled: z.number().int(),
    passengerDeclineRate: ratioSchema,
    driverDeclineRate: ratioSchema,
    topReasons: z.array(declineReasonCountSchema),
  }),

  /** Where the demand actually is, busiest first. */
  directions: z.array(directionRowSchema),

  /** How long each side took to answer. Medians, not means: one abandoned
   * conversation left open for a day would drag a mean into fiction. */
  handling: z.object({
    passengerResponsesObserved: z.number().int(),
    medianPassengerResponseMinutes: z.number().nullable(),
    p90PassengerResponseMinutes: z.number().nullable(),
    driverResponsesObserved: z.number().int(),
    medianDriverResponseMinutes: z.number().nullable(),
    p90DriverResponseMinutes: z.number().nullable(),
  }),

  execution: z.object({
    tripsCreated: z.number().int(),
    completed: z.number().int(),
    cancelled: z.number().int(),
    noShow: z.number().int(),
    completionRate: ratioSchema,
    /** RT OFFICE's passenger loop, which records WHY supply was not found.
     * Akzhol reads it; it never drives it. */
    loopRuns: z.number().int(),
    loopNoSupply: z.number().int(),
    noSupplyRate: ratioSchema,
  }),

  /** Passenger-side service quality. RT has no customer-review model, so
   * these are complaint and support counts, never a satisfaction score. */
  serviceQuality: z.object({
    supportCasesOpened: z.number().int(),
    complaintsOpened: z.number().int(),
    criticalComplaintsOpen: z.number().int(),
  }),

  anomalies: z.array(passengerOperationalAnomalySchema),

  /** Every place this report is knowingly approximate or blind. A manager
   * report that hides its own gaps is worse than one that has them. */
  missingDataNotes: z.array(z.string()),
});
export type PassengerDirectionReport = z.infer<typeof passengerDirectionReportSchema>;
