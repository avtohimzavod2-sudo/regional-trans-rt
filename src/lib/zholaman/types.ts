// Runtime-validated shape of Zholaman's delivery/cargo-direction management
// report.
//
// Zholaman is the cargo/delivery-direction manager. Like Akzhol (see
// src/lib/akzhol/types.ts) this is a READ/ANALYSIS layer over data Sapar, the
// executors registry and Adilet already own — not a new "AI persona", not an
// orchestrator, and deliberately not an AGENT_REGISTRY entry.
//
// One existing boundary governs this module above all others: spec s.21, which
// says the ONLY payment view Zholaman may ever have is the coarse three-value
// collapse in src/lib/sapargul/zholaman.ts — never amounts, never banking
// data, never evidence. That function already existed for this manager before
// this module did; the commercial section below is built on top of it rather
// than around it. Revenue stays Tyyin's, and a direction manager measured on
// volumes and failure modes does not need it.
import { z } from "zod";

const anomalySeveritySchema = z.enum(["INFO", "NORMAL", "ATTENTION", "HIGH", "CRITICAL"]);

/** Null, not 0, when the denominator is 0 — see src/lib/management/metrics.ts. */
const ratioSchema = z.number().nullable();

const trendStatusSchema = z.enum(["GROWTH", "STABLE", "DECLINE"]);

/** Period-over-period movement. The underlying helper
 * (computeWeekOverWeekChange in src/lib/artur/period.ts) names its fields
 * "week" because that is where it was first used; the arithmetic is
 * period-generic and reused here rather than duplicated. */
const periodChangeSchema = z.object({
  currentWeek: z.number(),
  previousWeek: z.number(),
  absoluteChange: z.number(),
  percentageChange: z.number().nullable(),
  status: trendStatusSchema,
});

export const cargoOperationalAnomalySchema = z.object({
  code: z.string(),
  severity: anomalySeveritySchema,
  detail: z.string(),
  observedValue: z.number(),
  threshold: z.number(),
});
export type CargoOperationalAnomaly = z.infer<typeof cargoOperationalAnomalySchema>;

const executorRowSchema = z.object({
  executorId: z.string(),
  name: z.string(),
  source: z.string(),
  verificationStatus: z.string(),
  status: z.string(),
  ordersInPeriod: z.number().int(),
  /** Lifetime counters maintained by src/lib/sapar/executors.ts, not
   * recomputed here — two competing definitions of "reliability" for the same
   * executor is how a manager and an engine end up disagreeing about who to
   * suspend. Null means not enough observations yet, never "perfect". */
  reliabilityScore: z.number().nullable(),
  lifetimeComplaints: z.number().int(),
});

export const deliveryCargoDirectionReportSchema = z.object({
  periodFrom: z.string(),
  periodTo: z.string(),

  orders: z.object({
    created: z.number().int(),
    confirmed: z.number().int(),
    delivered: z.number().int(),
    failed: z.number().int(),
    cancelled: z.number().int(),
    disputed: z.number().int(),
    /** Still moving at the end of the period — neither a success nor a
     * failure yet, and counted separately so it is never quietly folded
     * into one of them. */
    inFlightAtPeriodEnd: z.number().int(),
    deliveryRate: ratioSchema,
    failureRate: ratioSchema,
  }),

  execution: z.object({
    legsPlanned: z.number().int(),
    legsCompleted: z.number().int(),
    legsFailed: z.number().int(),
    medianHoursCreatedToDelivered: z.number().nullable(),
    p90HoursCreatedToDelivered: z.number().nullable(),
    /** Of delivered shipments that carried a deliveryDeadline. */
    deadlinesObserved: z.number().int(),
    deliveredLate: z.number().int(),
    latenessRate: ratioSchema,
  }),

  partners: z.object({
    activeExecutors: z.number().int(),
    suspendedOrBlockedExecutors: z.number().int(),
    verifiedExecutors: z.number().int(),
    provisionalExecutors: z.number().int(),
    unverifiedExecutors: z.number().int(),
    activePartners: z.number().int(),
    /** Busiest executors this period, with their own registry counters. */
    topExecutors: z.array(executorRowSchema),
    /** Share of the period's orders handled by the single busiest executor —
     * concentration risk, which reads as healthy volume until that executor
     * stops answering. */
    topExecutorShare: ratioSchema,
  }),

  incidents: z.object({
    opened: z.number().int(),
    resolved: z.number().int(),
    openOrEscalatedAtPeriodEnd: z.number().int(),
    criticalOpenAtPeriodEnd: z.number().int(),
    bySeverity: z.object({
      LOW: z.number().int(),
      MEDIUM: z.number().int(),
      HIGH: z.number().int(),
      CRITICAL: z.number().int(),
    }),
    topTypes: z.array(z.object({ type: z.string(), count: z.number().int() })),
    incidentRatePerOrder: ratioSchema,
  }),

  quality: z.object({
    complaintsOpened: z.number().int(),
    complaintsResolved: z.number().int(),
    criticalComplaintsOpen: z.number().int(),
    /** RT has NO customer-review or rating model. This is the count of
     * evidence items explicitly typed CUSTOMER_FEEDBACK on cargo complaint
     * cases — the only recorded customer voice that exists. It is not a
     * review volume and not a satisfaction score, and is reported under its
     * real name so nobody reads it as one. */
    customerFeedbackEvidenceItems: z.number().int(),
    reviewSystemAvailable: z.literal(false),
  }),

  /** Commercial movement without money: volumes, outcomes and the paid/unpaid
   * split Zholaman is permitted to see (spec s.21). No amounts anywhere. */
  commercial: z.object({
    comparedToPeriodFrom: z.string(),
    comparedToPeriodTo: z.string(),
    ordersChange: periodChangeSchema,
    deliveredChange: periodChangeSchema,
    failedChange: periodChangeSchema,
    /** Coarse payment posture, via paymentStatusForJolaman only. */
    paymentPaid: z.number().int(),
    paymentPending: z.number().int(),
    paymentProblem: z.number().int(),
    paymentProblemRate: ratioSchema,
  }),

  anomalies: z.array(cargoOperationalAnomalySchema),
  missingDataNotes: z.array(z.string()),
});
export type DeliveryCargoDirectionReport = z.infer<typeof deliveryCargoDirectionReportSchema>;
