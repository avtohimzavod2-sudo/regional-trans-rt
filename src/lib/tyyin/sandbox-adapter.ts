// SANDBOX-only implementation of TreasuryInboundBankAdapter (AGENTS Tyyin
// spec s.7/s.27/s.66's "no real bank wired without user-supplied
// credentials, no invented bank/account numbers"). No real bank, no
// fabricated account numbers: listIncomingTransactions/getIncomingTransaction
// read straight from TreasuryTransaction — the same table
// src/lib/tyyin/ingestion.ts writes to — because in this build the only
// honest way for a transaction to "arrive" is a dispatcher explicitly
// recording one via the SANDBOX-gated "simulate incoming transaction" action
// (see src/app/dispatcher/tyyin-actions.ts), never a fabricated external
// feed. verifyDestination/getAccountStatus/getApprovedPaymentInstructions
// reuse the real PaymentDestination table Sapargul already owns (spec
// s.61's "reuse existing entities, never duplicate").
//
// A PRODUCTION adapter (real bank API/webhook credentials) is intentionally
// not implemented — spec s.60 explicitly excludes wiring real banking in
// this stage. currentTreasuryEnvironment() below defaults to SANDBOX so a
// fresh deploy can never silently treat an unconfigured environment as
// production, mirroring src/lib/sapargul/destination.ts's pattern exactly.
import { db } from "@/lib/db";
import type { PaymentDestinationEnvironment } from "@prisma/client";
import type { TreasuryInboundBankAdapter } from "./bank-adapter";
import type { AccountStatusSnapshot, ApprovedPaymentInstructionView, IncomingBankTransaction } from "./types";

export function currentTreasuryEnvironment(): PaymentDestinationEnvironment {
  return process.env.TYYIN_BANK_ENV === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";
}

function toIncomingBankTransaction(row: { externalTransactionId: string; accountRef: string; amountSom: number; currency: string; paymentReference: string | null; counterpartyMasked: string | null; transactionTime: Date }): IncomingBankTransaction {
  return {
    externalTransactionId: row.externalTransactionId,
    accountRef: row.accountRef,
    amountSom: row.amountSom,
    currency: row.currency,
    paymentReference: row.paymentReference,
    counterpartyMasked: row.counterpartyMasked,
    transactionTime: row.transactionTime,
  };
}

export class SandboxBankAdapter implements TreasuryInboundBankAdapter {
  async listIncomingTransactions(params: { since: Date; accountRef?: string }): Promise<IncomingBankTransaction[]> {
    const rows = await db.treasuryTransaction.findMany({
      where: { transactionTime: { gte: params.since }, ...(params.accountRef ? { accountRef: params.accountRef } : {}) },
      orderBy: { transactionTime: "asc" },
      take: 500,
    });
    return rows.map(toIncomingBankTransaction);
  }

  async getIncomingTransaction(externalTransactionId: string): Promise<IncomingBankTransaction | null> {
    const row = await db.treasuryTransaction.findUnique({ where: { externalTransactionId } });
    return row ? toIncomingBankTransaction(row) : null;
  }

  async verifyDestination(accountRef: string): Promise<boolean> {
    const destination = await db.paymentDestination.findFirst({ where: { accountReference: accountRef, isActive: true } });
    return destination != null;
  }

  async getAccountStatus(accountRef: string): Promise<AccountStatusSnapshot> {
    const destination = await db.paymentDestination.findFirst({ where: { accountReference: accountRef } });
    return {
      accountRef,
      label: destination?.label ?? "Неизвестный счёт (песочница)",
      environment: destination?.environment ?? currentTreasuryEnvironment(),
      isReachable: true, // sandbox adapter never talks to a real network — always "reachable"
      lastSyncedAt: new Date(),
    };
  }

  /** Best-effort narrative parse — trims the raw text and returns it as the
   * candidate reference, or null for empty input. Never invents a reference
   * that wasn't in the text (spec s.44's "never fuzzy-matched" extends to
   * never fabricating the input to match against). */
  async resolvePaymentReference(rawStatementText: string): Promise<string | null> {
    const trimmed = rawStatementText.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  async getApprovedPaymentInstructions(destinationId: string): Promise<ApprovedPaymentInstructionView | null> {
    const destination = await db.paymentDestination.findUnique({ where: { id: destinationId } });
    if (!destination || !destination.isActive) return null;
    return {
      destinationId: destination.id,
      label: destination.label,
      method: destination.method,
      accountReference: destination.accountReference,
      instructionsText: destination.instructionsText,
    };
  }
}

let sharedAdapter: TreasuryInboundBankAdapter | null = null;

/** Single shared instance, mirroring how the rest of the codebase resolves
 * one active PaymentDestination rather than re-instantiating per call. A
 * future PRODUCTION adapter would be selected here based on
 * currentTreasuryEnvironment() once real credentials genuinely exist. */
export function getBankAdapter(): TreasuryInboundBankAdapter {
  if (!sharedAdapter) sharedAdapter = new SandboxBankAdapter();
  return sharedAdapter;
}
