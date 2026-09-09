// Read-only reads for the dispatcher UI (same pattern as crm-auto/bridge.ts).
// Never a write path — DRIVER_CONTRACTOR's only writes go through SCOUT's
// importScoutCandidate and the shared sendAcquisitionOutreach gate.
import { db } from "@/lib/db";

/** Recent driver-acquisition outreach attempts, most recent first — feeds
 * the dispatcher's Market Acquisition dashboard. */
export async function recentDriverAcquisitionOutreach(limit = 50) {
  return db.acquisitionOutreachEvent.findMany({
    where: { prospectType: "DRIVER", contractorAgent: "DRIVER_CONTRACTOR" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Scout candidates sourced by driver-contractor sightings still awaiting a
 * dispatcher decision — reuses SCOUT's own review queue, never a duplicate one. */
export async function pendingDriverProspects(limit = 50) {
  return db.scoutCandidate.findMany({
    where: { reviewStatus: "PENDING_REVIEW" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
