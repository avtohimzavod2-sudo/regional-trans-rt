// Read-only reads for the dispatcher UI (same pattern as
// driver-contractor/bridge.ts). Never a write path — this contractor's only
// writes go through prospect.ts, the shared sendAcquisitionOutreach gate, and
// the shared createProspectHandoff.
import { db } from "@/lib/db";

/** Recent delivery-executor-acquisition outreach attempts, most recent
 * first — feeds the dispatcher's Prospecting dashboard. */
export async function recentDeliveryExecutorAcquisitionOutreach(limit = 50) {
  return db.acquisitionOutreachEvent.findMany({
    where: { prospectType: "DELIVERY_EXECUTOR", contractorAgent: "DELIVERY_EXECUTOR_CONTRACTOR" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Delivery-executor prospects still awaiting a dispatcher decision. */
export async function pendingDeliveryExecutorProspects(limit = 50) {
  return db.deliveryExecutorProspect.findMany({
    where: { status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
