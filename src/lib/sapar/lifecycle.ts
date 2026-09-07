// Sapar's shipment lifecycle state machine (AGENTS spec s.15). Mirrors
// src/lib/agents/parcel.ts's canTransitionParcel()/InvalidParcelTransitionError
// pattern, extended for Sapar's 16-state machine and made idempotent:
// transitioning to the status a shipment is already in is a no-op, not an
// error, so a repeated webhook/confirmation call never fails or double-logs
// (AGENTS spec s.32 — critical operations must be idempotent).
import type { ShipmentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { logAgentAction } from "@/lib/agents/trace";
import type { AgentContext } from "@/lib/agents/types";

const VALID_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  DRAFT: ["NEEDS_INFO", "READY_FOR_MATCHING", "CANCELLED"],
  NEEDS_INFO: ["READY_FOR_MATCHING", "CANCELLED"],
  READY_FOR_MATCHING: ["SEARCHING", "CANCELLED"],
  SEARCHING: ["QUOTED", "FAILED", "CANCELLED"],
  QUOTED: ["AWAITING_CONFIRMATION", "CANCELLED"],
  AWAITING_CONFIRMATION: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["AWAITING_PICKUP", "CANCELLED"],
  AWAITING_PICKUP: ["PICKED_UP", "FAILED", "CANCELLED"],
  PICKED_UP: ["IN_TRANSIT", "DISPUTED"],
  IN_TRANSIT: ["AT_TRANSFER_POINT", "OUT_FOR_DELIVERY", "DISPUTED", "FAILED"],
  AT_TRANSFER_POINT: ["IN_TRANSIT", "OUT_FOR_DELIVERY", "DISPUTED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "DISPUTED", "FAILED"],
  DELIVERED: ["DISPUTED"],
  FAILED: ["READY_FOR_MATCHING", "CANCELLED"], // e.g. executor needs replacement -> re-match
  CANCELLED: [],
  DISPUTED: ["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
};

/** Pure: whether a status transition is allowed by the shipment state
 * machine (e.g. DELIVERED -> PICKED_UP is always false). */
export function canTransitionShipment(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export class InvalidShipmentTransitionError extends Error {
  constructor(from: ShipmentStatus, to: ShipmentStatus) {
    super(`Cannot transition Shipment from ${from} to ${to}`);
    this.name = "InvalidShipmentTransitionError";
  }
}

export interface TransitionShipmentExtra {
  cancelReason?: string;
  completedAt?: Date;
  cancelledAt?: Date;
}

export async function transitionShipment(ctx: AgentContext, shipmentId: string, to: ShipmentStatus, extra?: TransitionShipmentExtra) {
  const shipment = await db.shipment.findUniqueOrThrow({ where: { id: shipmentId } });

  if (shipment.status === to) {
    return shipment; // idempotent: already there, no-op, no duplicate audit entry
  }
  if (!canTransitionShipment(shipment.status, to)) {
    throw new InvalidShipmentTransitionError(shipment.status, to);
  }

  const updated = await db.shipment.update({
    where: { id: shipmentId },
    data: {
      status: to,
      cancelReason: extra?.cancelReason ?? shipment.cancelReason,
      completedAt: to === "DELIVERED" ? (extra?.completedAt ?? new Date()) : shipment.completedAt,
      cancelledAt: to === "CANCELLED" ? (extra?.cancelledAt ?? new Date()) : shipment.cancelledAt,
    },
  });

  await logAgentAction({
    ctx,
    agent: "SAPAR",
    action: "sapar.status_changed",
    entityType: "Shipment",
    entityId: shipmentId,
    details: { from: shipment.status, to },
  });

  return updated;
}
