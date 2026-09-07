// Idempotent Daily Founder Brief generation (AGENTS Master Architecture
// spec s.9/s.10/s.29). Idempotent by FounderBrief.reportDate — a retried
// scheduler run or a duplicate "generate now" click for the same Bishkek
// calendar date returns the already-generated brief instead of creating a
// second one (spec s.22). Every count comes from snapshot.ts (deterministic
// DB reads); only the narrative sentences come from the reasoning provider,
// and even those are schema-validated before being persisted (spec s.33).
import { db } from "@/lib/db";
import type { FounderBrief } from "@prisma/client";
import type { AgentContext } from "@/lib/agents/types";
import { requireFounderRole } from "./role";
import { buildManagerReportSnapshot } from "./snapshot";
import { bishkekDateKey, bishkekDayWindow, previousBishkekDateKey } from "./period";
import { overallRtStatus, severityForCaseAgeMs, severityRank } from "./severity";
import { dailyFounderBriefSchema, type DailyFounderBrief } from "./types";
import { getArturReasoningProvider } from "./providers/model-provider";
import { emitArturEvent } from "./events";

interface StuckCase {
  id: string;
  domain: string;
  ageMs: number;
}

async function findStuckCases(asOf: Date): Promise<StuckCase[]> {
  const [adiletCases, accountantCases, shipmentIncidents] = await Promise.all([
    db.adiletCase.findMany({ where: { status: { in: ["OPEN", "UNDER_REVIEW", "AWAITING_EVIDENCE"] } }, select: { id: true, openedAt: true } }),
    db.accountantCase.findMany({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, select: { id: true, openedAt: true } }),
    db.shipmentIncident.findMany({ where: { status: { in: ["OPEN", "IN_PROGRESS", "ESCALATED"] } }, select: { id: true, createdAt: true } }),
  ]);

  const all: StuckCase[] = [
    ...adiletCases.map((c) => ({ id: c.id, domain: "Adilet (complaints/discipline)", ageMs: asOf.getTime() - c.openedAt.getTime() })),
    ...accountantCases.map((c) => ({ id: c.id, domain: "Tyyin (accountant case)", ageMs: asOf.getTime() - c.openedAt.getTime() })),
    ...shipmentIncidents.map((c) => ({ id: c.id, domain: "Sapar (cargo incident)", ageMs: asOf.getTime() - c.createdAt.getTime() })),
  ];

  const attentionRank = severityRank("ATTENTION");
  return all.filter((c) => severityRank(severityForCaseAgeMs(c.ageMs)) >= attentionRank);
}

/** Generates (or returns the existing) Founder Brief for one Bishkek
 * calendar date. dateKey defaults to "today" for manual/scheduled runs. */
export async function generateDailyFounderBrief(ctx: AgentContext, dispatcherRole: string, requesterId: string, dateKey?: string): Promise<FounderBrief> {
  requireFounderRole(dispatcherRole);
  const reportDate = dateKey ?? bishkekDateKey(new Date());

  const existing = await db.founderBrief.findUnique({ where: { reportDate } });
  if (existing) return existing;

  const { from, to } = bishkekDayWindow(reportDate);
  const previousDateKey = previousBishkekDateKey(reportDate);
  const previousWindow = bishkekDayWindow(previousDateKey);

  const [snapshot, previousSnapshot, openIncidentCount, stuckCases] = await Promise.all([
    buildManagerReportSnapshot({ from, to }),
    buildManagerReportSnapshot({ from: previousWindow.from, to: previousWindow.to }),
    db.emergencyIncident.count({ where: { resolutionStatus: { in: ["OPEN", "ACKNOWLEDGED"] } } }),
    findStuckCases(to),
  ]);

  const openInitiativeTitles = await db.directorInitiative.findMany({
    where: { status: "PROPOSED" },
    select: { id: true, title: true },
  });
  const openEmergencies = await db.emergencyIncident.findMany({
    where: { resolutionStatus: { in: ["OPEN", "ACKNOWLEDGED"] } },
    select: { id: true, whatHappened: true, severity: true },
  });

  const provider = getArturReasoningProvider();
  const narrative = await provider.draftDailyNarrative({ snapshot, previousSnapshot, openIncidentCount, stuckCasesCount: stuckCases.length });

  const signalSeverities = [
    ...stuckCases.map((c) => severityForCaseAgeMs(c.ageMs)),
    ...openEmergencies.map((e) => e.severity),
    ...(snapshot.complaints.criticalOpen > 0 ? (["HIGH"] as const) : []),
    ...(snapshot.cargo.criticalShipments > 0 ? (["HIGH"] as const) : []),
  ];

  const brief: DailyFounderBrief = {
    reportDate,
    overallStatus: overallRtStatus(signalSeverities),
    keyEvents: narrative.keyEvents,
    passenger: {
      summary: narrative.passengerSummary,
      demand: snapshot.passenger.requests,
      completed: snapshot.passenger.completedTrips,
      cancellations: snapshot.passenger.cancellations,
      notes: [],
    },
    cargo: {
      summary: narrative.cargoSummary,
      accepted: snapshot.cargo.accepted,
      completed: snapshot.cargo.completed,
      delayed: snapshot.cargo.delayedOrFailed,
      failed: 0,
      notes: [],
    },
    finance: {
      summary: narrative.financeSummary,
      incomingSom: snapshot.finance.incomingSom,
      verifiedSom: snapshot.finance.verifiedSom,
      discrepancies: snapshot.finance.discrepancyCount,
      unresolvedPayments: snapshot.finance.unresolvedCasesCount,
      notes: snapshot.missingDataNotes,
    },
    complaints: {
      summary: narrative.complaintsSummary,
      opened: snapshot.complaints.opened,
      resolved: snapshot.complaints.resolved,
      criticalOpen: snapshot.complaints.criticalOpen,
    },
    stuckTasks: stuckCases.map((c) => ({
      what: `Case ${c.id}`,
      ageHours: Math.round((c.ageMs / 3_600_000) * 10) / 10,
      responsibleDomain: c.domain,
      impact: "Exceeds normal handling time for this case type.",
    })),
    risksToday: narrative.risksToday,
    decisionsArturTook: [],
    founderDecisionsRequired: [
      ...openInitiativeTitles.map((i) => `Initiative decision needed: "${i.title}" (id ${i.id}).`),
      ...openEmergencies.map((e) => `Emergency incident ${e.id} (${e.severity}) awaiting Founder response: ${e.whatHappened}`),
    ],
  };

  const validated = dailyFounderBriefSchema.parse(brief);

  const created = await db.founderBrief.create({
    data: {
      reportDate: validated.reportDate,
      overallStatus: validated.overallStatus,
      sections: validated,
      sourceSnapshotAt: to,
    },
  });

  await emitArturEvent(ctx, "FOUNDER_BRIEF_READY", created.id, "FounderBrief", { requesterId, reportDate });
  return created;
}

export async function getLatestFounderBrief(dispatcherRole: string): Promise<FounderBrief | null> {
  requireFounderRole(dispatcherRole);
  return db.founderBrief.findFirst({ orderBy: { reportDate: "desc" } });
}
