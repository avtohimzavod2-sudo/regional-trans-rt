# Financial Boundaries

RT's financial system is designed so that **no AI agent, and no human
break-glass role acting through this codebase, can move money out of RT's
account.** This document consolidates every enforcement point; each is a
structural/type-level guarantee, not a runtime `if` that a future change
could quietly remove.

## 1. The outbound gap is structural, not a policy

`TreasuryInboundBankAdapter` (`src/lib/tyyin/bank-adapter.ts`) is Tyyin's
**entire** vocabulary for talking to a bank:

```ts
interface TreasuryInboundBankAdapter {
  listIncomingTransactions(params: { since: Date; accountRef?: string }): Promise<IncomingBankTransaction[]>;
  getIncomingTransaction(externalTransactionId: string): Promise<IncomingBankTransaction | null>;
  verifyDestination(accountRef: string): Promise<boolean>;
  getAccountStatus(accountRef: string): Promise<AccountStatusSnapshot>;
  resolvePaymentReference(rawStatementText: string): Promise<string | null>;
  getApprovedPaymentInstructions(destinationId: string): Promise<ApprovedPaymentInstructionView | null>;
}
```

There is no `transfer()`, `payout()`, `refund()`, `withdrawal()`,
`debit()`, or `sendMoney()` method on this interface — not because no code
happens to call one, but because **no such method exists to call**. Adding
one is a deliberate, separately reviewed decision, never a "convenience"
addition.

## 2. Single-writer chain for "money received"

| Step | Who | What |
|---|---|---|
| 1 | Sapargul | Creates `ShipmentPayment`, issues real (never invented) payment instructions from an active `PaymentDestination` |
| 2 | Customer | Submits payment evidence (screenshot/PDF/reference) — **evidence only, never confirmation** |
| 3 | Sapargul | Runs a preliminary reconciliation (`evaluateTreasuryConfirmation`) |
| 4 | Tyyin (bank) | Ingests the real bank transaction (`ingestBankTransaction`) |
| 5 | Tyyin | Reconciles the transaction against expected payments (exact reference match only — `reconcileTransaction`; anything else falls back to `NEEDS_MANUAL_RECONCILIATION`, never fuzzy-matched) |
| 6 | Sapargul (`treasury.ts`), callable only under the `tyyin` treasury-ops role | The **only** code path that ever sets `ShipmentPayment.status = PAYMENT_CONFIRMED` |

`ownsExclusiveCapabilities: ["confirm_cargo_payment"]` on
`SAPARGUL_AGENT_CONTRACT` is the single declared owner of this capability
— `collisions.test.ts` runs `assertNoCapabilityConflicts` against the live
`AGENT_REGISTRY` on every test run, so a second contract claiming it fails
CI immediately.

## 3. What each financial function is honestly not allowed to do

- **`confirmActualPaymentReceipt` / `rejectPayment` / `markPaymentMismatch`**
  (`src/lib/sapargul/treasury.ts`) — never invoked by anything except the
  Tyyin-authorized reviewer path; never auto-resolves an overpayment
  (excess always opens `AccountantCase(OVERPAYMENT_RESOLUTION)` for a
  human).
- **`ingestBankTransaction` / `runReconciliationForTransaction` /
  `reconcileAllPending`** (`src/lib/tyyin/ingestion.ts`) — read the bank,
  write `TreasuryTransaction`; never call anything resembling a send.
- **`openAccountantCase` / `recordAccountantResolution` /
  `closeAccountantCase`** (`src/lib/tyyin/accountant.ts`) — a human
  accountant's resolution is *recorded*, never *triggered*, by this code.
  Tyyin never records its own resolution of a case it opened.
- **`getOwnerFinancialStatus` / `getOwnerFinancialReportForPeriod`**
  (`src/lib/tyyin/owner.ts`, the `OWNER_DIRECT_CALL` path) — read-only.
  Calls only `listIncomingTransactions` / `getAccountStatus` /
  `getApprovedPaymentInstructions` from the adapter above; has no access
  to any method that could move money, because no such method exists on
  the type it holds a reference to.
- **Artur** (`src/lib/artur/`) — reads financial data exclusively through
  Tyyin's own `buildTreasuryDailyReport`/`buildTreasuryWeeklyReport`
  (`src/lib/tyyin/reports.ts`), never a second parallel computation over
  raw `TreasuryTransaction` rows, and never writes to
  `TreasuryTransaction`/`AccountantCase`/`ShipmentPayment` at all — see
  `ARTUR_AGENT_CONTRACT.prohibitedActions` and the static import-scan in
  `src/lib/artur/boundary.test.ts`.

## 4. Sandbox-only, by explicit design

`src/lib/tyyin/sandbox-adapter.ts`'s `getBankAdapter()` is the only
`TreasuryInboundBankAdapter` implementation in this codebase — a
simulation, never a real banking integration. No real bank credentials, no
real account numbers, and no production payment API key are wired into
this system. Standing project constraint: **no real payments, no real
banking integration or credentials beyond sandbox/mock, and no fabricated
real-looking bank/account numbers**, ever, in this codebase.

## 5. Enforcement summary

| Boundary | Enforced by |
|---|---|
| Tyyin can never send money | `TreasuryInboundBankAdapter`'s method list — a type-level guarantee |
| Only Sapargul confirms cargo payment, and only via the treasurer role | `confirm_cargo_payment` exclusive ownership + `collisions.test.ts` regression against `AGENT_REGISTRY` |
| Artur never mutates financial records | `ARTUR_AGENT_CONTRACT.prohibitedActions`/`forbiddenCapabilities` + `boundary.test.ts` static import scan |
| No fuzzy-matched or guessed reconciliation | `reconcileTransaction`'s exact-match-only logic, tested in `reconciliation.test.ts` |
| No silent overpayment/refund | Overpayment always opens a human-reviewed `AccountantCase`; refunds are never triggered by any function in this codebase |
| No production banking credentials | `sandbox-adapter.ts` is the only implementation registered anywhere |
