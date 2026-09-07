// Executor directory lookups (AGENTS spec s.17/s.21). Reliability scoring
// lives here rather than in matching.ts because it needs the DB (order
// history); matching.ts stays pure/DB-free and just consumes the number
// this module produces.
import { db } from "@/lib/db";
import type { DeliveryExecutor } from "@prisma/client";

const MIN_OBSERVATIONS_FOR_RELIABILITY_SCORE = 3;

/** Naive zone match: an executor covers a shipment's pickup/destination if
 * either free-text field mentions (or is mentioned by) one of the
 * executor's declared zones. Good enough while geography stays free-text
 * (AGENTS spec s.3/s.42) — no geocoding dependency required. */
export async function findCandidateExecutors(pickupText: string | null, destinationText: string | null): Promise<DeliveryExecutor[]> {
  const needles = [pickupText, destinationText].filter((s): s is string => !!s && s.trim().length > 0).map((s) => s.toLowerCase());
  if (needles.length === 0) return [];

  const executors = await db.deliveryExecutor.findMany({ where: { status: "ACTIVE" }, take: 50 });
  return executors.filter((e) => e.zones.some((zone) => needles.some((n) => n.includes(zone.toLowerCase()) || zone.toLowerCase().includes(n))));
}

/** Pure: derive a 0..1 reliability score, or null when there isn't enough
 * history yet to be confident (a new executor is NOT scored as unreliable —
 * AGENTS spec s.18 — matching.ts scores a null the same as a neutral 0.5). */
export function computeReliabilityScore(executor: Pick<DeliveryExecutor, "totalOrders" | "completedOrders" | "cancelledOrders" | "lateCount" | "complaintsCount" | "lostCount" | "damagedCount">): number | null {
  if (executor.totalOrders < MIN_OBSERVATIONS_FOR_RELIABILITY_SCORE) return null;

  const completionRate = executor.completedOrders / executor.totalOrders;
  const cancellationPenalty = executor.cancelledOrders / executor.totalOrders;
  const latePenalty = executor.lateCount / executor.totalOrders;
  const incidentPenalty = (executor.complaintsCount + executor.lostCount * 2 + executor.damagedCount * 2) / executor.totalOrders;

  const score = completionRate - cancellationPenalty * 0.5 - latePenalty * 0.3 - incidentPenalty * 0.4;
  return Math.max(0, Math.min(1, score));
}

export async function recordExecutorOutcome(executorId: string, outcome: "completed" | "cancelled" | "late" | "lost" | "damaged" | "complaint") {
  const field: Record<typeof outcome, string> = {
    completed: "completedOrders",
    cancelled: "cancelledOrders",
    late: "lateCount",
    lost: "lostCount",
    damaged: "damagedCount",
    complaint: "complaintsCount",
  };
  await db.deliveryExecutor.update({
    where: { id: executorId },
    data: { totalOrders: { increment: outcome === "completed" || outcome === "cancelled" ? 1 : 0 }, [field[outcome]]: { increment: 1 } },
  });
}
