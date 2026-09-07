// Tyyin's escalation to a real human accountant (AGENTS Tyyin spec
// s.18-s.24). Every function here either opens a case for a human to act
// on, or records what a human reports they already did outside this
// system — nothing here ever moves money. There is no code path from this
// file into any outgoing action, because no such action exists in Tyyin's
// domain (see src/lib/tyyin/bank-adapter.ts).
import type { AccountantCase, AccountantCaseType, ActorType, TreasuryDepartment } from "@prisma/client";
import { db } from "@/lib/db";
import type { AgentContext } from "@/lib/agents/types";
import { emitTyyinEvent } from "./events";
import { requireAccountantRole } from "./role";

export interface OpenAccountantCaseParams {
  caseType: AccountantCaseType;
  sourceEventKey: string;
  department?: TreasuryDepartment;
  relatedPaymentId?: string | null;
  relatedTransactionId?: string | null;
  amountSom?: number | null;
  currency?: string;
  summary: string;
  openedByType: ActorType;
  openedById?: string | null;
}

/** Idempotent via sourceEventKey's unique constraint (mirrors AdiletCase's
 * dedupe pattern, spec s.34/s.47) — a retried escalation (e.g. reconciling
 * the same transaction twice) can never open a second case for the same
 * event. */
export async function openAccountantCase(ctx: AgentContext, params: OpenAccountantCaseParams): Promise<AccountantCase> {
  const existing = await db.accountantCase.findUnique({ where: { sourceEventKey: params.sourceEventKey } });
  if (existing) return existing;

  const created = await db.accountantCase.create({
    data: {
      caseType: params.caseType,
      sourceEventKey: params.sourceEventKey,
      department: params.department ?? "CARGO",
      relatedPaymentId: params.relatedPaymentId ?? null,
      relatedTransactionId: params.relatedTransactionId ?? null,
      amountSom: params.amountSom ?? null,
      currency: params.currency ?? "KGS",
      summary: params.summary,
      openedByType: params.openedByType,
      openedById: params.openedById ?? null,
      status: "OPEN",
    },
  });

  await emitTyyinEvent(ctx, "ACCOUNTANT_CASE_OPENED", created.id, "AccountantCase", {
    caseType: params.caseType,
    amountSom: params.amountSom ?? null,
    relatedPaymentId: params.relatedPaymentId ?? null,
    relatedTransactionId: params.relatedTransactionId ?? null,
  });

  return created;
}

export class AccountantCaseAlreadyClosedError extends Error {
  constructor(caseId: string) {
    super(`AccountantCase ${caseId} is already closed`);
    this.name = "AccountantCaseAlreadyClosedError";
  }
}

export interface RecordAccountantResolutionParams {
  resolutionType: string;
  resolutionSummary: string;
  recordedById: string;
}

/** Records what the accountant reports they did *outside* this system
 * (e.g. "sent the refund via the bank's own app") — never triggers it (spec
 * s.24). Idempotent: resolving an already-resolved/closed case is a safe
 * no-op returning the existing row unchanged. */
export async function recordAccountantResolution(ctx: AgentContext, dispatcherRole: string, caseId: string, params: RecordAccountantResolutionParams): Promise<AccountantCase> {
  requireAccountantRole(dispatcherRole);

  const kase = await db.accountantCase.findUniqueOrThrow({ where: { id: caseId } });
  if (kase.status === "RESOLVED" || kase.status === "CLOSED") return kase;

  const updated = await db.accountantCase.update({
    where: { id: caseId },
    data: {
      status: "RESOLVED",
      resolutionType: params.resolutionType,
      resolutionSummary: params.resolutionSummary,
      resolutionRecordedAt: new Date(),
      resolutionRecordedById: params.recordedById,
    },
  });

  await emitTyyinEvent(ctx, "ACCOUNTANT_CASE_RESOLVED", caseId, "AccountantCase", {
    resolutionType: params.resolutionType,
    recordedById: params.recordedById,
  });

  return updated;
}

/** Idempotent close — a repeat call for an already-closed case is a no-op. */
export async function closeAccountantCase(ctx: AgentContext, dispatcherRole: string, caseId: string, closedById: string): Promise<AccountantCase> {
  requireAccountantRole(dispatcherRole);

  const kase = await db.accountantCase.findUniqueOrThrow({ where: { id: caseId } });
  if (kase.status === "CLOSED") return kase;

  const updated = await db.accountantCase.update({
    where: { id: caseId },
    data: { status: "CLOSED", closedAt: new Date() },
  });

  await emitTyyinEvent(ctx, "FINANCIAL_CASE_CLOSED", caseId, "AccountantCase", { closedById });

  return updated;
}
