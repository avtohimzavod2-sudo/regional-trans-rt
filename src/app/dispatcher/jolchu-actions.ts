"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { logAction } from "@/lib/audit";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { runJolchuBenchmark } from "@/lib/jolchu/training/benchmark";
import { runJolchuDataRefresh } from "@/lib/jolchu/data-refresh";
import { getJolchuModelProviderStatus } from "@/lib/jolchu/providers/model-provider";
import { getRouteProviderStatus } from "@/lib/jolchu/route-providers/route-provider";

async function currentDispatcher() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);
  if (!session) throw new Error("Not authenticated");
  return session;
}

// Runs the 30-scenario Jolchu benchmark against whichever model/route
// providers are currently configured (mock unless real credentials are set)
// and persists a JolchuBenchmarkRun + per-case results.
export async function runJolchuBenchmarkAction() {
  const dispatcher = await currentDispatcher();
  const modelStatus = getJolchuModelProviderStatus();
  const routeStatus = getRouteProviderStatus();
  const outcome = await runJolchuBenchmark({
    persist: true,
    modelProviderLabel: modelStatus.configuredProvider,
    routeProviderLabel: routeStatus.configuredProvider,
  });
  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "jolchu.benchmark_run",
    entityType: "JolchuBenchmarkRun",
    entityId: outcome.runId ?? "unpersisted",
    details: { totalCases: outcome.summary.totalCases, overallScore: outcome.summary.overallScore, hallucinationCount: outcome.summary.hallucinationCount },
  });
  revalidatePath("/dispatcher/jolchu");
  revalidatePath("/dispatcher/jolchu/benchmarks");
}

// Manual trigger for the mandatory monthly reference-data refresh (gazetteer
// + provider capability snapshot). No live traffic/geography is ever cached
// by this — see data-refresh.ts.
export async function runJolchuDataRefreshAction() {
  const dispatcher = await currentDispatcher();
  const run = await runJolchuDataRefresh("manual");
  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "jolchu.data_refresh_run",
    entityType: "JolchuDataRefreshRun",
    entityId: run.id,
    details: { status: run.status },
  });
  revalidatePath("/dispatcher/jolchu");
  revalidatePath("/dispatcher/jolchu/data-freshness");
}
