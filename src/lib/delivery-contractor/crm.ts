// The Delivery CRM: append-only DeliveryCrmEvent log tied to BusinessProspect
// — explicitly distinct from Partner and Shipment (spec: "never overlap
// Partner or Shipment"). Same P2002-idempotency template as
// crm-auto/orchestrator.ts's recordOperationalEvent — two deliveries of the
// same event race concurrently, so dedup is a real unique-constraint catch,
// never a check-then-write race.
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { RecordDeliveryCrmEventInput, RecordDeliveryCrmEventOutcome } from "./types";

export async function recordDeliveryCrmEvent(input: RecordDeliveryCrmEventInput): Promise<RecordDeliveryCrmEventOutcome> {
  if (input.eventType === "CORRECTION" && (!input.correctsEventId || input.correctsEventId.trim().length === 0)) {
    throw new Error("Delivery CRM rejected event: CORRECTION requires a non-blank correctsEventId");
  }
  if (input.eventType !== "CORRECTION" && input.correctsEventId) {
    throw new Error("Delivery CRM rejected event: correctsEventId is only meaningful for CORRECTION");
  }

  try {
    const event = await db.deliveryCrmEvent.create({
      data: {
        businessProspectId: input.businessProspectId,
        eventType: input.eventType,
        details: input.details as Prisma.InputJsonValue | undefined,
        source: input.source,
        correctsEventId: input.correctsEventId,
        idempotencyKey: input.idempotencyKey,
      },
    });
    return { eventId: event.id, deduplicated: false };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await db.deliveryCrmEvent.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey } });
      return { eventId: existing.id, deduplicated: true };
    }
    throw err;
  }
}

/** Append-only audited correction of an earlier event — never updates or
 * deletes the original row (see boundary.test.ts), only supersedes its
 * meaning via correctsEventId, same discipline as
 * crm-auto's recordExceptionalCorrection. */
export async function recordDeliveryCrmCorrection(params: {
  businessProspectId: string;
  correctsEventId: string;
  reason: string;
  source: string;
  idempotencyKey: string;
}): Promise<RecordDeliveryCrmEventOutcome> {
  return recordDeliveryCrmEvent({
    businessProspectId: params.businessProspectId,
    eventType: "CORRECTION",
    source: params.source,
    correctsEventId: params.correctsEventId,
    details: { reason: params.reason },
    idempotencyKey: params.idempotencyKey,
  });
}

/** Read-only event history for one business prospect (dispatcher UI / audit). */
export async function deliveryCrmHistoryForProspect(businessProspectId: string, limit = 50) {
  return db.deliveryCrmEvent.findMany({
    where: { businessProspectId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Read-only cross-prospect Delivery CRM feed for the dispatcher screen. */
export async function recentDeliveryCrmEvents(limit = 50) {
  return db.deliveryCrmEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { businessProspect: { select: { businessName: true, category: true, status: true } } },
  });
}
