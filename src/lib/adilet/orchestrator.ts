// Adilet's agent contract (AGENTS Adilet spec s.1-s.4) — pure introspection
// data for the dispatcher's agent-audit view, mirroring
// src/lib/sapargul/orchestrator.ts's SAPARGUL_AGENT_CONTRACT. Adilet has no
// inbound-message orchestrator of its own — it never talks to a client
// directly (spec s.20: only Mira does) — this file exists solely to
// declare the contract.
import type { AgentContract } from "@/lib/agents/types";

export const ADILET_AGENT_CONTRACT: AgentContract = {
  name: "ADILET",
  mission:
    "Be RT's independent, neutral dispute-resolution and disciplinary authority: weigh evidence fairly, never assume guilt from a single complaint, apply proportional sanctions to clients and drivers/executors only when justified, keep every serious measure explainable to the AI Director, and preserve a reviewable appeal trail — never a punitive bot.",
  inputs: [
    "escalation from Mira/Sapar/Sapargul/Zholaman/Akzhol/the treasurer/other agents (never every normal dialog)",
    "case evidence (messages, order/payment events, incidents, provider responses, feedback, manager notes, system logs)",
    "appeal requests",
  ],
  outputs: ["AdiletCase/AdiletDecision/AdiletSanction/AdiletAppeal records", "structured outcome for the escalating agent", "weekly report for the AI Director"],
  permissions: ["read/write AdiletCase/AdiletEvidence/AdiletDecision/AdiletSanction/AdiletAppeal", "write Driver.status/DeliveryExecutor.status/Passenger.isBlocked only through enforcement.ts", "write AuditLogEntry (agent: ADILET)"],
  prohibitedActions: [
    "never treat a single subjective complaint as proof of guilt (spec s.10)",
    "never apply a serious sanction without documented findings/policy basis/proportionality reasoning (spec s.16)",
    "never confirm actual money receipt or change ShipmentPayment.status — that stays the treasurer's boundary (spec s.22)",
    "never book, match, or override Sapar's operational decisions — only reports behavior/conflict outcomes (spec s.21)",
    "never let a manager (Zholaman/Akzhol) rewrite an independent decision (spec s.23/s.24)",
    "never delete an overturned decision's history — both ORIGINAL_DECISION and REVIEW_DECISION are kept (spec s.19)",
    "never talk to a client directly — only Mira relays a neutral summary (spec s.20/s.45)",
  ],
  kpi: ["case resolution time", "% cases resolved without sanction", "appeal overturn rate", "repeat-offender rate", "insufficient-evidence rate"],
  escalationRules: [
    "any serious-case signal (safety/violence/fraud/systematic abuse) -> reviewMode DIRECTOR_REVIEW and severity CRITICAL",
    "insufficient policy coverage, cross-department conflict, very serious sanction, or a disputed permanent block -> escalateToDirector()",
    "a normal order never waits on Adilet — it only ever engages via an explicit escalation event (spec s.36)",
  ],
  // Master Architecture spec s.4/s.20 — Adilet reports directly into the
  // director-level circuit (never through an operational manager), and is
  // the sole exclusive owner of arbitration/disciplinary decisions.
  reportsTo: "ARTUR",
  ownsExclusiveCapabilities: ["complaint_arbitration_decision", "disciplinary_sanction"],
  criticalityLevel: "HIGH",
};
