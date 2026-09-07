// Read-only period snapshot across the RT domains (AGENTS Master
// Architecture spec s.8/s.29): Artur never re-derives finance from
// TreasuryTransaction/AccountantCase directly — it calls Tyyin's own
// buildTreasuryPeriodReport (src/lib/tyyin/reports.ts), the single
// authoritative aggregation for that domain, exactly like spec s.8 requires
// ("Artur must still verify manager summaries against RT Core authoritative
// data" — reusing the real report *is* that authoritative data, not a
// second parallel computation of it). Passenger/cargo/complaints have no
// equivalent manager-report builder yet (Zholaman/Akzhol are not full agent
// modules — see src/lib/sapargul/zholaman.ts), so those three sections read
// TripRequest/Trip, Shipment/ShipmentIncident, and AdiletCase directly.
//
// Every count here is a plain DB aggregate, never LLM-composed — this is
// the "snapshot" that reasoning-provider.ts is handed as ground truth, so
// nothing on the page in front of the Founder can be a hallucination about
// *counts* (spec s.34: "never fabricate").
import { db } from "@/lib/db";
import { buildTreasuryDailyReport } from "@/lib/tyyin/reports";
import { managerReportSnapshotSchema, type ManagerReportSnapshot } from "./types";
import { bishkekDateKey } from "./period";

export interface SnapshotPeriod {
  from: Date;
  to: Date;
}

export async function buildManagerReportSnapshot(period: SnapshotPeriod): Promise<ManagerReportSnapshot> {
  const missingDataNotes: string[] = [];

  const [requests, completedTrips, cancelledTrips, noShowTrips] = await Promise.all([
    db.tripRequest.count({ where: { createdAt: { gte: period.from, lt: period.to } } }),
    db.trip.count({ where: { status: "COMPLETED", completedAt: { gte: period.from, lt: period.to } } }),
    db.trip.count({ where: { status: "CANCELLED", cancelledAt: { gte: period.from, lt: period.to } } }),
    db.trip.count({ where: { status: "NO_SHOW", createdAt: { gte: period.from, lt: period.to } } }),
  ]);
  missingDataNotes.push(
    "passenger.criticalRouteProblems approximates NO_SHOW trips by createdAt (Trip has no dedicated no-show timestamp) — a best-effort count, not exact for the window boundary.",
  );

  const [cargoAccepted, cargoCompleted, cargoFailed, cargoCancelled, criticalShipmentIncidents] = await Promise.all([
    db.shipment.count({ where: { createdAt: { gte: period.from, lt: period.to } } }),
    db.shipment.count({ where: { completedAt: { gte: period.from, lt: period.to } } }),
    db.shipment.count({ where: { status: "FAILED", updatedAt: { gte: period.from, lt: period.to } } }),
    db.shipment.count({ where: { status: "CANCELLED", cancelledAt: { gte: period.from, lt: period.to } } }),
    db.shipmentIncident.count({
      where: { severity: { in: ["HIGH", "CRITICAL"] }, status: { in: ["OPEN", "ESCALATED"] }, createdAt: { gte: period.from, lt: period.to } },
    }),
  ]);

  // buildTreasuryDailyReport and buildTreasuryWeeklyReport are the exact
  // same period aggregation under the hood (src/lib/tyyin/reports.ts) —
  // reused here regardless of whether the caller passed a day or a week.
  const treasury = await buildTreasuryDailyReport(period);

  const [complaintsOpened, complaintsResolved, criticalOpenComplaints] = await Promise.all([
    db.adiletCase.count({ where: { openedAt: { gte: period.from, lt: period.to } } }),
    db.adiletCase.count({ where: { resolvedAt: { gte: period.from, lt: period.to }, status: { in: ["DECIDED", "CLOSED"] } } }),
    db.adiletCase.count({ where: { severity: "CRITICAL", status: { notIn: ["CLOSED"] }, openedAt: { lt: period.to } } }),
  ]);

  const snapshot: ManagerReportSnapshot = {
    periodFrom: bishkekDateKey(period.from),
    periodTo: bishkekDateKey(period.to),
    passenger: {
      requests,
      completedTrips,
      cancellations: cancelledTrips,
      criticalRouteProblems: noShowTrips,
    },
    cargo: {
      accepted: cargoAccepted,
      completed: cargoCompleted,
      delayedOrFailed: cargoFailed + cargoCancelled,
      criticalShipments: criticalShipmentIncidents,
    },
    finance: {
      incomingSom: treasury.totalReceivedSom,
      verifiedSom: treasury.totalMatchedSom,
      discrepancyCount: treasury.transactionsNeedingManualReconciliation,
      unresolvedCasesCount: treasury.accountantCasesOpenAtEnd,
    },
    complaints: {
      opened: complaintsOpened,
      resolved: complaintsResolved,
      criticalOpen: criticalOpenComplaints,
    },
    missingDataNotes,
  };

  return managerReportSnapshotSchema.parse(snapshot);
}
