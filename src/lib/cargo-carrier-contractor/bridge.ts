// Read-only reads for the dispatcher UI (same pattern as
// delivery-executor-contractor/bridge.ts). Never a write path — this
// contractor's only writes go through prospect.ts, the shared
// sendAcquisitionOutreach gate, and the shared createProspectHandoff.
import { db } from "@/lib/db";

/** Recent cargo-carrier-acquisition outreach attempts, most recent first —
 * feeds the dispatcher's Prospecting dashboard. */
export async function recentCargoCarrierAcquisitionOutreach(limit = 50) {
  return db.acquisitionOutreachEvent.findMany({
    where: { prospectType: "CARGO_CARRIER", contractorAgent: "CARGO_CARRIER_CONTRACTOR" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Cargo-carrier prospects still awaiting a dispatcher decision. */
export async function pendingCargoCarrierProspects(limit = 50) {
  return db.cargoCarrierProspect.findMany({
    where: { status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
