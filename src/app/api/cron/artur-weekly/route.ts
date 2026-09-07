// Vercel Cron target for the Monday 10:00 Asia/Bishkek Weekly Director
// Report (AGENTS Master Architecture spec s.11/s.31). Scheduled at
// "0 4 * * 1" (Monday 04:00 UTC = Monday 10:00 Bishkek) in vercel.json.
// Same fail-closed CRON_SECRET guard as the daily route.
import { NextResponse } from "next/server";
import { rootContext } from "@/lib/agents/trace";
import { runWeeklyDirectorReportJob } from "@/lib/artur/scheduler";

function isAuthorizedCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const run = await runWeeklyDirectorReportJob(rootContext(), "scheduler");
  return NextResponse.json({ jobName: run.jobName, periodKey: run.periodKey, status: run.status, resultRefId: run.resultRefId });
}
