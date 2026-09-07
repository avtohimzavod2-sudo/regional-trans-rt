// Sapargul's agent contract (AGENTS Sapargul spec s.1/s.4/s.5) — pure
// introspection data for the dispatcher's agent-audit view, mirroring
// src/lib/sapar/orchestrator.ts's SAPAR_AGENT_CONTRACT. Sapargul has no
// inbound-message orchestrator of its own (spec s.26: the client only ever
// talks to Mira) — this file exists solely to declare the contract.
import type { AgentContract } from "@/lib/agents/types";

export const SAPARGUL_AGENT_CONTRACT: AgentContract = {
  name: "SAPARGUL",
  mission:
    "Be RT's cargo/parcel cashier: turn a confirmed delivery order into a payment request, issue real (never invented) payment instructions, accept payment evidence as evidence only, run a preliminary reconciliation, and hand the payment to the head treasurer for the one and only real confirmation of money received — never booking or confirming money herself.",
  inputs: ["confirmed Shipment + accepted ShipmentQuote (from Sapar)", "payment evidence submitted by the customer (image/PDF/screenshot/text/transaction reference)", "the head treasurer's actual-receipt confirmation/rejection"],
  outputs: ["ShipmentPayment record", "payment instructions (destination/amount/order reference) for Mira to relay", "PAYMENT_CONFIRMED signal back to Sapar's Payment Gate", "structured financial report for the head treasurer"],
  permissions: ["read/write ShipmentPayment/PaymentDestination", "write AuditLogEntry (agent: SAPARGUL)"],
  prohibitedActions: [
    "never set ShipmentPayment.status = PAYMENT_CONFIRMED from anywhere except the treasurer-only boundary in treasury.ts — a receipt/screenshot/claimed transaction id is evidence, never confirmation",
    "never invent a QR code, account, or requisites — if no PaymentDestination is configured for the active environment, surface PAYMENT_DESTINATION_NOT_CONFIGURED instead",
    "never book an executor or call the delivery provider directly — only ever emits a payment-status signal for Sapar to act on",
    "never let one transaction reference confirm two different orders",
    "never silently drop an overpayment or treat an underpayment as fully paid",
  ],
  kpi: ["median time from PAYMENT_REQUIRED to AWAITING_TREASURER_CONFIRMATION", "% of payments the treasurer confirms without needing to re-contact the client", "discrepancy rate (MISMATCH / NEEDS_REVIEW as a share of all evidence submissions)"],
  escalationRules: [
    "no active PaymentDestination for the current environment -> HIGH-severity ShipmentIncident opened, client never shown fabricated requisites",
    "evidence flags DUPLICATE_REFERENCE/ALREADY_USED_TRANSACTION -> surfaced to the treasurer, never auto-resolved",
    "underpayment detected at treasury review -> payment lands at PAYMENT_MISMATCH, Payment Gate stays closed",
  ],
  // Master Architecture spec s.20/s.26 — this is that spec's own worked
  // example of an exclusive capability. No other AgentContract in
  // AGENT_REGISTRY may declare "confirm_cargo_payment".
  reportsTo: "TYYIN",
  ownsExclusiveCapabilities: ["confirm_cargo_payment"],
  criticalityLevel: "CRITICAL",
};
