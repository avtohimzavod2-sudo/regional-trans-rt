// Akzhol's passenger-direction management report: one read-only aggregation
// over a Bishkek-local period, assembled from the tables the operational
// agents already own.
//
// WRITE ACCESS: none. Every query in this file is a count, a groupBy, a
// findMany or a findUnique. That is not a stylistic preference — a manager who
// can quietly edit the records they are measured on has no audit trail, so the
// absence of a write path is the control. boundary.test.ts enforces it
// statically, because a comment cannot.
//
// AUTHORITY BOUNDARIES this module stays inside:
//   - Match/Trip/TripRequest remain RT Core's exclusive write surface; Akzhol
//     reads their state and never proposes, confirms or cancels anything.
//   - PassengerLoopRun belongs to RT OFFICE (src/lib/rt-office/passenger-loop.ts).
//     Akzhol reads the no-supply reasons it recorded; it never drives the loop.
//   - Complaint outcomes belong to Adilet. Akzhol reports that a critical
//     complaint is open, never what should be decided about it.
//   - Money is absent by design. Not "filtered out at the view layer" —
//     never queried. Trip.totalFareSom and Trip.commissionSom are not read
//     here, TreasuryTransaction is not touched, and the passenger financial
//     contour stays Tyyin's (docs/FINANCIAL_BOUNDARIES.md). A direction
//     manager needs volumes and failure modes, not amounts.
import { db } from "@/lib/db";
import { bishkekDateKey } from "@/lib/artur/period";
import { compareStable, median, minutesBetween, percentile, rate, topCounts } from "@/lib/management/metrics";
import { detectPassengerAnomalies } from "./anomalies";
import { NO_REASON_RECORDED, passengerDirectionReportSchema, type PassengerDirectionReport } from "./types";

export interface ReportPeriod {
  from: Date;
  /** Exclusive, like every other period in this codebase. */
  to: Date;
}

/** How many distinct decline reasons to surface. Enough to see a pattern,
 * few enough that the list stays readable in a manager view. */
const TOP_DECLINE_REASONS = 5;
/** Busiest directions to list. The tail is long and mostly noise. */
const TOP_DIRECTIONS = 10;

