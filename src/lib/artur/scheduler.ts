// Idempotent job runner for Artur's 08:00 daily / Monday-10:00 weekly jobs
// (AGENTS Master Architecture spec s.31), mirroring the ScheduledJobRun
// pattern already proven at src/lib/jolchu/data-refresh.ts. A restart or a
// duplicate cron invocation for the same Bishkek period is a no-op once the
// run has SUCCEEDED — ScheduledJobRun's @@unique([jobName, periodKey])
// backs this, in addition to the report-level idempotency already in
// daily-brief.ts/weekly-report.ts (reportDate/weekStartDate unique), so
// there are two independent layers against duplicate generation.
//
// The scheduler is the trusted internal caller — the /api/cron/* routes
// authenticate the request via CRON_SECRET before ever reaching here, so
// this file calls the founder-gated generators as the "admin" break-glass
// role (role.ts's FOUNDER_ROLES) under a fixed system requester id, rather
// than inventing a second, parallel authorization bypass.
import { db } from "@/lib/db";
import type { ScheduledJobRun, ScheduledJobStatus } from "@prisma/client";
import type { AgentContext } from "@/lib/agents/types";
import { bishkekDateKey, bishkekWeekStartKey } from "./period";
import { generateDailyFounderBrief } from "./daily-brief";
import { generateWeeklyDirectorReport } from "./weekly-report";
import { sendFounderDailyBrief, sendFounderWeeklyReport } from "./notification-gateway";
import { emitArturEvent } from "./events";

const SCHEDULER_ROLE = "admin";
const SCHEDULER_REQUESTER_ID = "system:scheduler";

type ArturJobName = "artur-daily-brief" | "artur-weekly-report";
type TriggeredBy = "manual" | "scheduler";

async function runIdempotentJob(ctx: AgentContext, jobName: ArturJobName, periodKey: string, triggeredBy: TriggeredBy, work: () => Promise<string>): Promise<ScheduledJobRun> {
  const existing = await db.scheduledJobRun.findUnique({ where: { jobName_periodKey: { jobName, periodKey } } });
  if (existing?.status === "SUCCEEDED") return existing;

  const run = existing
    ? await db.scheduledJobRun.update({ where: { id: existing.id }, data: { status: "RUNNING" as ScheduledJobStatus, triggeredBy } })
    : await db.scheduledJobRun.create({ data: { jobName, periodKey, status: "RUNNING", triggeredBy } });

  try {
    const resultRefId = await work();
    const succeeded = await db.scheduledJobRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", finishedAt: new Date(), resultRefId } });
    await emitArturEvent(ctx, "SCHEDULED_JOB_SUCCEEDED", succeeded.id, "ScheduledJobRun", { jobName, periodKey });
    return succeeded;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed = await db.scheduledJobRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), errors: [message] } });
    await emitArturEvent(ctx, "SCHEDULED_JOB_FAILED", failed.id, "ScheduledJobRun", { jobName, periodKey, error: message });
    return failed;
  }
}

export async function runDailyFounderBriefJob(ctx: AgentContext, triggeredBy: TriggeredBy = "manual", dateKey?: string): Promise<ScheduledJobRun> {
  const periodKey = dateKey ?? bishkekDateKey(new Date());
  return runIdempotentJob(ctx, "artur-daily-brief", periodKey, triggeredBy, async () => {
    const brief = await generateDailyFounderBrief(ctx, SCHEDULER_ROLE, SCHEDULER_REQUESTER_ID, periodKey);
    await sendFounderDailyBrief(ctx, brief.id);
    return brief.id;
  });
}

export async function runWeeklyDirectorReportJob(ctx: AgentContext, triggeredBy: TriggeredBy = "manual", weekStartKeyInput?: string): Promise<ScheduledJobRun> {
  const periodKey = weekStartKeyInput ?? bishkekWeekStartKey(new Date());
  return runIdempotentJob(ctx, "artur-weekly-report", periodKey, triggeredBy, async () => {
    const report = await generateWeeklyDirectorReport(ctx, SCHEDULER_ROLE, SCHEDULER_REQUESTER_ID, periodKey);
    await sendFounderWeeklyReport(ctx, report.id);
    return report.id;
  });
}

export async function listScheduledJobRuns(limit = 50): Promise<ScheduledJobRun[]> {
  return db.scheduledJobRun.findMany({ orderBy: { startedAt: "desc" }, take: limit });
}
