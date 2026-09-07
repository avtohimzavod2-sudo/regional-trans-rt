// Bank-transaction ingestion + reconciliation wiring (AGENTS Tyyin spec
// s.2/s.9/s.16/s.43). This is where Tyyin composes with Sapargul's existing,
// unmodified financial boundary: reconciliation.ts only ever decides *which*
// ShipmentPayment a transaction belongs to; the actual PAYMENT_CONFIRMED /
// PAYMENT_MISMATCH write always goes through
// src/lib/sapargul/treasury.ts's confirmActualPaymentReceipt — the single
// writer of that status, now also reachable by Tyyin's own "tyyin" role
// (src/lib/sapargul/role.ts) instead of a duplicated confirmation path.
import type { TreasuryDepartment, TreasuryTransaction } from "@prisma/client";
import { db } from "@/lib/db";
import type { AgentContext } from "@/lib/agents/types";
import { confirmActualPaymentReceipt } from "@/lib/sapargul/treasury";
import { reconcileTransaction } from "./reconciliation";
import { openAccountantCase } from "./accountant";
import { emitTyyinEvent, logTyyinAction } from "./events";
import type { IncomingBankTransaction, ReconciliationCandidatePayment } from "./types";

const CANDIDATE_STATUSES = ["AWAITING_PAYMENT", "AWAITING_TREASURER_CONFIRMATION", "PAYMENT_MISMATCH"] as const;

/** Idempotent: externalTransactionId is unique, so a duplicate webhook/poll
 * delivery for the same bank transaction is a safe no-op that returns the
 * already-ingested (and already-reconciled) row unchanged (spec s.11/s.47's
 * "duplicate webhook" race). Immediately runs reconciliation — there is no
 * separate queue/worker infrastructure in this project to build against
 * (spec s.73's "no need to over-build infra that doesn't exist"), so
 * ingest-then-reconcile happens inline, synchronously, in one call. */
export async function ingestBankTransaction(ctx: AgentContext, input: IncomingBankTransaction, department: TreasuryDepartment = "CARGO"): Promise<TreasuryTransaction> {
  const existing = await db.treasuryTransaction.findUnique({ where: { externalTransactionId: input.externalTransactionId } });
  if (existing) return existing;

  const created = await db.treasuryTransaction.create({
    data: {
      externalTransactionId: input.externalTransactionId,
      accountRef: input.accountRef,
      department,
      amountSom: input.amountSom,
      currency: input.currency,
      paymentReference: input.paymentReference,
      counterpartyMasked: input.counterpartyMasked,
      transactionTime: input.transactionTime,
      status: "RECEIVED",
    },
  });

  await emitTyyinEvent(ctx, "TREASURY_TRANSACTION_RECEIVED", created.id, "TreasuryTransaction", {
    externalTransactionId: input.externalTransactionId,
    amountSom: input.amountSom,
    paymentReference: input.paymentReference,
  });

  return runReconciliationForTransaction(ctx, created.id);
}

/** Idempotent: a transaction not in RECEIVED status has already been
 * processed — repeat calls (e.g. the dispatcher's "re-run reconciliation"
 * button, or a retry after a transient error) are safe no-ops for it. Safe
 * to call again for a NEEDS_MANUAL_RECONCILIATION row once its matching
 * payment shows up later (handles the "transaction arrives before its
 * ShipmentPayment exists" ordering race — spec s.47). */
