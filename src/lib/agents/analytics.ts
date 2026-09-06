// ANALYTICS AGENT — read-only aggregate queries over the dispatch data for
// the dispatcher UI. No pure/DB split needed here (nothing to decide, only
// to report), so this module is thin Prisma aggregation, consistent with
// how the rest of the app already reports numbers to the dispatcher.
import { db } from "@/lib/db";
import type { AgentContract } from "./types";

export const ANALYTICS_AGENT_CONTRACT: AgentContract = {
  name: "ANALYTICS",
  mission: "Report demand/supply, fill rate, conversion, commission, cancellations and backhaul utilization to the dispatcher.",
  inputs: ["optional date range"],
  outputs: ["aggregate counts and rates — never a recommendation to act automatically"],
  permissions: ["read TripRequest/DriverOffer/Trip/Match/LedgerEntry"],
  prohibitedActions: ["never write any data", "never present partial data as a firm number without noting the range it covers"],
  kpi: ["own accuracy vs manual dispatcher counts"],
  escalationRules: ["none — analytics is read-only and never escalates"],
};

export interface DateRange {
  from?: Date;
  to?: Date;
}

function rangeWhere(field: "createdAt" | "travelDate", range?: DateRange) {
  if (!range || (!range.from && !range.to)) return {};
  return { [field]: { gte: range.from, lte: range.to } };
}

export async function getCompletedPassengersCount(range?: DateRange) {
  const agg = await db.trip.aggregate({
    where: { status: "COMPLETED", ...rangeWhere("createdAt", range) },
    _sum: { seats: true },
    _count: true,
  });
  return { completedTrips: agg._count, completedPassengers: agg._sum.seats ?? 0 };
}

export async function getDemandByRoute(range?: DateRange) {
  const grouped = await db.tripRequest.groupBy({
    by: ["originStopId", "destinationStopId"],
    where: rangeWhere("createdAt", range),
    _sum: { seats: true },
    _count: true,
  });
  return grouped.map((g) => ({
    originStopId: g.originStopId,
    destinationStopId: g.destinationStopId,
    requestCount: g._count,
    passengersRequested: g._sum.seats ?? 0,
  }));
}

export async function getSupplyByRoute(range?: DateRange) {
  const grouped = await db.driverOffer.groupBy({
    by: ["originStopId", "destinationStopId"],
    where: rangeWhere("createdAt", range),
    _sum: { seatsAvailable: true, seatsTotal: true },
    _count: true,
  });
  return grouped.map((g) => ({
    originStopId: g.originStopId,
    destinationStopId: g.destinationStopId,
    offerCount: g._count,
    seatsAvailable: g._sum.seatsAvailable ?? 0,
    seatsTotal: g._sum.seatsTotal ?? 0,
  }));
}

/** Routes where demand (requested seats) most exceeds supply (available seats) — candidates for driver recruiting. */
export async function getMostScarceDirections(range?: DateRange, limit = 5) {
  const [demand, supply] = await Promise.all([getDemandByRoute(range), getSupplyByRoute(range)]);
  const supplyByKey = new Map(supply.map((s) => [`${s.originStopId}:${s.destinationStopId}`, s.seatsAvailable]));

  return demand
    .map((d) => {
      const key = `${d.originStopId}:${d.destinationStopId}`;
      const seatsAvailable = supplyByKey.get(key) ?? 0;
      return { ...d, seatsAvailable, shortage: d.passengersRequested - seatsAvailable };
    })
    .sort((a, b) => b.shortage - a.shortage)
    .slice(0, limit);
}

export async function getFillRate(range?: DateRange) {
  const offers = await db.driverOffer.aggregate({
    where: rangeWhere("createdAt", range),
    _sum: { seatsTotal: true, seatsAvailable: true },
  });
  const seatsTotal = offers._sum.seatsTotal ?? 0;
  const seatsAvailable = offers._sum.seatsAvailable ?? 0;
  const seatsFilled = seatsTotal - seatsAvailable;
  return { seatsTotal, seatsFilled, fillRate: seatsTotal > 0 ? seatsFilled / seatsTotal : 0 };
}

export async function getConversionRate(range?: DateRange) {
  const [requestCount, confirmedCount] = await Promise.all([
    db.tripRequest.count({ where: rangeWhere("createdAt", range) }),
    db.tripRequest.count({ where: { status: "CONFIRMED", ...rangeWhere("createdAt", range) } }),
  ]);
  return { requestCount, confirmedCount, conversionRate: requestCount > 0 ? confirmedCount / requestCount : 0 };
}

export async function getCancellationStats(range?: DateRange) {
  const [total, cancelled] = await Promise.all([
    db.trip.count({ where: rangeWhere("createdAt", range) }),
    db.trip.count({ where: { status: "CANCELLED", ...rangeWhere("createdAt", range) } }),
  ]);
  return { total, cancelled, cancellationRate: total > 0 ? cancelled / total : 0 };
}

export async function getRtCommissionTotal(range?: DateRange) {
  const agg = await db.trip.aggregate({
    where: { commissionChargedAt: { not: null }, ...rangeWhere("createdAt", range) },
    _sum: { commissionSom: true },
  });
  return agg._sum.commissionSom ?? 0;
}

export async function getBackhaulUtilization(range?: DateRange) {
  const [totalBackhaul, filledBackhaul] = await Promise.all([
    db.driverOffer.count({ where: { isReturnLeg: true, ...rangeWhere("createdAt", range) } }),
    db.driverOffer.count({ where: { isReturnLeg: true, status: { in: ["FULL", "CLOSED"] }, ...rangeWhere("createdAt", range) } }),
  ]);
  return { totalBackhaul, filledBackhaul, utilizationRate: totalBackhaul > 0 ? filledBackhaul / totalBackhaul : 0 };
}

export async function getMostValuableDrivers(range?: DateRange, limit = 10) {
  const grouped = await db.trip.groupBy({
    by: ["driverId"],
    where: { status: "COMPLETED", ...rangeWhere("createdAt", range) },
    _sum: { seats: true, commissionSom: true },
    _count: true,
    orderBy: { _sum: { commissionSom: "desc" } },
    take: limit,
  });

  const drivers = await db.driver.findMany({ where: { id: { in: grouped.map((g) => g.driverId) } } });
  const driverById = new Map(drivers.map((d) => [d.id, d]));

  return grouped.map((g) => ({
    driverId: g.driverId,
    name: driverById.get(g.driverId)?.name ?? null,
    category: driverById.get(g.driverId)?.category ?? "UNKNOWN",
    completedTrips: g._count,
    passengersCarried: g._sum.seats ?? 0,
    commissionGeneratedSom: g._sum.commissionSom ?? 0,
  }));
}
