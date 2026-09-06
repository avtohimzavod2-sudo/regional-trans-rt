// NETWORK AGENT — partner directory: fleets, dispatchers, RT Points, cafes,
// gas stations, supermarkets, couriers, last-mile partners.
import type { PartnerType } from "@prisma/client";
import { db } from "@/lib/db";
import { logAgentAction } from "./trace";
import type { AgentContext, AgentContract } from "./types";

export const NETWORK_AGENT_CONTRACT: AgentContract = {
  name: "NETWORK",
  mission: "Maintain RT's partner directory (fleets, dispatchers, RT Points, and last-mile partners) tied to corridor stops.",
  inputs: ["partner type", "name", "contact", "stop (optional)"],
  outputs: ["Partner record"],
  permissions: ["read/write Partner", "write AuditLogEntry"],
  prohibitedActions: ["never mark a partner active without a name and at least one contact method"],
  kpi: ["active partners per stop", "partner coverage on corridors with no RT Point"],
  escalationRules: ["none — CRUD is dispatcher-driven, not autonomous"],
};

export async function createPartner(
  ctx: AgentContext,
  params: { type: PartnerType; name: string; contactPhone?: string; contactHandle?: string; stopId?: string; notes?: string },
) {
  const partner = await db.partner.create({ data: params });

  await logAgentAction({
    ctx,
    agent: "NETWORK",
    action: "network.partner_created",
    entityType: "Partner",
    entityId: partner.id,
    details: { type: params.type, stopId: params.stopId ?? null },
  });

  return partner;
}

export async function setPartnerActive(ctx: AgentContext, partnerId: string, isActive: boolean) {
  const partner = await db.partner.update({ where: { id: partnerId }, data: { isActive } });

  await logAgentAction({
    ctx,
    agent: "NETWORK",
    action: isActive ? "network.partner_activated" : "network.partner_deactivated",
    entityType: "Partner",
    entityId: partnerId,
    details: {},
  });

  return partner;
}

export async function listPartnersByStop(stopId: string) {
  return db.partner.findMany({ where: { stopId, isActive: true }, orderBy: { name: "asc" } });
}
