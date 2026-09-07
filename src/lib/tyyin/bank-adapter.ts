// THE hard financial boundary of Tyyin (AGENTS Tyyin spec s.6/s.28/s.51).
//
// This interface is Tyyin's *entire* vocabulary for talking to a bank. It is
// structurally, permanently inbound/reconciliation-only:
//   listIncomingTransactions, getIncomingTransaction, verifyDestination,
//   getAccountStatus, resolvePaymentReference, getApprovedPaymentInstructions.
//
// There is no transfer(), payout(), refund(), withdrawal(), debit(), or
// sendMoney() method here, and there must never be one — not for a normal
// call, not for OWNER_DIRECT_CALL/FOUNDER_DIRECT_CALL (src/lib/tyyin/owner.ts
// only ever calls the read methods below). Money leaving RT's account is a
// human accountant acting outside this system (src/lib/tyyin/accountant.ts
// only ever *records* what they report, never triggers it). If a future
// change needs Tyyin to move money, that is a deliberate, separately
// reviewed decision — it must never be added to this interface as a
// "convenience" method.
import type { AccountStatusSnapshot, ApprovedPaymentInstructionView, IncomingBankTransaction } from "./types";

export interface TreasuryInboundBankAdapter {
  listIncomingTransactions(params: { since: Date; accountRef?: string }): Promise<IncomingBankTransaction[]>;
  getIncomingTransaction(externalTransactionId: string): Promise<IncomingBankTransaction | null>;
  verifyDestination(accountRef: string): Promise<boolean>;
  getAccountStatus(accountRef: string): Promise<AccountStatusSnapshot>;
  resolvePaymentReference(rawStatementText: string): Promise<string | null>;
  getApprovedPaymentInstructions(destinationId: string): Promise<ApprovedPaymentInstructionView | null>;
}

export class BankAdapterUnavailableError extends Error {
  constructor(accountRef: string, reason: string) {
    super(`Bank adapter unavailable for account ${accountRef}: ${reason}`);
    this.name = "BankAdapterUnavailableError";
  }
}
