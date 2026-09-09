// Read-only reads for the dispatcher UI (same pattern as crm-auto/bridge.ts).
// Writes always go through orchestrator.ts's deterministic lifecycle
// transitions + crm.ts's append-only event log, never touched directly here.
import { db } from "@/lib/db";

export async function recentBusinessAcquisitionOutreach(limit = 50) {
  return db.acquisitionOutreachEvent.findMany({
    where: { prospectType: "BUSINESS", contractorAgent: "DELIVERY_CONTRACTOR" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function businessProspectPipeline(limit = 100) {
  return db.businessProspect.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function businessProspectWithHistory(prospectId: string) {
  return db.businessProspect.findUnique({
    where: { id: prospectId },
    include: { events: { orderBy: { createdAt: "desc" } } },
  });
}
