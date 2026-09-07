// OWNER_DIRECT_CALL (AGENTS Tyyin spec s.28-s.30): the owner gets full,
// honest financial visibility through Tyyin, but this file is read-only by
// construction — it has no dependency on anything in bank-adapter.ts beyond
// its inbound/reconciliation methods, and there is no outgoing-money method
// anywhere in Tyyin's domain for this to call even if it wanted to (see
// src/lib/tyyin/bank-adapter.ts's comment). requireOwnerRole is re-checked
// here from the trusted server-side session role — never a claimed context
// in request text — and every call is audited via emitTyyinEvent so an
// OWNER_DIRECT_CALL is never silent (spec s.30).
import { db } from "@/lib/db";
import type { AgentContext } from "@/lib/agents/types";
import { buildTreasuryDailyReport } from "./reports";
import { emitTyyinEvent } from "./events";
import { requireOwnerRole } from "./role";
import type { TreasuryPeriod, TreasuryPeriodReport } from "./types";

export interface OwnerFinancialStatus {
  asOf: Date;
  last24h: TreasuryPeriodReport;
  openAccountantCases: number;
  transactionsNeedingManualReconciliation: number;
}

/** The only function OWNER_DIRECT_CALL is allowed to invoke against Tyyin —
 * a snapshot assembled purely from reads. requesterId identifies the owner
 * for the audit trail; it is never used to widen what is returned. */
export async function getOwnerFinancialStatus(ctx: AgentContext, dispatcherRole: string, requesterId: string): Promise<OwnerFinancialStatus> {
  requireOwnerRole(dispatcherRole);

  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [last24h, openAccountantCases, transactionsNeedingManualReconciliation] = await Promise.all([
    buildTreasuryDailyReport({ from: since, to: now }),
    db.accountantCase.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    db.treasuryTransaction.count({ where: { status: "NEEDS_MANUAL_RECONCILIATION" } }),
  ]);

  await emitTyyinEvent(ctx, "OWNER_DIRECT_CALL", requesterId, "DispatcherUser", {
    requesterId,
    action: "getOwnerFinancialStatus",
  });

  return { asOf: now, last24h, openAccountantCases, transactionsNeedingManualReconciliation };
}

function assertPeriod(period: TreasuryPeriod): void {
  if (period.from > period.to) throw new RangeError("period.from must not be after period.to");
}

/** A bounded, explicit historical window — still read-only, still audited,
 * still owner-gated. Kept separate from getOwnerFinancialStatus so the
 * common "how are we doing right now" call stays cheap and fixed-shape. */
export async function getOwnerFinancialReportForPeriod(ctx: AgentContext, dispatcherRole: string, requesterId: string, period: TreasuryPeriod): Promise<TreasuryPeriodReport> {
  requireOwnerRole(dispatcherRole);
  assertPeriod(period);

  const report = await buildTreasuryDailyReport(period);

  await emitTyyinEvent(ctx, "OWNER_DIRECT_CALL", requesterId, "DispatcherUser", {
    requesterId,
    action: "getOwnerFinancialReportForPeriod",
    period,
  });

  return report;
}
