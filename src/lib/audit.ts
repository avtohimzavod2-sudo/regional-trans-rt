import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

type ActorType = "AGENT" | "DISPATCHER" | "SYSTEM";

export async function logAction(params: {
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  details?: Prisma.InputJsonValue;
}) {
  return db.auditLogEntry.create({
    data: {
      actorType: params.actorType,
      actorId: params.actorId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      details: params.details,
    },
  });
}
