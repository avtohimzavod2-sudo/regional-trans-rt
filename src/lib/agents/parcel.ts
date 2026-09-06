// PARCEL AGENT — sender/receiver/route/size/price parcel bookings, carried
// by a driver alongside (or instead of) passengers. Owns the Parcel status
// machine: PENDING -> ASSIGNED -> PICKED_UP -> IN_TRANSIT -> DELIVERED, with
// CANCELLED/DISPUTED as terminal/side states.
import type { ParcelStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { logAgentAction } from "./trace";
import type { AgentContext, AgentContract } from "./types";

export const PARCEL_AGENT_CONTRACT: AgentContract = {
  name: "PARCEL",
  mission: "Book and track parcel deliveries carried by RT drivers between corridor stops.",
  inputs: ["sender contact", "receiver contact", "origin/destination stop", "size/description", "price"],
  outputs: ["Parcel record", "status transitions", "pickup/delivery confirmations"],
  permissions: ["read/write Parcel", "read Driver/Stop", "write AuditLogEntry"],
  prohibitedActions: ["never mark DELIVERED without an explicit delivery confirmation", "never assign a parcel to a driver without free capacity"],
  kpi: ["parcels delivered", "parcel cancellation/dispute rate"],
  escalationRules: ["a parcel stuck in IN_TRANSIT past its trip's completion should escalate to SUPPORT"],
};

const VALID_TRANSITIONS: Record<ParcelStatus, ParcelStatus[]> = {
  PENDING: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["IN_TRANSIT", "DISPUTED"],
  IN_TRANSIT: ["DELIVERED", "DISPUTED"],
  DELIVERED: [],
  CANCELLED: [],
  DISPUTED: ["IN_TRANSIT", "CANCELLED"],
};

/** Pure: whether a status transition is allowed by the parcel state machine. */
export function canTransitionParcel(from: ParcelStatus, to: ParcelStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export class InvalidParcelTransitionError extends Error {
  constructor(from: ParcelStatus, to: ParcelStatus) {
    super(`Cannot transition Parcel from ${from} to ${to}`);
    this.name = "InvalidParcelTransitionError";
  }
}

export async function createParcel(
  ctx: AgentContext,
  params: {
    senderContact: string;
    senderName?: string;
    receiverContact: string;
    receiverName?: string;
    originStopId: string;
    destinationStopId: string;
    sizeType?: string;
    description?: string;
    priceSom?: number;
  },
) {
  const parcel = await db.parcel.create({ data: params });

  await logAgentAction({
    ctx,
    agent: "PARCEL",
    action: "parcel.created",
    entityType: "Parcel",
    entityId: parcel.id,
    details: { originStopId: params.originStopId, destinationStopId: params.destinationStopId },
  });

  return parcel;
}

export async function transitionParcel(ctx: AgentContext, parcelId: string, to: ParcelStatus, extra?: { driverId?: string; tripId?: string; cancelReason?: string }) {
  const parcel = await db.parcel.findUniqueOrThrow({ where: { id: parcelId } });

  if (!canTransitionParcel(parcel.status, to)) {
    throw new InvalidParcelTransitionError(parcel.status, to);
  }

  const updated = await db.parcel.update({
    where: { id: parcelId },
    data: {
      status: to,
      driverId: extra?.driverId ?? parcel.driverId,
      tripId: extra?.tripId ?? parcel.tripId,
      cancelReason: extra?.cancelReason ?? parcel.cancelReason,
      pickupConfirmedAt: to === "PICKED_UP" ? new Date() : parcel.pickupConfirmedAt,
      deliveryConfirmedAt: to === "DELIVERED" ? new Date() : parcel.deliveryConfirmedAt,
    },
  });

  await logAgentAction({
    ctx,
    agent: "PARCEL",
    action: "parcel.status_changed",
    entityType: "Parcel",
    entityId: parcelId,
    details: { from: parcel.status, to },
  });

  return updated;
}
