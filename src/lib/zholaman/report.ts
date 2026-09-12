// Zholaman's delivery/cargo-direction management report: one read-only
// aggregation over a Bishkek-local period.
//
// WRITE ACCESS: none, enforced statically by
// src/lib/management/boundary.test.ts rather than by convention.
//
// AUTHORITY BOUNDARIES this module stays inside:
//   - Shipment/ShipmentLeg/ShipmentIncident remain Sapar's exclusive write
//     surface. Zholaman reads their state; it never assigns an executor,
//     advances a leg, opens an incident or cancels an order.
//   - DeliveryExecutor's reliability counters are maintained by
//     src/lib/sapar/executors.ts and are read verbatim, never recomputed. Two
//     competing definitions of one executor's reliability is how a manager and
//     the matching engine end up disagreeing about who to suspend.
//   - Incident and complaint OUTCOMES belong to Sapar and Adilet. This report
//     says what is unresolved, never what should be decided.
//   - Money: the only payment view taken is paymentStatusForJolaman's coarse
//     PAID / PENDING / PROBLEM collapse (spec s.21). Amounts, evidence and
//     treasury review state are never selected — not hidden downstream,
//     never read. ShipmentPayment.amountExpectedSom does not appear here.
import { db } from "@/lib/db";
import { bishkekDateKey, computeWeekOverWeekChange } from "@/lib/artur/period";
import { paymentStatusForJolaman } from "@/lib/sapargul/zholaman";
import { compareStable, percentile, rate, topCounts } from "@/lib/management/metrics";
import { detectCargoAnomalies } from "./anomalies";
import { deliveryCargoDirectionReportSchema, type DeliveryCargoDirectionReport } from "./types";

export interface ReportPeriod {
  from: Date;
  /** Exclusive. */
  to: Date;
}

const TOP_EXECUTORS = 5;
const TOP_INCIDENT_TYPES = 5;
const MS_PER_HOUR = 3_600_000;

/** Statuses that mean the order is still moving — neither delivered nor dead. */
const IN_FLIGHT_STATUSES = ["CONFIRMED", "AWAITING_PICKUP", "PICKED_UP", "IN_TRANSIT", "AT_TRANSFER_POINT", "OUT_FOR_DELIVERY"] as const;

