// JolchuDataRefreshService: the mandatory monthly refresh of REFERENCE data
// (settlement/known-hub gazetteer, provider capability/config snapshot,
// benchmark case count) — explicitly NOT live traffic/ETA/road-condition
// data, which always stays real-time per request. No hidden self-training:
// every refresh is one observable, reversible JolchuDataRefreshRun row.
//
// There is no cron wired up yet — runJolchuDataRefresh() accepts
// triggeredBy: "scheduler" so a future cron job (or Vercel Cron) can call
// exactly this function without any further plumbing; today it is only
// invoked by the manual "Run refresh now" button in Jolchu Center.
import { db } from "@/lib/db";
import type { Prisma, JolchuDataRefreshRun } from "@prisma/client";
import { getDataRefreshIntervalDays } from "./config";
import { KNOWN_HUBS, KNOWN_LANDMARKS } from "./gazetteer";
import { getJolchuModelProviderStatus } from "./providers/model-provider";
import { getRouteProviderStatus } from "./route-providers/route-provider";

export interface JolchuRefreshStatusSnapshot {
  lastSuccessfulRun: JolchuDataRefreshRun | null;
  nextPlannedRefreshAt: Date | null;
  overdue: boolean;
  intervalDays: number;
}

export async function getJolchuRefreshStatus(): Promise<JolchuRefreshStatusSnapshot> {
  const intervalDays = getDataRefreshIntervalDays();
  const lastSuccessfulRun = await db.jolchuDataRefreshRun.findFirst({
    where: { status: "SUCCEEDED" },
    orderBy: { startedAt: "desc" },
  });

  if (!lastSuccessfulRun) {
    return { lastSuccessfulRun: null, nextPlannedRefreshAt: null, overdue: true, intervalDays };
  }

  const nextPlannedRefreshAt = new Date(lastSuccessfulRun.startedAt.getTime() + intervalDays * 86_400_000);
  return {
    lastSuccessfulRun,
    nextPlannedRefreshAt,
    overdue: nextPlannedRefreshAt.getTime() < Date.now(),
    intervalDays,
  };
}

function buildProviderSnapshot(): Prisma.InputJsonValue {
  return {
    modelProvider: getJolchuModelProviderStatus(),
    routeProvider: getRouteProviderStatus(),
    knownHubCount: KNOWN_HUBS.length,
    knownLandmarkCount: KNOWN_LANDMARKS.length,
    generatedAt: new Date().toISOString(),
  } as unknown as Prisma.InputJsonValue;
}

export async function runJolchuDataRefresh(triggeredBy: "manual" | "scheduler" = "manual"): Promise<JolchuDataRefreshRun> {
  const run = await db.jolchuDataRefreshRun.create({
    data: { status: "RUNNING", refreshVersion: `v${Date.now()}`, triggeredBy },
  });

  try {
    const providerSnapshot = buildProviderSnapshot();
    return await db.jolchuDataRefreshRun.update({
      where: { id: run.id },
      data: { status: "SUCCEEDED", finishedAt: new Date(), providerSnapshot },
    });
  } catch (err) {
    return db.jolchuDataRefreshRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), errors: [err instanceof Error ? err.message : String(err)] },
    });
  }
}
