// Market Gap — RT OFFICE already owns demand<->supply resolution (facts.ts),
// so this is the natural, single home for the aggregate version of the same
// comparison (master spec: "CLIENTS NEED VEHICLES. VEHICLES NEED CLIENTS.").
// Pure read-only aggregation over RT Core's existing TripRequest/DriverOffer
// tables — same "never invent a number" discipline as facts.ts and the
// src/lib/mira/lead-lifecycle.ts precedent ("map/extend existing types
// cleanly, do not introduce a duplicate source of truth"). No new Prisma
// model, no new agent, no write path: the Driver/Passenger Contractors read
// this to decide acquisition priority, they never compute their own
// demand/supply numbers (master spec: "Do NOT let contractors independently
// invent market demand/supply numbers").
import { db } from "@/lib/db";

export type MarketGapPriority = "HIGH_DRIVER_ACQUISITION_NEED" | "BALANCED" | "PASSENGER_ACQUISITION_NEED";

export interface MarketGapResult {
  demandSeats: number;
  supplySeats: number;
  /** supplySeats - demandSeats: negative means supply is short, positive
   * means supply exceeds demand. Never a hardcoded example value — always
   * computed live from the query below. */
  gapSeats: number;
  priority: MarketGapPriority;
  windowDays: number;
  corridorId: string | null;
  asOf: string;
}

const DEFAULT_WINDOW_DAYS = 14;
// A gap must clear BOTH an absolute floor and a proportion of demand before
// it is reported as actionable — a 1-seat gap on a 2-seat market is noise,
// not a real acquisition signal.
const MIN_SIGNIFICANT_GAP_SEATS = 3;
const SIGNIFICANT_GAP_RATIO = 0.2;

function classifyGap(demandSeats: number, gapSeats: number): MarketGapPriority {
  const threshold = Math.max(MIN_SIGNIFICANT_GAP_SEATS, demandSeats * SIGNIFICANT_GAP_RATIO);
  if (gapSeats <= -threshold) return "HIGH_DRIVER_ACQUISITION_NEED";
  if (gapSeats >= threshold) return "PASSENGER_ACQUISITION_NEED";
  return "BALANCED";
}

export interface ComputeMarketGapOptions {
  /** Restrict to one corridor's stops; omitted = network-wide. */
  corridorId?: string;
  /** Aggregation window starting today, in days. */
  windowDays?: number;
}

/** Aggregates unresolved passenger demand (TripRequest.seats, status
 * PENDING/MATCHING) against verified driver supply (DriverOffer.
 * seatsAvailable, status OPEN/PARTIALLY_FILLED) over a rolling window
 * starting today. Read-only, never mutates anything. */
export async function computeMarketGap(options: ComputeMarketGapOptions = {}): Promise<MarketGapResult> {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const windowEnd = new Date(todayStart.getTime() + windowDays * 24 * 60 * 60 * 1000);

  const corridorFilter = options.corridorId ? { corridorId: options.corridorId } : undefined;

  const [demandAgg, supplyAgg] = await Promise.all([
    db.tripRequest.aggregate({
      _sum: { seats: true },
      where: {
        status: { in: ["PENDING", "MATCHING"] },
        travelDate: { gte: todayStart, lt: windowEnd },
        ...(corridorFilter ? { origin: { is: corridorFilter } } : {}),
      },
    }),
    db.driverOffer.aggregate({
      _sum: { seatsAvailable: true },
      where: {
        status: { in: ["OPEN", "PARTIALLY_FILLED"] },
        travelDate: { gte: todayStart, lt: windowEnd },
        ...(corridorFilter ? { origin: { is: corridorFilter } } : {}),
      },
    }),
  ]);

  const demandSeats = demandAgg._sum.seats ?? 0;
  const supplySeats = supplyAgg._sum.seatsAvailable ?? 0;
  const gapSeats = supplySeats - demandSeats;

  return {
    demandSeats,
    supplySeats,
    gapSeats,
    priority: classifyGap(demandSeats, gapSeats),
    windowDays,
    corridorId: options.corridorId ?? null,
    asOf: now.toISOString(),
  };
}
