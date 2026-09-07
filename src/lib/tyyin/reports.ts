// Daily/weekly structured treasury reports (AGENTS Tyyin spec s.19/s.20/s.65)
// — plain aggregation over TreasuryTransaction/AccountantCase, never
// LLM-composed, so every number traces back to a real row. Mirrors
// src/lib/sapargul/report.ts's shape and approach exactly.
import { db } from "@/lib/db";
import type { TreasuryDepartment } from "@prisma/client";
import type { TreasuryPeriod, TreasuryPeriodReport } from "./types";

const DEPARTMENTS: TreasuryDepartment[] = ["CARGO", "PASSENGER", "OTHER"];

async function buildTreasuryPeriodReport(period: TreasuryPeriod): Promise<TreasuryPeriodReport> {
  const transactions = await db.treasuryTransaction.findMany({
    where: { transactionTime: { gte: period.from, lte: period.to } },
  });
  const casesOpened = await db.accountantCase.findMany({
    where: { openedAt: { gte: period.from, lte: period.to } },
  });
  const casesResolved = await db.accountantCase.count({
    where: { resolutionRecordedAt: { gte: period.from, lte: period.to } },
  });
  const casesOpenAtEnd = await db.accountantCase.count({
    where: { openedAt: { lte: period.to }, status: { in: ["OPEN", "IN_PROGRESS"] } },
  });

  const byDepartment: TreasuryPeriodReport["byDepartment"] = {};
  for (const dept of DEPARTMENTS) byDepartment[dept] = { transactionsReceived: 0, totalReceivedSom: 0 };

  let transactionsMatched = 0;
  let transactionsNeedingManualReconciliation = 0;
  let totalReceivedSom = 0;
  let totalMatchedSom = 0;
  let overpaymentSom = 0;
  // Always 0 — see the comment below: underpayment never opens an
  // AccountantCase, so there is nothing here to accumulate it from.
  const underpaymentSom = 0;

  for (const t of transactions) {
    totalReceivedSom += t.amountSom;
    const bucket = byDepartment[t.department]!;
    bucket.transactionsReceived += 1;
    bucket.totalReceivedSom += t.amountSom;

    if (t.status === "MATCHED") {
      transactionsMatched += 1;
      totalMatchedSom += t.amountSom;
    } else if (t.status === "NEEDS_MANUAL_RECONCILIATION") {
      transactionsNeedingManualReconciliation += 1;
    }
  }

  for (const c of casesOpened) {
    if (c.caseType === "OVERPAYMENT_RESOLUTION" && c.amountSom != null) overpaymentSom += c.amountSom;
  }

  return {
    period,
    transactionsReceived: transactions.length,
    transactionsMatched,
    transactionsNeedingManualReconciliation,
    totalReceivedSom,
    totalMatchedSom,
    overpaymentSom,
    underpaymentSom,
    accountantCasesOpened: casesOpened.length,
    accountantCasesResolved: casesResolved,
    accountantCasesOpenAtEnd: casesOpenAtEnd,
    byDepartment,
  };
}

export async function buildTreasuryDailyReport(period: TreasuryPeriod): Promise<TreasuryPeriodReport> {
  return buildTreasuryPeriodReport(period);
}

export async function buildTreasuryWeeklyReport(period: TreasuryPeriod): Promise<TreasuryPeriodReport> {
  return buildTreasuryPeriodReport(period);
}
