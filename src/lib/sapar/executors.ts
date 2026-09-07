// Executor directory lookups (AGENTS spec s.17/s.21). Reliability scoring
// lives here rather than in matching.ts because it needs the DB (order
// history); matching.ts stays pure/DB-free and just consumes the number
// this module produces.
import { db } from "@/lib/db";
import type { DeliveryExecutor } from "@prisma/client";
import type { ShipmentCargoRequirements } from "./types";

const MIN_OBSERVATIONS_FOR_RELIABILITY_SCORE = 3;

type ExecutorCapabilityProfile = Pick<
  DeliveryExecutor,
  "maxWeightKg" | "maxPieces" | "acceptsFragile" | "acceptsPerishable" | "acceptsTemperatureControlled"
>;

/** Pure: whether an executor's declared capability profile can handle a
 * shipment's cargo requirements. An unset limit (null) means "no declared
 * limit" and never excludes a candidate on its own — only an explicit,
 * declared incompatibility does (AGENTS hardening spec s.9: capability-based
 * matching, not every executor has to support every function). */
export function executorCanHandle(executor: ExecutorCapabilityProfile, requirements: ShipmentCargoRequirements): boolean {
  if (requirements.weightKg !== null && executor.maxWeightKg !== null && requirements.weightKg > executor.maxWeightKg) return false;
  if (requirements.pieces !== null && executor.maxPieces !== null && requirements.pieces > executor.maxPieces) return false;
  if (requirements.fragile && !executor.acceptsFragile) return false;
  if (requirements.perishable && !executor.acceptsPerishable) return false;
  if (requirements.temperatureControlled && !executor.acceptsTemperatureControlled) return false;
  return true;
}

/** Naive zone match: an executor covers a shipment's pickup/destination if
 * either free-text field mentions (or is mentioned by) one of the
 * executor's declared zones. Good enough while geography stays free-text
 * (AGENTS spec s.3/s.42) — no geocoding dependency required.
 *
 * Trust tier is intentionally NOT filtered here (BLOCKED/SUSPENDED are
 * already excluded via `status: "ACTIVE"`): UNVERIFIED executors still
 * enter the candidate pool so matching.ts can rank them with an explicit
 * penalty rather than silently hiding otherwise-available supply (AGENTS
 * hardening spec s.10's "penalty" option, chosen as the safer default). */
export async function findCandidateExecutors(
  pickupText: string | null,
  destinationText: string | null,
  requirements?: ShipmentCargoRequirements,
): Promise<DeliveryExecutor[]> {
  const needles = [pickupText, destinationText].filter((s): s is string => !!s && s.trim().length > 0).map((s) => s.toLowerCase());
  if (needles.length === 0) return [];

  const executors = await db.deliveryExecutor.findMany({ where: { status: "ACTIVE" }, take: 50 });
  const zoneMatched = executors.filter((e) => e.zones.some((zone) => needles.some((n) => n.includes(zone.toLowerCase()) || zone.toLowerCase().includes(n))));
  if (!requirements) return zoneMatched;
  return zoneMatched.filter((e) => executorCanHandle(e, requirements));
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