export async function runReconciliationForTransaction(ctx: AgentContext, transactionId: string): Promise<TreasuryTransaction> {
  const transaction = await db.treasuryTransaction.findUniqueOrThrow({ where: { id: transactionId } });
  if (transaction.status === "MATCHED") return transaction;

  const candidateRows = transaction.paymentReference
    ? await db.shipmentPayment.findMany({
        where: { orderReference: transaction.paymentReference, status: { in: [...CANDIDATE_STATUSES] } },
      })
    : [];
  const candidates: ReconciliationCandidatePayment[] = candidateRows.map((p) => ({
    paymentId: p.id,
    orderReference: p.orderReference,
    amountExpectedSom: p.amountExpectedSom,
    currency: p.currency,
  }));

  const outcome = reconcileTransaction({
    transaction: { amountSom: transaction.amountSom, currency: transaction.currency, paymentReference: transaction.paymentReference },
    candidates,
  });

  switch (outcome.kind) {
    case "MATCHED_EXACT":
    case "MATCHED_OVERPAID":
    case "MATCHED_UNDERPAID": {
      // treasury.ts re-derives EXACT/UNDERPAID/OVERPAID itself from the raw
      // amounts and is the sole writer of the resulting status — this call
      // never guesses the outcome, only supplies the verified real amount.
      await confirmActualPaymentReceipt(ctx, "tyyin", outcome.paymentId, {
        actualAmountSom: transaction.amountSom,
        transactionReference: transaction.externalTransactionId,
        reviewerId: "TYYIN_AUTO_RECONCILE",
      });

      const updated = await db.treasuryTransaction.update({
        where: { id: transactionId },
        data: { status: "MATCHED", matchedPaymentId: outcome.paymentId, matchedAt: new Date() },
      });

      await emitTyyinEvent(ctx, "TREASURY_TRANSACTION_MATCHED", transactionId, "TreasuryTransaction", { paymentId: outcome.paymentId, outcome: outcome.kind });

      if (outcome.kind === "MATCHED_OVERPAID") {
        await emitTyyinEvent(ctx, "OVERPAYMENT_DETECTED", transactionId, "TreasuryTransaction", { paymentId: outcome.paymentId, overpaidSom: outcome.overpaidSom });
        // The excess is never auto-resolved — a human accountant decides
        // whether to refund it, credit a future order, or something else
        // (spec s.13's explicit overpayment rule).
        await openAccountantCase(ctx, {
          caseType: "OVERPAYMENT_RESOLUTION",
          sourceEventKey: `TYYIN:OVERPAY:${transactionId}`,
          relatedPaymentId: outcome.paymentId,
          relatedTransactionId: transactionId,
          amountSom: outcome.overpaidSom,
          summary: `Переплата по платежу ${outcome.paymentId}: излишек ${outcome.overpaidSom} сом по транзакции ${transaction.externalTransactionId}.`,
          openedByType: "AGENT",
          openedById: "TYYIN",
        });
      } else if (outcome.kind === "MATCHED_UNDERPAID") {
        // Underpayment already surfaces to the human treasurer via the
        // existing PAYMENT_MISMATCH review queue (src/lib/sapargul/treasury.ts)
        // — no separate accountant case here to avoid duplicate escalation.
        await emitTyyinEvent(ctx, "UNDERPAYMENT_DETECTED", transactionId, "TreasuryTransaction", { paymentId: outcome.paymentId, underpaidSom: outcome.underpaidSom });
      }

      return updated;
    }

    case "NO_REFERENCE_MATCH":
    case "AMBIGUOUS_MATCH":
    case "CURRENCY_MISMATCH": {
      // Never dropped, never guessed — stays visible in the dedicated
      // NEEDS_MANUAL_RECONCILIATION registry for a dispatcher/accountant to
      // resolve (spec s.9/s.44/s.47's "preserve unmatched transactions").
      const notes =
        outcome.kind === "NO_REFERENCE_MATCH"
          ? "Нет платежа с таким payment reference среди ожидающих оплаты."
          : outcome.kind === "AMBIGUOUS_MATCH"
            ? `Несколько платежей совпадают по reference: ${outcome.paymentIds.join(", ")}.`
            : `Валюта транзакции не совпадает с ожидаемой для платежа ${outcome.paymentId}.`;

      const updated = await db.treasuryTransaction.update({
        where: { id: transactionId },
        data: { status: "NEEDS_MANUAL_RECONCILIATION", reconciliationNotes: notes },
      });

      await emitTyyinEvent(ctx, "TREASURY_TRANSACTION_UNMATCHED", transactionId, "TreasuryTransaction", { reason: outcome.kind });

      return updated;
    }
  }
}

/** Bulk re-run for every transaction still sitting at NEEDS_MANUAL_RECONCILIATION
 * or freshly RECEIVED — lets a dispatcher retry once a late-arriving
 * ShipmentPayment now exists, without needing real job-queue infrastructure
 * (spec s.47's ordering race, s.73's "no need to over-build infra"). Bounded
 * batch, same as src/lib/adilet/enforcement.ts's expireDueSanctions pattern. */
export async function reconcileAllPending(ctx: AgentContext): Promise<number> {
  const pending = await db.treasuryTransaction.findMany({
    where: { status: { in: ["RECEIVED", "NEEDS_MANUAL_RECONCILIATION"] } },
    take: 200,
    orderBy: { transactionTime: "asc" },
  });
  for (const t of pending) {
    await runReconciliationForTransaction(ctx, t.id);
  }
  await logTyyinAction({ ctx, action: "tyyin.bulk_reconciliation_run", entityId: "BULK", details: { processed: pending.length } });
  return pending.length;
}
