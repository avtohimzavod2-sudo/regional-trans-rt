// Minimal-disclosure outward-facing reads (same pattern as
// src/lib/rt-office/bridge.ts / src/lib/adilet/bridge.ts). CRM Auto is the
// single access point — read and write — onto DriveCrmEvent, so consumers
// (RT OFFICE's fact resolution, Artur's read-only operational visibility)
// go through here instead of querying the model directly.
import { db } from "@/lib/db";

export interface OpenBreakdownFact {
  hasOpenBreakdown: boolean;
}

export interface VerifiedEtaFact {
  etaMinutes: number | null;
  freshness: { source: string; asOf: string } | null;
  /** True only when an explicit verified signal was recorded — never
   * inferred from a timestamp comparison. */
  delayed: boolean;
  arrived: boolean;
}

/** RT OFFICE's operational-state derivation needs only whether an OPEN
 * breakdown currently exists — never the incident's internal detail.
 *
 * Reads the driver's MOST RECENT BREAKDOWN_INCIDENT row regardless of status
 * (not "any row with incidentStatus OPEN" — that would still match a stale
 * OPEN row forever, since resolveBreakdownIncident appends a new RESOLVED
 * row rather than mutating the OPEN one). Only when that latest row is
 * itself OPEN do we report a breakdown.
 *
 * A latest-OPEN incident is additionally treated as resolved for this
 * derived read if an exceptional CORRECTION event references it
 * (correctsEventId) — the correction never mutates the original row's
 * incidentStatus (append-only, see boundary.test.ts), it only changes what
 * this derived operational-state read reports. */
export async function latestOpenBreakdownForDriver(driverId: string): Promise<OpenBreakdownFact> {
  const latestIncident = await db.driveCrmEvent.findFirst({
    where: { driverId, eventType: "BREAKDOWN_INCIDENT" },
    orderBy: { createdAt: "desc" },
  });
  if (!latestIncident || latestIncident.incidentStatus !== "OPEN") {
    return { hasOpenBreakdown: false };
  }

  const correction = await db.driveCrmEvent.findFirst({
    where: { driverId, eventType: "CORRECTION", correctsEventId: latestIncident.id },
  });
  return { hasOpenBreakdown: !correction };
}

/** Same rule as latestOpenBreakdownForDriver (latest BREAKDOWN_INCIDENT per
 * driver, honoring an exceptional CORRECTION without ever mutating the
 * original row), batched across many drivers in two queries instead of one
 * findFirst pair per driver — for callers (e.g. matching candidate
 * filtering) that need this fact for a whole set of drivers at once and
 * would otherwise run it in an N+1 loop. */
export async function openBreakdownForDrivers(driverIds: string[]): Promise<Map<string, boolean>> {
  const uniqueIds = Array.from(new Set(driverIds));
  if (uniqueIds.length === 0) return new Map();

  const [incidents, corrections] = await Promise.all([
    db.driveCrmEvent.findMany({
      where: { driverId: { in: uniqueIds }, eventType: "BREAKDOWN_INCIDENT" },
      orderBy: { createdAt: "desc" },
    }),
    db.driveCrmEvent.findMany({
      where: { driverId: { in: uniqueIds }, eventType: "CORRECTION" },
      select: { correctsEventId: true },
    }),
  ]);

  const correctedEventIds = new Set(corrections.map((c) => c.correctsEventId));
  const latestIncidentByDriver = new Map<string, (typeof incidents)[number]>();
  for (const incident of incidents) {
    // incidents is ordered by createdAt desc, so the first one seen per
    // driver is that driver's latest — matching latestOpenBreakdownForDriver's
    // "most recent row wins" semantics exactly.
    if (!latestIncidentByDriver.has(incident.driverId)) {
      latestIncidentByDriver.set(incident.driverId, incident);
    }
  }

  const result = new Map<string, boolean>();
  for (const driverId of uniqueIds) {
    const latest = latestIncidentByDriver.get(driverId);
    const hasOpenBreakdown = !!latest && latest.incidentStatus === "OPEN" && !correctedEventIds.has(latest.id);
    result.set(driverId, hasOpenBreakdown);
  }
  return result;
}

/** RT OFFICE's SupplyFact.etaMinutes/freshness/delayed/arrived, all sourced
 * from the single latest verified ETA event recorded for one specific
 * offer — never a fabricated fallback. */
export async function latestVerifiedEtaForOffer(driverId: string, offerId: string): Promise<VerifiedEtaFact> {
  const latestEta = await db.driveCrmEvent.findFirst({
    where: { driverId, eventType: "OPERATIONAL_ETA", offerId },
    orderBy: { createdAt: "desc" },
  });
  const details = (latestEta?.details ?? null) as { delayed?: boolean; arrived?: boolean } | null;
  return {
    etaMinutes: latestEta?.etaMinutes ?? null,
    freshness: latestEta ? { source: latestEta.source, asOf: latestEta.createdAt.toISOString() } : null,
    delayed: details?.delayed === true,
    arrived: details?.arrived === true,
  };
}

/** Artur's read-only Drive CRM visibility (spec s.9) — full recent history,
 * never mutation access. */
export async function operationalHistoryForArtur(driverId: string, limit = 20) {
  return db.driveCrmEvent.findMany({
    where: { driverId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Read-only cross-driver operational feed for the Drive CRM dispatcher
 * screen — same append-only, never-mutated data as operationalHistoryForArtur,
 * just not scoped to one driver. Never a write path. */
export async function recentOperationalEvents(limit = 50) {
  return db.driveCrmEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { driver: { select: { name: true, carPlate: true, telegramUsername: true } } },
  });
}
