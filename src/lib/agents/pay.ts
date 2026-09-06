// PAY AGENT — RT earns 100 som per actually-transported passenger (seat).
// No real payment gateway is wired up: this models the domain (commission
// calc, ledger effects, RT Balance) with a safe mock/test flow only, per an
// explicit instruction not to add real payment credentials yet.
import type { ActorType, LedgerEntryType, PaymentMode } from "@prisma/client";
import { db } from "@/lib/db";
import { logAgentAction } from "./trace";
import type { AgentContext, AgentContract } from "./types";

export const PAY_AGENT_CONTRACT: AgentContract = {
  name: "PAY",
  mission: "Charge RT's 100-som-per-seat commission once a trip is confirmed complete, and maintain each driver's RT Balance.",
  inputs: ["completed Trip", "PaymentMode", "seats", "totalFareSom (THROUGH_RT only)"],
  outputs: ["LedgerEntry rows", "updated RtBalance.balanceSom", "Trip.commissionSom snapshot"],
  permissions: ["read Trip", "write LedgerEntry/RtBalance/Trip.commissionSom", "write AuditLogEntry"],
  prohibitedActions: [
    "never charge commission before the trip is actually completed",
    "never charge commission twice for the same trip",
    "never call a real payment gateway (none is wired up)",
  ],
  kpi: ["RT commission collected", "uncollected/overdue driver balances"],
  escalationRules: ["a driver balance more negative than a dispatcher-set threshold should be flagged for manual follow-up (not automated here)"],
};

export const COMMISSION_SOM_PER_SEAT = 100;

export function computeCommissionSom(seats: number): number {
  return COMMISSION_SOM_PER_SEAT * seats;
}

export interface LedgerEffectEntry {
  type: LedgerEntryType;
  amountSom: number;
  affectsBalance: boolean;
}

export interface PayEffect {
  commissionSom: number;
  entries: LedgerEffectEntry[];
}

export interface ComputePayEffectParams {
  mode: PaymentMode;
  seats: number;
  totalFareSom?: number;
}

/**
 * Pure: compute the commission and the resulting ledger entries for a
 * completed trip. DRIVER_DIRECT_RT_BALANCE debits the driver's RT Balance
 * for the commission. THROUGH_RT records the collection + payout as
 * informational entries (RT already nets the commission by only paying out
 * the remainder), so it does not additionally touch RtBalance.
 */
export function computePayEffect(params: ComputePayEffectParams): PayEffect {
  const commissionSom = computeCommissionSom(params.seats);

  if (params.mode === "DRIVER_DIRECT_RT_BALANCE") {
    return {
      commissionSom,
      entries: [{ type: "COMMISSION_CHARGE", amountSom: -commissionSom, affectsBalance: true }],
    };
  }

  if (params.totalFareSom == null) {
    throw new Error("totalFareSom is required for THROUGH_RT payment mode");
  }
  if (params.totalFareSom < commissionSom) {
    throw new Error("totalFareSom cannot be less than the commission owed");
  }

  const payoutSom = params.totalFareSom - commissionSom;
  return {
    commissionSom,
    entries: [
      { type: "PAYMENT_COLLECTED", amountSom: params.totalFareSom, affectsBalance: false },
      { type: "PAYOUT", amountSom: payoutSom, affectsBalance: false },
    ],
  };
}

export class CommissionAlreadyChargedError extends Error {
  constructor(tripId: string) {
    super(`Trip ${tripId} was already charged commission`);
    this.name = "CommissionAlreadyChargedError";
  }
}

/** Charge commission for a just-completed trip. Idempotent guard: throws if already charged. */
export async function chargeCommissionForTrip(
  ctx: AgentContext,
  tripId: string,
  params: { mode: PaymentMode; totalFareSom?: number },
) {
  const trip = await db.trip.findUniqueOrThrow({ where: { id: tripId } });
  if (trip.commissionChargedAt) throw new CommissionAlreadyChargedError(tripId);

  const effect = computePayEffect({ mode: params.mode, seats: trip.seats, totalFareSom: params.totalFareSom });

  const result = await db.$transaction(async (tx) => {
    for (const entry of effect.entries) {
      await tx.ledgerEntry.create({
        data: {
          driverId: trip.driverId,
          tripId: trip.id,
          type: entry.type,
          paymentMode: params.mode,
          amountSom: entry.amountSom,
          actorType: "AGENT",
          actorId: "PAY",
        },
      });
    }

    const balanceDelta = effect.entries.filter((e) => e.affectsBalance).reduce((sum, e) => sum + e.amountSom, 0);
    if (balanceDelta !== 0) {
      await tx.rtBalance.upsert({
        where: { driverId: trip.driverId },
        create: { driverId: trip.driverId, balanceSom: balanceDelta },
        update: { balanceSom: { increment: balanceDelta } },
      });
    }

    return tx.trip.update({
      where: { id: tripId },
      data: { paymentMode: params.mode, totalFareSom: params.totalFareSom, commissionSom: effect.commissionSom, commissionChargedAt: new Date() },
    });
  });

  await logAgentAction({
    ctx,
    agent: "PAY",
    action: "pay.commission_charged",
    entityType: "Trip",
    entityId: tripId,
    details: { mode: params.mode, commissionSom: effect.commissionSom, entries: effect.entries },
  });

  return result;
}

/** Manual dispatcher balance adjustment (topup or correction) — never automatic. */
export async function adjustBalance(
  ctx: AgentContext,
  driverId: string,
  amountSom: number,
  type: Extract<LedgerEntryType, "TOPUP" | "ADJUSTMENT" | "REFUND">,
  actorType: ActorType,
  actorId: string,
  description?: string,
) {
  const result = await db.$transaction(async (tx) => {
    await tx.ledgerEntry.create({
      data: { driverId, type, amountSom, actorType, actorId, description },
    });
    return tx.rtBalance.upsert({
      where: { driverId },
      create: { driverId, balanceSom: amountSom },
      update: { balanceSom: { increment: amountSom } },
    });
  });

  await logAgentAction({
    ctx,
    agent: "PAY",
    action: "pay.balance_adjusted",
    entityType: "Driver",
    entityId: driverId,
    details: { amountSom, type, actorType, actorId, description: description ?? null },
  });

  return result;
}