export async function buildPassengerDirectionReport(period: ReportPeriod): Promise<PassengerDirectionReport> {
  const missingDataNotes: string[] = [];
  const window = { gte: period.from, lt: period.to };

  // ---- Acquisition funnel -------------------------------------------------
  const [newProspects, contactedProspects, convertedProspects, outreachAttempts, outreachActuallySent] = await Promise.all([
    db.passengerProspect.count({ where: { createdAt: window } }),
    db.passengerProspect.count({ where: { createdAt: window, status: { in: ["CONTACTED", "QUALIFIED", "CONVERTED"] } } }),
    db.passengerProspect.count({ where: { createdAt: window, status: "CONVERTED" } }),
    db.acquisitionOutreachEvent.count({ where: { createdAt: window, prospectType: "PASSENGER" } }),
    db.acquisitionOutreachEvent.count({ where: { createdAt: window, prospectType: "PASSENGER", status: "SENT" } }),
  ]);
  if (outreachAttempts > outreachActuallySent) {
    missingDataNotes.push(
      `${outreachAttempts - outreachActuallySent} of ${outreachAttempts} passenger outreach attempts were not real sends (DRY_RUN/SANDBOX/blocked). They are counted as attempts and excluded from outreachActuallySent — never reported as having reached a person.`,
    );
  }
  // Prospects created inside the window and converted inside it are not the
  // same cohort: a prospect created on Monday can convert on Friday. The rate
  // below is a within-period observation, not a cohort conversion rate.
  if (newProspects > 0) {
    missingDataNotes.push(
      "leads.conversionRate divides conversions observed in this period by prospects created in this period — the two are not the same cohort, so it is a period indicator and not a true cohort conversion rate.",
    );
  }

  // ---- Demand -------------------------------------------------------------
  const [requests, seatsAggregate] = await Promise.all([
    db.tripRequest.count({ where: { createdAt: window } }),
    db.tripRequest.aggregate({ where: { createdAt: window }, _sum: { seats: true } }),
  ]);

  // ---- Matching outcomes --------------------------------------------------
  // Scoped by Match.createdAt so the report is a statement about matches that
  // came into existence in the window, whatever they later became. Scoping by
  // each status's own timestamp instead would produce sections that cannot be
  // added up against one another.
  const [proposedToPassenger, confirmed, declinedByPassenger, declinedByDriver, expired, cancelled] = await Promise.all([
    db.match.count({ where: { createdAt: window, proposedToPassengerAt: { not: null } } }),
    db.match.count({ where: { createdAt: window, status: "CONFIRMED" } }),
    db.match.count({ where: { createdAt: window, status: "DECLINED_BY_PASSENGER" } }),
    db.match.count({ where: { createdAt: window, status: "DECLINED_BY_DRIVER" } }),
    db.match.count({ where: { createdAt: window, status: "EXPIRED" } }),
    db.match.count({ where: { createdAt: window, status: "CANCELLED" } }),
  ]);
  const proposedToDriver = await db.match.count({ where: { createdAt: window, proposedToDriverAt: { not: null } } });

  const declineRows = await db.match.findMany({
    where: { createdAt: window, status: { in: ["DECLINED_BY_PASSENGER", "DECLINED_BY_DRIVER"] } },
    select: { declineReason: true },
  });
  const topReasons = topCounts(
    declineRows.map((row) => row.declineReason?.trim() || NO_REASON_RECORDED),
    TOP_DECLINE_REASONS,
  ).map(({ value, count }) => ({ reason: value, count }));
  const declinesWithoutReason = declineRows.filter((row) => !row.declineReason?.trim()).length;
  if (declinesWithoutReason > 0) {
    missingDataNotes.push(
      `${declinesWithoutReason} of ${declineRows.length} declines carried no declineReason. They appear as "${NO_REASON_RECORDED}" rather than being attributed to a guessed cause.`,
    );
  }

  // ---- Handling time ------------------------------------------------------
  const timingRows = await db.match.findMany({
    where: { createdAt: window },
    select: { proposedToPassengerAt: true, passengerRespondedAt: true, proposedToDriverAt: true, driverRespondedAt: true },
  });
  const passengerMinutes: number[] = [];
  const driverMinutes: number[] = [];
  let inconsistentTimestamps = 0;
  for (const row of timingRows) {
    if (row.proposedToPassengerAt && row.passengerRespondedAt) {
      const minutes = minutesBetween(row.proposedToPassengerAt, row.passengerRespondedAt);
      if (minutes === null) inconsistentTimestamps++;
      else passengerMinutes.push(minutes);
    }
    if (row.proposedToDriverAt && row.driverRespondedAt) {
      const minutes = minutesBetween(row.proposedToDriverAt, row.driverRespondedAt);
      if (minutes === null) inconsistentTimestamps++;
      else driverMinutes.push(minutes);
    }
  }
  if (inconsistentTimestamps > 0) {
    missingDataNotes.push(
      `${inconsistentTimestamps} match(es) recorded a response BEFORE the proposal that prompted it. Those intervals are excluded from handling statistics rather than reported as a duration — they indicate a data problem upstream, not fast service.`,
    );
  }

  // ---- Directions ---------------------------------------------------------
  const directionGroups = await db.tripRequest.groupBy({
    by: ["originStopId", "destinationStopId"],
    where: { createdAt: window },
    _count: { _all: true },
  });
  const stopIds = [...new Set(directionGroups.flatMap((g) => [g.originStopId, g.destinationStopId]))];
  const stops = stopIds.length > 0 ? await db.stop.findMany({ where: { id: { in: stopIds } }, select: { id: true, nameRu: true } }) : [];
  const stopNames = new Map(stops.map((s) => [s.id, s.nameRu]));
  const directions = directionGroups
    .map((group) => ({
      // An unresolvable stop id is shown as the id, not silently dropped: a
      // direction missing from the busiest list would misdirect capacity.
      direction: `${stopNames.get(group.originStopId) ?? group.originStopId} → ${stopNames.get(group.destinationStopId) ?? group.destinationStopId}`,
      originStopId: group.originStopId,
      destinationStopId: group.destinationStopId,
      requests: group._count._all,
    }))
    .sort((a, b) => b.requests - a.requests || compareStable(a.direction, b.direction))
    .slice(0, TOP_DIRECTIONS);
  if (directionGroups.length > TOP_DIRECTIONS) {
    missingDataNotes.push(`directions lists the ${TOP_DIRECTIONS} busiest of ${directionGroups.length} observed origin/destination pairs.`);
  }

  // ---- Execution ----------------------------------------------------------
  const [tripsCreated, completedTrips, cancelledTrips, noShowTrips, loopRuns, loopNoSupply] = await Promise.all([
    db.trip.count({ where: { createdAt: window } }),
    db.trip.count({ where: { createdAt: window, status: "COMPLETED" } }),
    db.trip.count({ where: { createdAt: window, status: "CANCELLED" } }),
    db.trip.count({ where: { createdAt: window, status: "NO_SHOW" } }),
    db.passengerLoopRun.count({ where: { createdAt: window } }),
    db.passengerLoopRun.count({ where: { createdAt: window, status: "NO_SUPPLY" } }),
  ]);
  // Trips are counted by creation, not by completion, so completionRate is
  // "of the trips that started in this window, how many finished" — trips
  // still in progress at the boundary depress it. Stated, not smoothed over.
  missingDataNotes.push(
    "execution counts trips by Trip.createdAt, so a trip created near the end of the period and completed after it counts as created-but-not-completed. completionRate is therefore a floor, not an exact rate.",
  );

  // ---- Service quality ----------------------------------------------------
  const [supportCasesOpened, complaintsOpened, criticalComplaintsOpen, unattributedComplaints] = await Promise.all([
    db.supportCase.count({ where: { createdAt: window } }),
    db.adiletCase.count({ where: { openedAt: window, tripId: { not: null } } }),
    db.adiletCase.count({ where: { tripId: { not: null }, severity: "CRITICAL", status: { notIn: ["CLOSED"] }, openedAt: { lt: period.to } } }),
    db.adiletCase.count({ where: { openedAt: window, tripId: null, shipmentId: null } }),
  ]);
  if (unattributedComplaints > 0) {
    missingDataNotes.push(
      `${unattributedComplaints} complaint(s) opened in this period carry neither tripId nor shipmentId, so they cannot be attributed to the passenger or the cargo direction. They are excluded from both managers' counts rather than assigned to one by guess.`,
    );
  }
  // criticalComplaintsOpen deliberately ignores the period start: a complaint
  // opened three weeks ago and still open is this period's problem too.
  missingDataNotes.push(
    "serviceQuality.criticalComplaintsOpen counts every critical passenger complaint still open at the end of the period, including ones opened earlier — an unresolved critical case does not stop being current because it is old.",
  );

  const passengerDeclineRate = rate(declinedByPassenger, proposedToPassenger);
  const driverDeclineRate = rate(declinedByDriver, proposedToDriver);
  const completionRate = rate(completedTrips, tripsCreated);
  const noSupplyRate = rate(loopNoSupply, loopRuns);
  const medianPassengerResponseMinutes = median(passengerMinutes);

  const report: PassengerDirectionReport = {
    periodFrom: bishkekDateKey(period.from),
    periodTo: bishkekDateKey(period.to),
    leads: {
      newProspects,
      contactedProspects,
      convertedProspects,
      outreachAttempts,
      outreachActuallySent,
      conversionRate: rate(convertedProspects, newProspects),
    },
    demand: {
      requests,
      seatsRequested: seatsAggregate._sum.seats ?? 0,
    },
    bookings: {
      matchesProposedToPassenger: proposedToPassenger,
      confirmed,
      confirmationRate: rate(confirmed, proposedToPassenger),
    },
    declines: {
      byPassenger: declinedByPassenger,
      byDriver: declinedByDriver,
      expired,
      cancelled,
      passengerDeclineRate,
      driverDeclineRate,
      topReasons,
    },
    directions,
    handling: {
      passengerResponsesObserved: passengerMinutes.length,
      medianPassengerResponseMinutes,
      p90PassengerResponseMinutes: percentile(passengerMinutes, 0.9),
      driverResponsesObserved: driverMinutes.length,
      medianDriverResponseMinutes: median(driverMinutes),
      p90DriverResponseMinutes: percentile(driverMinutes, 0.9),
    },
    execution: {
      tripsCreated,
      completed: completedTrips,
      cancelled: cancelledTrips,
      noShow: noShowTrips,
      completionRate,
      loopRuns,
      loopNoSupply,
      noSupplyRate,
    },
    serviceQuality: {
      supportCasesOpened,
      complaintsOpened,
      criticalComplaintsOpen,
    },
    anomalies: detectPassengerAnomalies({
      matchesProposedToPassenger: proposedToPassenger,
      passengerDeclineRate,
      driverDeclineRate,
      requests,
      confirmed,
      completionRate,
      tripsCreated,
      noSupplyRate,
      loopRuns,
      medianPassengerResponseMinutes,
      criticalComplaintsOpen,
    }),
    missingDataNotes,
  };

  return passengerDirectionReportSchema.parse(report);
}
