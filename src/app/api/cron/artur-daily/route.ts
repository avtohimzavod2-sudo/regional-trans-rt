// Vercel Cron target for the 08:00 Asia/Bishkek daily Founder Brief (AGENTS
// Master Architecture spec s.9/s.31). Scheduled at "0 2 * * *" (02:00 UTC =
// 08:00 Bishkek, no DST) in vercel.json. Fails closed: if CRON_SECRET is not
// configured, every request is rejected rather than allowing an
// unauthenticated caller to trigger report generation.
import { NextResponse } from "next/server";
import { rootContext } from "@/lib/agents/trace";
import { runDailyFounderBriefJob } from "@/lib/artur/scheduler";

function isAuthorizedCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const run = await runDailyFounderBriefJob(rootContext(), "scheduler");
  return NextResponse.json({ jobName: run.jobName, periodKey: run.periodKey, status: run.status, resultRefId: run.resultRefId });
}