export async function buildDeliveryCargoDirectionReport(period: ReportPeriod): Promise<DeliveryCargoDirectionReport> {
  const missingDataNotes: string[] = [];
  const window = { gte: period.from, lt: period.to };

  // The comparison window is the immediately preceding span of equal length,
  // derived from the requested period rather than assumed to be seven days, so
  // a daily report compares against yesterday and a weekly one against last
  // week without a second code path.
  const spanMs = period.to.getTime() - period.from.getTime();
  const previous = { from: new Date(period.from.getTime() - spanMs), to: period.from };
  const previousWindow = { gte: previous.from, lt: previous.to };

  // ---- Orders -------------------------------------------------------------
  const [created, confirmed, delivered, failed, cancelled, disputed, inFlight] = await Promise.all([
    db.shipment.count({ where: { createdAt: window } }),
    db.shipment.count({ where: { createdAt: window, status: { in: ["CONFIRMED", "AWAITING_PICKUP", "PICKED_UP", "IN_TRANSIT", "AT_TRANSFER_POINT", "OUT_FOR_DELIVERY", "DELIVERED"] } } }),
    db.shipment.count({ where: { createdAt: window, status: "DELIVERED" } }),
    db.shipment.count({ where: { createdAt: window, status: "FAILED" } }),
    db.shipment.count({ where: { createdAt: window, status: "CANCELLED" } }),
    db.shipment.count({ where: { createdAt: window, status: "DISPUTED" } }),
    db.shipment.count({ where: { createdAt: window, status: { in: [...IN_FLIGHT_STATUSES] } } }),
  ]);
  // "confirmed" counts orders that reached confirmation at any point, so it
  // includes those that later failed. It is a funnel stage, not a live status,
  // and adding it to failed/cancelled would double-count.
  missingDataNotes.push(
    "orders.confirmed counts orders that ever passed confirmation, including ones that later failed or were cancelled. It is a funnel stage and must not be added to the other status counts.",
  );

  // ---- Execution ----------------------------------------------------------
  const [legsPlanned, legsCompleted, legsFailed] = await Promise.all([
    db.shipmentLeg.count({ where: { createdAt: window } }),
    db.shipmentLeg.count({ where: { createdAt: window, status: "COMPLETED" } }),
    db.shipmentLeg.count({ where: { createdAt: window, status: "FAILED" } }),
  ]);

  const deliveredRows = await db.shipment.findMany({
    where: { createdAt: window, status: "DELIVERED", completedAt: { not: null } },
    select: { createdAt: true, completedAt: true, deliveryDeadline: true },
  });
  const durationsHours: number[] = [];
  let deadlinesObserved = 0;
  let deliveredLate = 0;
  let inconsistentTimestamps = 0;
  for (const row of deliveredRows) {
    if (!row.completedAt) continue;
    const ms = row.completedAt.getTime() - row.createdAt.getTime();
    // A completion before creation is a data fault, not a fast delivery.
    if (ms < 0) inconsistentTimestamps++;
    else durationsHours.push(ms / MS_PER_HOUR);

    if (row.deliveryDeadline) {
      deadlinesObserved++;
      if (row.completedAt.getTime() > row.deliveryDeadline.getTime()) deliveredLate++;
    }
  }
  if (inconsistentTimestamps > 0) {
    missingDataNotes.push(
      `${inconsistentTimestamps} delivered shipment(s) recorded completedAt before createdAt. Those durations are excluded rather than reported, since a negative delivery time is a data fault upstream.`,
    );
  }
  if (deliveredRows.length > deadlinesObserved) {
    missingDataNotes.push(
      `${deliveredRows.length - deadlinesObserved} of ${deliveredRows.length} delivered shipments carried no deliveryDeadline, so they cannot be judged late or on time. latenessRate covers only the ${deadlinesObserved} that did — it is not a promise about the rest.`,
    );
  }

  // ---- Partners and executors --------------------------------------------
  const [activeExecutors, suspendedOrBlocked, verifiedExecutors, provisionalExecutors, unverifiedExecutors, unverifiedActive, activePartners] = await Promise.all([
    db.deliveryExecutor.count({ where: { status: "ACTIVE" } }),
    db.deliveryExecutor.count({ where: { status: { in: ["SUSPENDED", "BLOCKED"] } } }),
    db.deliveryExecutor.count({ where: { verificationStatus: "VERIFIED" } }),
    db.deliveryExecutor.count({ where: { verificationStatus: "PROVISIONAL" } }),
    db.deliveryExecutor.count({ where: { verificationStatus: "UNVERIFIED" } }),
    db.deliveryExecutor.count({ where: { status: "ACTIVE", verificationStatus: "UNVERIFIED" } }),
    db.partner.count({ where: { isActive: true } }),
  ]);

  const executorGroups = await db.shipment.groupBy({
    by: ["assignedExecutorId"],
    where: { createdAt: window, assignedExecutorId: { not: null } },
    _count: { _all: true },
  });
  const rankedExecutorIds = [...executorGroups]
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, TOP_EXECUTORS)
    .map((g) => g.assignedExecutorId)
    .filter((id): id is string => id !== null);
  const executorRecords =
    rankedExecutorIds.length > 0
      ? await db.deliveryExecutor.findMany({
          where: { id: { in: rankedExecutorIds } },
          select: { id: true, name: true, source: true, verificationStatus: true, status: true, reliabilityScore: true, complaintsCount: true },
        })
      : [];
  const orderCountByExecutor = new Map(executorGroups.map((g) => [g.assignedExecutorId, g._count._all]));
  const topExecutors = rankedExecutorIds
    .map((id) => {
      const record = executorRecords.find((e) => e.id === id);
      return {
        executorId: id,
        // An executor id with no registry row is shown, not dropped: a missing
        // executor record handling real orders is itself worth seeing.
        name: record?.name ?? "(executor record not found)",
        source: record?.source ?? "UNKNOWN",
        verificationStatus: record?.verificationStatus ?? "UNKNOWN",
        status: record?.status ?? "UNKNOWN",
        ordersInPeriod: orderCountByExecutor.get(id) ?? 0,
        reliabilityScore: record?.reliabilityScore ?? null,
        lifetimeComplaints: record?.complaintsCount ?? 0,
      };
    })
    .sort((a, b) => b.ordersInPeriod - a.ordersInPeriod || compareStable(a.name, b.name));

  const assignedOrders = executorGroups.reduce((sum, g) => sum + g._count._all, 0);
  const topExecutorShare = topExecutors.length > 0 ? rate(topExecutors[0].ordersInPeriod, assignedOrders) : null;
  if (created > assignedOrders) {
    missingDataNotes.push(
      `${created - assignedOrders} of ${created} orders had no assigned executor in this period. topExecutorShare is computed over the ${assignedOrders} assigned ones, so it is concentration among assigned work, not among all demand.`,
    );
  }

  // ---- Incidents ----------------------------------------------------------
  const [incidentsOpened, incidentsResolved, incidentsOpenAtEnd, criticalIncidentsOpen, low, medium, high, critical] = await Promise.all([
    db.shipmentIncident.count({ where: { createdAt: window } }),
    db.shipmentIncident.count({ where: { resolvedAt: window } }),
    db.shipmentIncident.count({ where: { status: { in: ["OPEN", "ESCALATED"] }, createdAt: { lt: period.to } } }),
    db.shipmentIncident.count({ where: { severity: "CRITICAL", status: { in: ["OPEN", "ESCALATED"] }, createdAt: { lt: period.to } } }),
    db.shipmentIncident.count({ where: { createdAt: window, severity: "LOW" } }),
    db.shipmentIncident.count({ where: { createdAt: window, severity: "MEDIUM" } }),
    db.shipmentIncident.count({ where: { createdAt: window, severity: "HIGH" } }),
    db.shipmentIncident.count({ where: { createdAt: window, severity: "CRITICAL" } }),
  ]);
  const incidentTypeRows = await db.shipmentIncident.findMany({ where: { createdAt: window }, select: { type: true } });
  const topTypes = topCounts(
    incidentTypeRows.map((row) => row.type),
    TOP_INCIDENT_TYPES,
  ).map(({ value, count }) => ({ type: value, count }));

  // ---- Quality ------------------------------------------------------------
  const [complaintsOpened, complaintsResolved, criticalComplaintsOpen, customerFeedbackEvidenceItems] = await Promise.all([
    db.adiletCase.count({ where: { openedAt: window, shipmentId: { not: null } } }),
    db.adiletCase.count({ where: { resolvedAt: window, shipmentId: { not: null }, status: { in: ["DECIDED", "CLOSED"] } } }),
    db.adiletCase.count({ where: { shipmentId: { not: null }, severity: "CRITICAL", status: { notIn: ["CLOSED"] }, openedAt: { lt: period.to } } }),
    db.adiletEvidence.count({ where: { createdAt: window, type: "CUSTOMER_FEEDBACK", case: { shipmentId: { not: null } } } }),
  ]);
  // Stated explicitly because its absence is the kind of gap that gets filled
  // by a plausible-looking invention otherwise.
  missingDataNotes.push(
    "RT has no customer-review, rating or NPS model. quality.customerFeedbackEvidenceItems counts AdiletEvidence rows explicitly typed CUSTOMER_FEEDBACK on cargo cases — the only recorded customer voice that exists. It is not a review count and not a satisfaction score, and no such score is derivable from current data.",
  );

  // ---- Commercial dynamics (volumes and coarse payment posture only) ------
  const [previousCreated, previousDelivered, previousFailed] = await Promise.all([
    db.shipment.count({ where: { createdAt: previousWindow } }),
    db.shipment.count({ where: { createdAt: previousWindow, status: "DELIVERED" } }),
    db.shipment.count({ where: { createdAt: previousWindow, status: "FAILED" } }),
  ]);

  const paymentRows = await db.shipmentPayment.findMany({
    // Only the coarse status is selected. Nothing in this file can widen that
    // without failing src/lib/management/boundary.test.ts.
    where: { shipment: { createdAt: window } },
    select: { status: true },
  });
  let paymentPaid = 0;
  let paymentPending = 0;
  let paymentProblem = 0;
  for (const row of paymentRows) {
    const visible = paymentStatusForJolaman(row.status);
    if (visible === "PAID") paymentPaid++;
    else if (visible === "PAYMENT_PROBLEM") paymentProblem++;
    else paymentPending++;
  }
  if (created > paymentRows.length) {
    missingDataNotes.push(
      `${created - paymentRows.length} of ${created} orders have no ShipmentPayment record at all, so they appear in none of the payment counts. commercial.paymentProblemRate is computed over the ${paymentRows.length} that do.`,
    );
  }

  const failureRate = rate(failed, created);
  const latenessRate = rate(deliveredLate, deadlinesObserved);
  const incidentRatePerOrder = rate(incidentsOpened, created);
  const paymentProblemRate = rate(paymentProblem, paymentRows.length);

  const report: DeliveryCargoDirectionReport = {
    periodFrom: bishkekDateKey(period.from),
    periodTo: bishkekDateKey(period.to),
    orders: {
      created,
      confirmed,
      delivered,
      failed,
      cancelled,
      disputed,
      inFlightAtPeriodEnd: inFlight,
      deliveryRate: rate(delivered, created),
      failureRate,
    },
    execution: {
      legsPlanned,
      legsCompleted,
      legsFailed,
      medianHoursCreatedToDelivered: percentile(durationsHours, 0.5),
      p90HoursCreatedToDelivered: percentile(durationsHours, 0.9),
      deadlinesObserved,
      deliveredLate,
      latenessRate,
    },
    partners: {
      activeExecutors,
      suspendedOrBlockedExecutors: suspendedOrBlocked,
      verifiedExecutors,
      provisionalExecutors,
      unverifiedExecutors,
      activePartners,
      topExecutors,
      topExecutorShare,
    },
    incidents: {
      opened: incidentsOpened,
      resolved: incidentsResolved,
      openOrEscalatedAtPeriodEnd: incidentsOpenAtEnd,
      criticalOpenAtPeriodEnd: criticalIncidentsOpen,
      bySeverity: { LOW: low, MEDIUM: medium, HIGH: high, CRITICAL: critical },
      topTypes,
      incidentRatePerOrder,
    },
    quality: {
      complaintsOpened,
      complaintsResolved,
      criticalComplaintsOpen,
      customerFeedbackEvidenceItems,
      reviewSystemAvailable: false,
    },
    commercial: {
      comparedToPeriodFrom: bishkekDateKey(previous.from),
      comparedToPeriodTo: bishkekDateKey(previous.to),
      ordersChange: computeWeekOverWeekChange(created, previousCreated),
      deliveredChange: computeWeekOverWeekChange(delivered, previousDelivered),
      failedChange: computeWeekOverWeekChange(failed, previousFailed),
      paymentPaid,
      paymentPending,
      paymentProblem,
      paymentProblemRate,
    },
    anomalies: detectCargoAnomalies({
      ordersCreated: created,
      delivered,
      failureRate,
      latenessRate,
      deadlinesObserved,
      incidentRatePerOrder,
      criticalIncidentsOpen,
      criticalComplaintsOpen,
      topExecutorShare,
      topExecutorName: topExecutors[0]?.name ?? null,
      unverifiedExecutorsActive: unverifiedActive,
      paymentProblemRate,
      paymentProblem,
    }),
    missingDataNotes,
  };

  return deliveryCargoDirectionReportSchema.parse(report);
}
