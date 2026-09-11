// RT organizational model (hardening sprint s.2/s.7/s.27).
//
// This is the org chart, not the technical dependency graph. A node's
// `reportsTo` answers "who is accountable for this node's results", NOT
// "who calls this code". Mira CALLS Jolchu but does not manage it; RT Office
// READS Drive CRM but does not own it. Those relationships live in the
// capability matrix (capabilities.ts) and in each AgentContract's
// handoffTargets, deliberately kept separate so a technical call edge can
// never be mistaken for management authority.
//
// Classifications below are assigned from OBSERVED CODE BEHAVIOR, not from a
// module's name. The audit that produced them found that only MIRA, JOLCHU
// and ARTUR actually invoke an LLM reasoning provider; every other module in
// AGENT_REGISTRY is deterministic TypeScript. Calling those "AI agents" in
// docs while they are really services is exactly the management theater
// s.2 forbids, so they are recorded here as what they are.

/** What a node actually IS, behaviorally (spec s.2). */
export type RtNodeClassification =
  | "MANAGER"
  | "OPERATIONAL_AGENT"
  | "INDEPENDENT_CONTROL"
  | "DETERMINISTIC_SERVICE"
  | "ADAPTER_WRAPPER"
  | "READ_ONLY_ANALYTICS"
  | "BACKGROUND_INTELLIGENCE"
  | "LEGACY_COMPATIBILITY"
  | "HUMAN_ROLE";

/** Whether the node exists in code today. PLANNED nodes may be named as an
 * owner in the capability matrix — that is how an orphan responsibility gets
 * an intended home — but readiness.ts treats a PRE_LIVE capability owned by
 * a PLANNED node as NOT ready. Writing a name into a matrix must never by
 * itself turn an unowned responsibility into a solved one. */
export type RtNodeStatus = "IMPLEMENTED" | "PLANNED";

export interface RtOrgNode {
  id: string;
  displayName: string;
  classification: RtNodeClassification;
  status: RtNodeStatus;
  /** CURRENT accountability parent — who answers for this node today.
   * Must point at an IMPLEMENTED node: you cannot report to someone who does
   * not exist. Exactly one node (FOUNDER) may have null. */
  reportsTo: string | null;
  /** INTENDED accountability parent once a planned manager is built. Kept
   * separate from `reportsTo` on purpose: an org chart that shows the
   * structure RT wants, while a node is really managed by someone else, is a
   * lie that hides an accountability gap. */
  plannedReportsTo?: string;
  /** True only where the module really calls an LLM reasoning provider. */
  usesLlmReasoning?: boolean;
  notes?: string;
}

export const FOUNDER_NODE_ID = "FOUNDER";

