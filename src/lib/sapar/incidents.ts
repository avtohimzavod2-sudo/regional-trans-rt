// Sapar's exception/incident handling (AGENTS spec s.26/s.28). Mirrors
// src/lib/agents/support.ts's SupportCase pattern: open with a severity,
// resolve with a note, escalate serious ones for a human. Kept separate
// from SupportCase itself since Sapar's incidents are shipment/leg-scoped
// and need their own severity ladder (a lost lithium-battery shipment is a
// different kind of urgent than a late passenger pickup).
import type { ActorType, ShipmentIncidentSeverity } from "@prisma/client";
import { db } from "@/lib/db";
import { logAgentAction } from "@/lib/agents/trace";
import type { AgentContext } from "@/lib/agents/types";
import type { ShipmentIncidentInput } from "./types";

// Auto-escalated on open — a human decides, per AGENTS spec s.28.
const AUTO_ESCALATED_SEVERITIES: ShipmentIncidentSeverity[] = ["HIGH", "CRITICAL"];

export async function openShipmentIncident(ctx: AgentContext, params: ShipmentIncidentInput & { openedByType: ActorType; openedById?: string }) {
  const status = AUTO_ESCALATED_SEVERITIES.includes(params.severity) ? "ESCALATED" : "OPEN";

  const incident = await db.shipmentIncident.create({
    data: {
      shipmentId: params.shipmentId,
      legId: params.legId ?? null,
      type: params.type,
      severity: params.severity,
      status,
      openedByType: params.openedByType,
      openedById: params.openedById,
      description: params.description ?? null,
      escalatedAt: status === "ESCALATED" ? new Date() : null,
    },
  });

  await logAgentAction({
    ctx,
    agent: "SAPAR",
    action: "sapar.incident_opened",
    entityType: "ShipmentIncident",
    entityId: incident.id,
    details: { shipmentId: params.shipmentId, type: params.type, severity: params.severity, status },
  });

  return incident;
}

export async function resolveShipmentIncident(ctx: AgentContext, incidentId: string, resolution: string) {
  const incident = await db.shipmentIncident.update({
    where: { id: incidentId },
    data: { status: "RESOLVED", resolution, resolvedAt: new Date() },
  });

  await logAgentAction({
    ctx,
    agent: "SAPAR",
    action: "sapar.incident_resolved",
    entityType: "ShipmentIncident",
    entityId: incidentId,
    details: { resolution },
  });

  return incident;
}
