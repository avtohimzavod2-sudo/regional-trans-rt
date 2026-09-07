// Idempotent Monday 10:00 Weekly Director Report generation (AGENTS Master
// Architecture spec s.11-s.15/s.29). Idempotent by
// WeeklyDirectorReport.weekStartDate. KPI week-over-week math is entirely
// deterministic (period.ts's computeWeekOverWeekChange) — the reasoning
// provider only narrates and proposes initiatives on top of numbers that
// are already final by the time it is called.
import { db } from "@/lib/db";
import type { WeeklyDirectorReport } from "@prisma/client";
import type { AgentContext } from "@/lib/agents/types";
import { requireFounderRole } from "./role";
import { buildManagerReportSnapshot } from "./snapshot";
import { bishkekWeekStartKey, bishkekWeekWindow, previousBishkekWeekStartKey, computeWeekOverWeekChange } from "./period";
import type { KpiRow, ManagerReportSnapshot } from "./types";
import { getArturReasoningProvider } from "./providers/model-provider";
import { emitArturEvent } from "./events";
import { assertExactlyThreeInitiatives } from "./initiatives";

function kpiRow(name: string, currentWeek: number, previousWeek: number): KpiRow {
  const change = computeWeekOverWeekChange(currentWeek, previousWeek);
  const pct = change.percentageChange === null ? "no comparable baseline" : `${change.percentageChange.toFixed(1)}%`;
  return {
    name,
    ...change,
    interpretation: `${change.status} — ${pct} vs previous week.`,
    available: true,
  };
}

function buildKpiRows(current: ManagerReportSnapshot, previous: ManagerReportSnapshot): KpiRow[] {
  return [
    kpiRow("Passenger requests", current.passenger.requests, previous.passenger.requests),
    kpiRow("Passenger completed trips", current.passenger.completedTrips, previous.passenger.completedTrips),
    kpiRow("Cargo accepted", current.cargo.accepted, previous.cargo.accepted),
    kpiRow("Cargo completed", current.cargo.completed, previous.cargo.completed),
    kpiRow("Finance incoming (som)", current.finance.incomingSom, previous.finance.incomingSom),
    kpiRow("Finance verified (som)", current.finance.verifiedSom, previous.finance.verifiedSom),
    kpiRow("Complaints opened", current.complaints.opened, previous.complaints.opened),
    kpiRow("Complaints resolved", current.complaints.resolved, previous.complaints.resolved),
  ];
}

export async function generateWeeklyDirectorReport(ctx: AgentContext, dispatcherRole: string, requesterId: string, weekStartKeyInput?: string): Promise<WeeklyDirectorReport> {
  requireFounderRole(dispatcherRole);
  const weekStartDate = weekStartKeyInput ?? bishkekWeekStartKey(new Date());

  const existing = await db.weeklyDirectorReport.findUnique({ where: { weekStartDate } });
  if (existing) return existing;

  const { from, to, weekEndKey } = bishkekWeekWindow(weekStartDate);
  const previousWeekStartKey = previousBishkekWeekStartKey(weekStartDate);
  const previousWindow = bishkekWeekWindow(previousWeekStartKey);

  const [currentSnapshot, previousSnapshot, recentInitiatives] = await Promise.all([
    buildManagerReportSnapshot({ from, to }),
    buildManagerReportSnapshot({ from: previousWindow.from, to: previousWindow.to }),
    db.directorInitiative.findMany({
      where: { report: { weekStartDate: previousWeekStartKey } },
      select: { title: true },
    }),
  ]);

  const kpis = buildKpiRows(currentSnapshot, previousSnapshot);

  const provider = getArturReasoningProvider();
  const analysis = await provider.draftWeeklyAnalysis({
    currentSnapshot,
    previousSnapshot,
    kpis,
    recentInitiativeTitles: recentInitiatives.map((i) => i.title),
  });

  // Validate the exactly-3 invariant BEFORE writing anything, then create
  // the report and its 3 initiatives in one transaction — a retry can never
  // observe a report row with a different initiative count (spec s.15/s.22).
  const initiatives = assertExactlyThreeInitiatives(analysis.initiatives);

  const created = await db.$transaction(async (tx) => {
    const report = await tx.weeklyDirectorReport.create({
      data: {
        weekStartDate,
        weekEndDate: weekEndKey,
        kpis,
        problems: analysis.problems,
        executiveSummary: analysis.executiveSummary,
        sourceSnapshotAt: to,
      },
    });
    await tx.directorInitiative.createMany({ data: initiatives.map((i) => ({ reportId: report.id, ...i })) });
    return report;
  });

  await emitArturEvent(ctx, "WEEKLY_REPORT_READY", created.id, "WeeklyDirectorReport", { requesterId, weekStartDate });
  return created;
}

export async function getLatestWeeklyDirectorReport(dispatcherRole: string) {
  requireFounderRole(dispatcherRole);
  return db.weeklyDirectorReport.findFirst({
    orderBy: { weekStartDate: "desc" },
    include: { initiatives: true },
  });
}
