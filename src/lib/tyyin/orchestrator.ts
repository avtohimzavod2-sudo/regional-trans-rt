// Tyyin's agent contract (AGENTS Tyyin spec s.1/s.6/s.30/s.60) — pure
// introspection data for the dispatcher's agent-audit view, mirroring
// src/lib/adilet/orchestrator.ts and src/lib/sapargul/orchestrator.ts.
// Tyyin has no inbound-message orchestrator of its own — it never talks to
// a client directly, only reconciles bank transactions and reports to
// humans — so, like Adilet, this file exists solely to declare the
// contract.
import type { AgentContract } from "@/lib/agents/types";

export const TYYIN_AGENT_CONTRACT: AgentContract = {
  name: "TYYIN",
  mission:
    "Be RT's chief AI treasurer and central financial control circuit: reconcile real bank transactions against expected payments deterministically and honestly, never trust a receipt/screenshot/customer's word over the bank record, never auto-resolve an overpayment or issue a refund, escalate anything ambiguous to a human accountant, and give the owner full truthful financial visibility without ever being able to move money out.",
  inputs: [
    "incoming bank transactions via TreasuryInboundBankAdapter (SANDBOX simulation only in this build)",
    "ShipmentPayment records awaiting/under review for payment (read-only lookup by orderReference)",
    "accountant case resolutions recorded by a human accountant",
    "OWNER_DIRECT_CALL status requests from the trusted server-side session",
  ],
  outputs: [
    "TreasuryTransaction rows (the append-only central financial journal)",
    "AccountantCase escalations for a human to act on",
    "PAYMENT_CONFIRMED/PAYMENT_MISMATCH writes via src/lib/sapargul/treasury.ts's confirmActualPaymentReceipt (never written directly)",
    "daily/weekly structured treasury reports",
    "OWNER_DIRECT_CALL financial status snapshots",
  ],
  permissions: [
    "read/write TreasuryTransaction",
    "read/write AccountantCase",
    "call confirmActualPaymentReceipt via the 'tyyin' treasury-ops role (never any other Sapargul write)",
    "read ShipmentPayment/PaymentDestination",
    "write AuditLogEntry (agent: TYYIN)",
  ],
  prohibitedActions: [
    "no method anywhere in Tyyin's domain may transfer/payout/refund/withdraw/debit/send money — TreasuryInboundBankAdapter physically has no such method (spec s.6/s.60)",
    "never auto-resolve an overpayment — the excess always opens an AccountantCase for a human accountant (spec s.13)",
    "never issue or trigger a refund itself, including under OWNER_DIRECT_CALL — always routed through a human accountant (spec s.24/s.30)",
    "never fuzzy-match a transaction to a payment — anything not an exact single reference match falls back to NEEDS_MANUAL_RECONCILIATION (spec s.44)",
    "never treat a receipt/screenshot/OCR/customer claim as source of truth — only a real bank transaction (spec s.2)",
    "never drop or silently reassign an unmatched transaction (spec s.9/s.47)",
    "never expose outgoing banking capability to OWNER_DIRECT_CALL or any other caller (spec s.28-s.30)",
    "never wire real banking credentials or a real outgoing banking API in this build (spec s.60)",
  ],
  kpi: [
    "reconciliation match rate (auto-matched vs. needing manual reconciliation)",
    "time-to-match for a received transaction",
    "open AccountantCase age/backlog",
    "overpayment/underpayment amounts outstanding",
    "OWNER_DIRECT_CALL audit completeness",
  ],
  escalationRules: [
    "NO_REFERENCE_MATCH / AMBIGUOUS_MATCH / CURRENCY_MISMATCH -> TreasuryTransaction stays NEEDS_MANUAL_RECONCILIATION, never guessed",
    "MATCHED_OVERPAID -> AccountantCase(OVERPAYMENT_RESOLUTION) opened for the excess, payment itself still auto-confirms for the covered amount",
    "MATCHED_UNDERPAID -> surfaces via Sapargul's existing PAYMENT_MISMATCH human-treasurer review queue, no duplicate AccountantCase",
    "any accountant-case resolution or closure requires the accountant/admin role — Tyyin itself never records its own resolution (spec s.24)",
  ],
};