export const RT_ORG_NODES: RtOrgNode[] = [
  // ---- Human layer -------------------------------------------------------
  {
    id: "FOUNDER",
    displayName: "Founder",
    classification: "HUMAN_ROLE",
    status: "IMPLEMENTED",
    reportsTo: null,
    notes: "Root of the accountability graph. Sole approver of irreversible policy.",
  },
  {
    id: "HUMAN_DISPATCHER",
    displayName: "Human dispatcher (operations desk)",
    classification: "HUMAN_ROLE",
    status: "IMPLEMENTED",
    reportsTo: "ARTUR",
    notes: "Existing dispatcher UI operator; handles requiresHumanReview outcomes.",
  },
  {
    id: "HUMAN_ACCOUNTANT",
    displayName: "Human accountant",
    classification: "HUMAN_ROLE",
    status: "PLANNED",
    reportsTo: "TYYIN",
    notes: "Manual resolution of financial exceptions Tyyin escalates. Not yet a defined person/process.",
  },
  {
    id: "HUMAN_LEGAL_COMPLIANCE",
    displayName: "Legal & compliance officer (human)",
    classification: "HUMAN_ROLE",
    status: "PLANNED",
    reportsTo: "FOUNDER",
    notes: "s.18: RT must not build an autonomous AI lawyer. Identity is a FOUNDER_DECISION_REQUIRED item.",
  },
  {
    id: "HUMAN_SECURITY_OWNER",
    displayName: "Information security owner (human)",
    classification: "HUMAN_ROLE",
    status: "PLANNED",
    reportsTo: "FOUNDER",
    notes: "s.16: security ownership is currently implicit in code review only.",
  },
  {
    id: "HUMAN_PRIVACY_OWNER",
    displayName: "Privacy / data governance owner (human)",
    classification: "HUMAN_ROLE",
    status: "PLANNED",
    reportsTo: "FOUNDER",
    notes: "s.17: retention/deletion/legal-hold decisions require a human owner.",
  },
  {
    id: "HUMAN_RELIABILITY_OWNER",
    displayName: "Platform reliability owner (human on-call)",
    classification: "HUMAN_ROLE",
    status: "PLANNED",
    reportsTo: "FOUNDER",
    notes: "s.19: RT must not depend on an AI assistant manually checking Vercel.",
  },
  {
    id: "HUMAN_SAFETY_RESPONDER",
    displayName: "Serious-incident responder (human)",
    classification: "HUMAN_ROLE",
    status: "PLANNED",
    reportsTo: "FOUNDER",
    notes: "s.12: physical-world emergencies always require a human, never an agent alone.",
  },

  // ---- Director ----------------------------------------------------------
  {
    id: "ARTUR",
    displayName: "Artur — AI Director",
    classification: "MANAGER",
    status: "IMPLEMENTED",
    reportsTo: "FOUNDER",
    usesLlmReasoning: true,
    notes: "Observes and reports; must never execute specialist capabilities.",
  },

  // ---- Managers ----------------------------------------------------------
  {
    id: "AKZHOL",
    displayName: "Akzhol — Passenger Operations Manager",
    classification: "MANAGER",
    status: "PLANNED",
    reportsTo: "ARTUR",
    notes:
      "s.8. Referenced across the codebase (prospecting handoff targets, Adilet manager-view, Artur snapshot) but no module exists. Owns passenger-operations PERFORMANCE, never individual bookings.",
  },
  {
    id: "ZHOLAMAN",
    displayName: "Zholaman — Delivery & Cargo Manager",
    classification: "MANAGER",
    status: "PLANNED",
    reportsTo: "ARTUR",
    notes:
      "s.9. Only src/lib/sapargul/zholaman.ts exists — a payment-visibility filter, not a manager module. Owns delivery/cargo PERFORMANCE, never shipment execution or money confirmation.",
  },

  // ---- Independent control ----------------------------------------------
  {
    id: "ADILET",
    displayName: "Adilet — Independent Arbitration & Discipline",
    classification: "INDEPENDENT_CONTROL",
    status: "IMPLEMENTED",
    reportsTo: "ARTUR",
    notes: "Independence enforced by adilet/role.ts: no manager may overturn a decision.",
  },
  {
    id: "TYYIN",
    displayName: "Tyyin — Central Treasury / Financial Control",
    classification: "INDEPENDENT_CONTROL",
    status: "IMPLEMENTED",
    reportsTo: "ARTUR",
    notes: "Sole bank-truth authority. Deterministic today (sandbox adapter), not LLM-backed.",
  },

  // ---- Operational agents ------------------------------------------------
  {
    id: "MIRA",
    displayName: "Mira — public customer communication",
    classification: "OPERATIONAL_AGENT",
    status: "IMPLEMENTED",
    reportsTo: "ARTUR",
    plannedReportsTo: "AKZHOL",
    usesLlmReasoning: true,
    notes:
      "RT's ONLY public persona. Managed directly by Artur today; moves under Akzhol once that manager actually exists.",
  },
  {
    id: "JOLCHU",
    displayName: "Jolchu — real-world geography, ETA, traffic, last mile",
    classification: "OPERATIONAL_AGENT",
    status: "IMPLEMENTED",
    reportsTo: "ARTUR",
    plannedReportsTo: "AKZHOL",
    usesLlmReasoning: true,
    notes: "Sole external-geography truth source. Must never compute fares (s.15).",
  },
  {
    id: "SAPAR",
    displayName: "Sapar — cargo/delivery operations",
    classification: "OPERATIONAL_AGENT",
    status: "IMPLEMENTED",
    reportsTo: "ARTUR",
    plannedReportsTo: "ZHOLAMAN",
    notes: "Deterministic today. Owns shipment execution and executor assignment.",
  },
  {
    id: "RT_OFFICE",
    displayName: "RT Office — supply/demand intelligence & passenger-driver loop",
    classification: "OPERATIONAL_AGENT",
    status: "IMPLEMENTED",
    reportsTo: "ARTUR",
    plannedReportsTo: "AKZHOL",
    notes: "Authoritative computeMarketGap(). Must never bypass MATCH.",
  },

  // ---- Cashiers / financial contour --------------------------------------
  {
    id: "SAPARGUL",
    displayName: "Sapargul — cargo cashier",
    classification: "OPERATIONAL_AGENT",
    status: "IMPLEMENTED",
    reportsTo: "TYYIN",
    notes: "Cargo-only. Must never touch the passenger financial contour.",
  },
  {
    id: "PASSENGER_CASHIER",
    displayName: "Passenger cashier (DISPLAY_NAME_PENDING_FOUNDER_DECISION)",
    classification: "OPERATIONAL_AGENT",
    status: "PLANNED",
    reportsTo: "TYYIN",
    notes:
      "s.10. TreasuryDepartment.PASSENGER exists but no cashier is wired; mira/passenger-finance.ts records an intent with financialProcessor:null. Neutral technical id on purpose — no personal name invented.",
  },

  // ---- Deterministic services -------------------------------------------
  {
    id: "MATCH",
    displayName: "Match — authoritative matching engine",
    classification: "DETERMINISTIC_SERVICE",
    status: "IMPLEMENTED",
    reportsTo: "ARTUR",
    plannedReportsTo: "AKZHOL",
    notes:
      "Sole matching authority. No reasoning; pure selection logic. RT Office CALLS Match but does not manage it — that edge is a technical dependency, not accountability.",
  },
  {
    id: "ROUTE",
    displayName: "Route — internal corridor topology",
    classification: "DETERMINISTIC_SERVICE",
    status: "IMPLEMENTED",
    reportsTo: "ARTUR",
    plannedReportsTo: "AKZHOL",
    notes: "Internal RT topology only. No geocoding, no ETA — that is Jolchu (s.3.A).",
  },
  {
    id: "PAY",
    displayName: "Pay — commission & driver RT Balance ledger",
    classification: "DETERMINISTIC_SERVICE",
    status: "IMPLEMENTED",
    reportsTo: "TYYIN",
    notes: "s.11: deterministic arithmetic + ledger. Must never confirm a bank receipt.",
  },
  {
    id: "TRUST",
    displayName: "Trust — preventive safety gate",
    classification: "DETERMINISTIC_SERVICE",
    status: "IMPLEMENTED",
    reportsTo: "ADILET",
    notes: "Preventive gate only; sanctions belong to Adilet (s.12).",
  },
  {
    id: "QUALITY",
    displayName: "Quality — anomaly detection & rule verification",
    classification: "DETERMINISTIC_SERVICE",
    status: "IMPLEMENTED",
    reportsTo: "ARTUR",
    notes: "Flags anomalies; never issues sanctions.",
  },
  {
    id: "SUPPORT",
    displayName: "Support — service recovery",
    classification: "DETERMINISTIC_SERVICE",
    status: "IMPLEMENTED",
    reportsTo: "ARTUR",
    plannedReportsTo: "AKZHOL",
    notes: "Non-adjudicative. Disputes escalate to Adilet (s.3.B).",
  },
  {
    id: "PARCEL",
    displayName: "Parcel — passenger-corridor small parcel lifecycle",
    classification: "DETERMINISTIC_SERVICE",
    status: "IMPLEMENTED",
    reportsTo: "ARTUR",
    plannedReportsTo: "ZHOLAMAN",
    notes: "s.3.E: narrow product (parcel riding a passenger vehicle), distinct from Sapar shipments.",
  },
  {
    id: "NETWORK",
    displayName: "Network — partner registry CRUD",
    classification: "DETERMINISTIC_SERVICE",
    status: "IMPLEMENTED",
    reportsTo: "ARTUR",
    plannedReportsTo: "ZHOLAMAN",
    notes: "CRUD, not an autonomous agent. Verification of partners is a separate gate (s.26).",
  },
  {
    id: "CRM_AUTO",
    displayName: "CRM Auto — Drive CRM append-only event log",
    classification: "DETERMINISTIC_SERVICE",
    status: "IMPLEMENTED",
    reportsTo: "ARTUR",
    plannedReportsTo: "AKZHOL",
    notes: "Sole Drive CRM writer. Must never become a general orchestrator.",
  },
  {
    id: "SIDE_EFFECT_GATEWAY",
    displayName: "SideEffectGateway — external send boundary",
    classification: "DETERMINISTIC_SERVICE",
    status: "IMPLEMENTED",
    reportsTo: "FOUNDER",
    plannedReportsTo: "HUMAN_RELIABILITY_OWNER",
    notes:
      "messaging/* scenario gate + MIRA_OUTBOUND_MODE. Blocks real sends in test/scenario contexts. Until a reliability owner is named, RT's most safety-critical control reports directly to the Founder — deliberately recorded rather than hidden under a manager who does not exist.",
  },
  {
    id: "TARIFF_ENGINE",
    displayName: "Tariff / pricing engine",
    classification: "DETERMINISTIC_SERVICE",
    status: "PLANNED",
    reportsTo: "ARTUR",
    notes:
      "s.15: pricing needs provenance, not reasoning — deterministic by design. Today fare concepts are scattered and no single engine stamps provenance.",
  },
  {
    id: "VERIFICATION_SERVICE",
    displayName: "Driver / vehicle / partner verification",
    classification: "DETERMINISTIC_SERVICE",
    status: "PLANNED",
    reportsTo: "ADILET",
    notes:
      "s.14/s.26: no owner today. Scout fingerprinting is intelligence and must not silently become legal identity verification.",
  },
  {
    id: "RISK_ENGINE",
    displayName: "Fraud / risk signal engine",
    classification: "DETERMINISTIC_SERVICE",
    status: "PLANNED",
    reportsTo: "ADILET",
    notes: "s.13: flags signals only. Conviction/sanction remains Adilet + human.",
  },

  // ---- Background intelligence -------------------------------------------
  {
    id: "SCOUT",
    displayName: "Scout — driver discovery & fingerprinting",
    classification: "BACKGROUND_INTELLIGENCE",
    status: "IMPLEMENTED",
    reportsTo: "ARTUR",
    plannedReportsTo: "AKZHOL",
    notes: "Intelligence signal, NOT identity verification (s.14).",
  },

  // ---- Read-only analytics ----------------------------------------------
  {
    id: "ANALYTICS",
    displayName: "Analytics — read-only aggregation",
    classification: "READ_ONLY_ANALYTICS",
    status: "IMPLEMENTED",
    reportsTo: "ARTUR",
    notes: "Must never become a second Market Gap truth (s.3.D).",
  },

  // ---- Acquisition (contractors) ----------------------------------------
  {
    id: "DRIVER_CONTRACTOR",
    displayName: "Driver acquisition contractor",
    classification: "OPERATIONAL_AGENT",
    status: "IMPLEMENTED",
    reportsTo: "ARTUR",
    plannedReportsTo: "AKZHOL",
    notes: "Acquires only; operational involvement ends at accepted handoff (s.25).",
  },
  {
    id: "PASSENGER_CONTRACTOR",
    displayName: "Passenger acquisition contractor",
    classification: "OPERATIONAL_AGENT",
    status: "IMPLEMENTED",
    reportsTo: "ARTUR",
    plannedReportsTo: "AKZHOL",
    notes: "Acquires only; operational involvement ends at accepted handoff (s.25).",
  },
  {
    id: "DELIVERY_CONTRACTOR",
    displayName: "Business customer acquisition contractor",
    classification: "OPERATIONAL_AGENT",
    status: "IMPLEMENTED",
    reportsTo: "ARTUR",
    plannedReportsTo: "ZHOLAMAN",
    notes: "Acquires only; operational involvement ends at accepted handoff (s.25).",
  },
  {
    id: "DELIVERY_EXECUTOR_CONTRACTOR",
    displayName: "Delivery executor acquisition contractor",
    classification: "OPERATIONAL_AGENT",
    status: "IMPLEMENTED",
    reportsTo: "ARTUR",
    plannedReportsTo: "ZHOLAMAN",
    notes: "Acquires only; operational involvement ends at accepted handoff (s.25).",
  },
  {
    id: "CARGO_CARRIER_CONTRACTOR",
    displayName: "Cargo carrier acquisition contractor",
    classification: "OPERATIONAL_AGENT",
    status: "IMPLEMENTED",
    reportsTo: "ARTUR",
    plannedReportsTo: "ZHOLAMAN",
    notes: "Acquires only; operational involvement ends at accepted handoff (s.25).",
  },

  // ---- Adapters / wrappers (honest reclassification, s.2) ----------------
  {
    id: "COMMAND",
    displayName: "RT Command — inbound routing wrapper",
    classification: "ADAPTER_WRAPPER",
    status: "IMPLEMENTED",
    reportsTo: "ARTUR",
    plannedReportsTo: "AKZHOL",
    notes:
      "decideRoute() is deterministic routing; not an autonomous employee. It delegates INTO Mira, but Mira is a peer operational agent, not its manager.",
  },
  {
    id: "PASSENGER",
    displayName: "Passenger ingest wrapper",
    classification: "ADAPTER_WRAPPER",
    status: "IMPLEMENTED",
    reportsTo: "ARTUR",
    plannedReportsTo: "AKZHOL",
    notes: "38-line thin wrapper over ingestPassengerMessage. Documented honestly per s.2.",
  },
  {
    id: "DRIVER",
    displayName: "Driver ingest wrapper",
    classification: "ADAPTER_WRAPPER",
    status: "IMPLEMENTED",
    reportsTo: "ARTUR",
    plannedReportsTo: "AKZHOL",
    notes: "39-line thin wrapper over ingestDriverPrivateMessage. Documented honestly per s.2.",
  },
];

const NODES_BY_ID = new Map(RT_ORG_NODES.map((n) => [n.id, n]));

export function getOrgNode(id: string): RtOrgNode | undefined {
  return NODES_BY_ID.get(id);
}

export function isImplemented(id: string): boolean {
  return getOrgNode(id)?.status === "IMPLEMENTED";
}

/** Node ids that may hold management authority over other nodes. A
 * service-class node must never appear as someone's manager (s.27). */
export const MANAGERIAL_CLASSIFICATIONS: RtNodeClassification[] = ["MANAGER", "INDEPENDENT_CONTROL", "HUMAN_ROLE"];
