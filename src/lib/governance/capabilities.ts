// RT accountability matrix (hardening sprint s.1/s.27).
//
// One responsibility -> exactly one ACCOUNTABLE owner. Not zero, not two.
// Others may execute, review or advise, but one node answers for the result.
//
// `accountableOwner` is an RT_ORG_NODES id. Naming a PLANNED node here is how
// an orphan responsibility gets an intended home — it does NOT make the
// responsibility ready. readiness.ts fails a PRE_LIVE capability whose owner
// is PLANNED, which is what stops this file from becoming documentation
// theater. Everything marked preLiveRequired with a PLANNED owner is, by
// construction, a live-launch blocker that shows up in the readiness report.
import { getOrgNode } from "./org";

export type RtCapabilityDomain =
  | "COMMUNICATION"
  | "PASSENGER_OPS"
  | "DRIVER_OPS"
  | "DELIVERY_OPS"
  | "GEOGRAPHY"
  | "MATCHING"
  | "FINANCE"
  | "PRICING"
  | "TRUST_SAFETY"
  | "RISK"
  | "VERIFICATION"
  | "DISPUTES"
  | "ACQUISITION"
  | "PARTNERS"
  | "SECURITY"
  | "PRIVACY"
  | "LEGAL"
  | "RELIABILITY"
  | "ANALYTICS"
  | "MANAGEMENT";

export type RtCapabilityType =
  | "DECISION"
  | "EXECUTION"
  | "SYSTEM_OF_RECORD"
  | "CONTROL_GATE"
  | "OBSERVATION";

export interface RtCapability {
  capability: string;
  domain: RtCapabilityDomain;
  type: RtCapabilityType;
  /** Exactly one node id. */
  accountableOwner: string;
  executor: string;
  /** Checks the work. May be an agent or service — a reviewer is NOT an
   * approver, and must never be read as satisfying a human-approval
   * requirement. */
  reviewer?: string;
  systemOfRecord: string;
  handoffTarget?: string;
  escalationTarget: string;
  humanApprovalRequired: boolean;
  /** Required whenever humanApprovalRequired is true. Must be a HUMAN_ROLE
   * node: only a person can give human approval. */
  humanApprover?: string;
  preLiveRequired: boolean;
  failureMode: string;
}

export const RT_ACCOUNTABILITY_MATRIX: RtCapability[] = [
  // ---- Communication -----------------------------------------------------
  {
    capability: "public_customer_communication",
    domain: "COMMUNICATION",
    type: "EXECUTION",
    accountableOwner: "MIRA",
    executor: "MIRA",
    systemOfRecord: "Conversation / Message",
    escalationTarget: "AKZHOL",
    humanApprovalRequired: false,
    preLiveRequired: true,
    failureMode: "No reply sent; never a fabricated SENT status (SideEffectGateway enforces).",
  },
  {
    capability: "inbound_message_routing",
    domain: "COMMUNICATION",
    type: "DECISION",
    accountableOwner: "COMMAND",
    executor: "COMMAND",
    systemOfRecord: "Conversation / InboundMessage",
    handoffTarget: "MIRA",
    escalationTarget: "AKZHOL",
    humanApprovalRequired: false,
    preLiveRequired: true,
    failureMode: "Unroutable message surfaces to the human dispatcher; never silently dropped.",
  },
  {
    capability: "outbound_send_boundary",
    domain: "COMMUNICATION",
    type: "CONTROL_GATE",
    accountableOwner: "SIDE_EFFECT_GATEWAY",
    executor: "SIDE_EFFECT_GATEWAY",
    systemOfRecord: "SuppressedSend log / NotificationDelivery",
    escalationTarget: "HUMAN_RELIABILITY_OWNER",
    humanApprovalRequired: false,
    preLiveRequired: true,
    failureMode: "Fails closed: send is suppressed and reported as failed, never as delivered.",
  },

  // ---- Passenger operations ---------------------------------------------
  {
    capability: "passenger_request_intake",
    domain: "PASSENGER_OPS",
    type: "EXECUTION",
    accountableOwner: "MIRA",
    executor: "PASSENGER",
    systemOfRecord: "TripRequest",
    escalationTarget: "AKZHOL",
    humanApprovalRequired: false,
    preLiveRequired: true,
    failureMode: "Request not created; customer told honestly, no silent drop.",
  },
  {
    capability: "driver_offer_intake",
    domain: "DRIVER_OPS",
    type: "EXECUTION",
    accountableOwner: "MIRA",
    executor: "DRIVER",
    systemOfRecord: "DriverOffer",
    escalationTarget: "AKZHOL",
    humanApprovalRequired: false,
    preLiveRequired: true,
    failureMode: "Offer not created; driver told honestly.",
  },
  {
    capability: "matching_decision",
    domain: "MATCHING",
    type: "DECISION",
    accountableOwner: "MATCH",
    executor: "MATCH",
    reviewer: "QUALITY",
    systemOfRecord: "Match",
    escalationTarget: "AKZHOL",
    humanApprovalRequired: false,
    preLiveRequired: true,
    failureMode: "No match proposed; demand stays visible as unmatched. Never a fabricated match.",
  },
  {
    capability: "seat_reservation_and_booking_lifecycle",
    domain: "PASSENGER_OPS",
    type: "SYSTEM_OF_RECORD",
    accountableOwner: "MATCH",
    executor: "MATCH",
    systemOfRecord: "Booking / Match",
    escalationTarget: "AKZHOL",
    humanApprovalRequired: false,
    preLiveRequired: true,
    failureMode: "Transition rejected; prior state preserved (state machine is closed).",
  },
  {
    capability: "passenger_driver_operational_loop",
    domain: "PASSENGER_OPS",
    type: "EXECUTION",
    accountableOwner: "RT_OFFICE",
    executor: "RT_OFFICE",
    systemOfRecord: "PassengerLoop",
    escalationTarget: "AKZHOL",
    humanApprovalRequired: false,
    preLiveRequired: true,
    failureMode: "Loop stalls visibly in dispatcher UI rather than silently completing.",
  },
  {
    capability: "market_gap_computation",
    domain: "ANALYTICS",
    type: "DECISION",
    accountableOwner: "RT_OFFICE",
    executor: "RT_OFFICE",
    systemOfRecord: "computeMarketGap()",
    escalationTarget: "AKZHOL",
    humanApprovalRequired: false,
    preLiveRequired: false,
    failureMode: "Acquisition prioritization degrades to no-signal; never invents demand.",
  },
  {
    capability: "drive_crm_event_write",
    domain: "DRIVER_OPS",
    type: "SYSTEM_OF_RECORD",
    accountableOwner: "CRM_AUTO",
    executor: "CRM_AUTO",
    systemOfRecord: "DriveCrmEvent (append-only)",
    escalationTarget: "AKZHOL",
    humanApprovalRequired: false,
    preLiveRequired: true,
    failureMode: "Event not appended; no in-place mutation is ever attempted.",
  },
  {
    capability: "driver_discovery_intelligence",
    domain: "DRIVER_OPS",
    type: "OBSERVATION",
    accountableOwner: "SCOUT",
    executor: "SCOUT",
    systemOfRecord: "ScoutCandidate",
    handoffTarget: "VERIFICATION_SERVICE",
    escalationTarget: "AKZHOL",
    humanApprovalRequired: false,
    preLiveRequired: false,
    failureMode: "No candidate produced. Confidence is never treated as identity proof.",
  },

  // ---- Geography ---------------------------------------------------------
  {
    capability: "real_world_geography_eta_traffic",
    domain: "GEOGRAPHY",
    type: "DECISION",
    accountableOwner: "JOLCHU",
    executor: "JOLCHU",
    systemOfRecord: "Jolchu location/route cache",
    escalationTarget: "AKZHOL",
    humanApprovalRequired: false,
    preLiveRequired: true,
    failureMode: "Returns UNKNOWN. Never fabricates an ETA when a provider is down (s.20).",
  },
  {
    capability: "internal_corridor_topology",
    domain: "GEOGRAPHY",
    type: "SYSTEM_OF_RECORD",
    accountableOwner: "ROUTE",
    executor: "ROUTE",
    systemOfRecord: "RouteStop / RouteSegment",
    escalationTarget: "AKZHOL",
    humanApprovalRequired: false,
    preLiveRequired: true,
    failureMode: "No chain built; never substitutes real-world distance for topology.",
  },

  // ---- Delivery / cargo --------------------------------------------------
  {
    capability: "cargo_shipment_execution",
    domain: "DELIVERY_OPS",
    type: "EXECUTION",
    accountableOwner: "SAPAR",
    executor: "SAPAR",
    systemOfRecord: "Shipment",
    escalationTarget: "ZHOLAMAN",
    humanApprovalRequired: false,
    preLiveRequired: false,
    failureMode: "Shipment stays in its prior state; no silent completion.",
  },
  {
    capability: "assign_cargo_delivery_executor",
    domain: "DELIVERY_OPS",
    type: "DECISION",
    accountableOwner: "SAPAR",
    executor: "SAPAR",
    systemOfRecord: "Shipment",
    escalationTarget: "ZHOLAMAN",
    humanApprovalRequired: false,
    preLiveRequired: false,
    failureMode: "Unassigned shipment surfaces to dispatcher.",
  },
  {
    capability: "passenger_corridor_parcel_lifecycle",
    domain: "DELIVERY_OPS",
    type: "SYSTEM_OF_RECORD",
    accountableOwner: "PARCEL",
    executor: "PARCEL",
    systemOfRecord: "Parcel",
    escalationTarget: "ZHOLAMAN",
    humanApprovalRequired: false,
    preLiveRequired: false,
    failureMode: "Invalid transition rejected by canTransitionParcel().",
  },

  // ---- Finance -----------------------------------------------------------
  {
    capability: "commission_calculation",
    domain: "FINANCE",
    type: "DECISION",
    accountableOwner: "PAY",
    executor: "PAY",
    reviewer: "QUALITY",
    systemOfRecord: "LedgerEntry",
    escalationTarget: "TYYIN",
    humanApprovalRequired: false,
    preLiveRequired: true,
    failureMode: "Deterministic arithmetic; mismatch is flagged by Quality, never auto-corrected.",
  },
  {
    capability: "driver_rt_balance_ledger",
    domain: "FINANCE",
    type: "SYSTEM_OF_RECORD",
    accountableOwner: "PAY",
    executor: "PAY",
    systemOfRecord: "LedgerEntry / Driver.rtBalance",
    escalationTarget: "TYYIN",
    humanApprovalRequired: false,
    preLiveRequired: true,
    failureMode: "Balance unchanged on failure; no partial write.",
  },
  {
    capability: "cargo_payment_confirmation",
    domain: "FINANCE",
    type: "DECISION",
    accountableOwner: "SAPARGUL",
    executor: "SAPARGUL",
    reviewer: "TYYIN",
    systemOfRecord: "ShipmentPayment",
    escalationTarget: "TYYIN",
    humanApprovalRequired: false,
    preLiveRequired: false,
    failureMode: "Stays PAYMENT_PENDING. Never a fabricated confirmation.",
  },
  {
    capability: "passenger_payment_intake",
    domain: "FINANCE",
    type: "EXECUTION",
    accountableOwner: "PASSENGER_CASHIER",
    executor: "PASSENGER_CASHIER",
    reviewer: "TYYIN",
    systemOfRecord: "PassengerFinancialIntent (AuditLogEntry today)",
    escalationTarget: "TYYIN",
    humanApprovalRequired: false,
    preLiveRequired: true,
    failureMode:
      "ORPHAN TODAY: mira/passenger-finance.ts records an intent with financialProcessor:null and nothing consumes it.",
  },
  {
    capability: "central_treasury_bank_truth",
    domain: "FINANCE",
    type: "SYSTEM_OF_RECORD",
    accountableOwner: "TYYIN",
    executor: "TYYIN",
    reviewer: "HUMAN_ACCOUNTANT",
    systemOfRecord: "TreasuryTransaction",
    escalationTarget: "ARTUR",
    humanApprovalRequired: false,
    preLiveRequired: true,
    failureMode: "No confirmation recorded; waits safely rather than assuming receipt.",
  },
  {
    capability: "refund_authorization",
    domain: "FINANCE",
    type: "DECISION",
    accountableOwner: "TYYIN",
    executor: "TYYIN",
    reviewer: "ADILET",
    systemOfRecord: "TreasuryTransaction",
    escalationTarget: "FOUNDER",
    humanApprovalRequired: true,
    humanApprover: "FOUNDER",
    preLiveRequired: true,
    failureMode: "Refund not authorized; request stays open for human decision.",
  },
  {
    capability: "financial_exception_resolution",
    domain: "FINANCE",
    type: "DECISION",
    accountableOwner: "HUMAN_ACCOUNTANT",
    executor: "HUMAN_ACCOUNTANT",
    systemOfRecord: "TreasuryTransaction / AuditLogEntry",
    escalationTarget: "FOUNDER",
    humanApprovalRequired: true,
    humanApprover: "HUMAN_ACCOUNTANT",
    preLiveRequired: true,
    failureMode: "Exception stays queued; no agent may self-resolve it.",
  },

  // ---- Pricing -----------------------------------------------------------
  {
    capability: "fare_and_tariff_authority",
    domain: "PRICING",
    type: "DECISION",
    accountableOwner: "TARIFF_ENGINE",
    executor: "TARIFF_ENGINE",
    reviewer: "FOUNDER",
    systemOfRecord: "Tariff rules (to be defined)",
    escalationTarget: "FOUNDER",
    humanApprovalRequired: true,
    humanApprover: "FOUNDER",
    preLiveRequired: true,
    failureMode:
      "ORPHAN TODAY: price concepts are scattered with no single provenance-stamping engine. Unknown price must stay UNKNOWN / REQUIRES_QUOTE (s.15).",
  },

  // ---- Trust, safety, risk, disputes -------------------------------------
  {
    capability: "preventive_trust_gate",
    domain: "TRUST_SAFETY",
    type: "CONTROL_GATE",
    accountableOwner: "TRUST",
    executor: "TRUST",
    systemOfRecord: "Driver trust state / Complaint",
    escalationTarget: "ADILET",
    humanApprovalRequired: false,
    preLiveRequired: true,
    failureMode: "Fails closed: reveal/contact is denied when safety state is unknown.",
  },
  {
    capability: "service_recovery",
    domain: "PASSENGER_OPS",
    type: "EXECUTION",
    accountableOwner: "SUPPORT",
    executor: "SUPPORT",
    systemOfRecord: "SupportCase",
    handoffTarget: "ADILET",
    escalationTarget: "ADILET",
    humanApprovalRequired: false,
    preLiveRequired: true,
    failureMode: "Case stays open; Support never adjudicates an Adilet-owned dispute (s.3.B).",
  },
  {
    capability: "dispute_arbitration_decision",
    domain: "DISPUTES",
    type: "DECISION",
    accountableOwner: "ADILET",
    executor: "ADILET",
    systemOfRecord: "ArbitrationCase",
    escalationTarget: "FOUNDER",
    humanApprovalRequired: false,
    preLiveRequired: true,
    failureMode: "Case stays open. No manager may overturn a decision (adilet/role.ts).",
  },
  {
    capability: "disciplinary_sanction",
    domain: "DISPUTES",
    type: "DECISION",
    accountableOwner: "ADILET",
    executor: "ADILET",
    systemOfRecord: "ArbitrationCase / Sanction",
    escalationTarget: "FOUNDER",
    humanApprovalRequired: false,
    preLiveRequired: true,
    failureMode: "No sanction applied without an adjudicated case.",
  },
  {
    capability: "anomaly_detection",
    domain: "RISK",
    type: "OBSERVATION",
    accountableOwner: "QUALITY",
    executor: "QUALITY",
    systemOfRecord: "QualityAnomaly",
    handoffTarget: "ADILET",
    escalationTarget: "ARTUR",
    humanApprovalRequired: false,
    preLiveRequired: false,
    failureMode: "Audit yields no anomalies; never issues a sanction itself.",
  },
  {
    capability: "fraud_risk_signal_detection",
    domain: "RISK",
    type: "OBSERVATION",
    accountableOwner: "RISK_ENGINE",
    executor: "RISK_ENGINE",
    reviewer: "ADILET",
    systemOfRecord: "Risk signals (to be defined)",
    handoffTarget: "ADILET",
    escalationTarget: "ADILET",
    humanApprovalRequired: false,
    preLiveRequired: true,
    failureMode:
      "ORPHAN TODAY: fraud signals are fragmented across Sapargul/Quality/Trust/Scout with no owner. A signal must never equal a fraud conviction (s.13).",
  },
  {
    capability: "serious_safety_incident_response",
    domain: "TRUST_SAFETY",
    type: "DECISION",
    accountableOwner: "HUMAN_SAFETY_RESPONDER",
    executor: "HUMAN_SAFETY_RESPONDER",
    systemOfRecord: "ArbitrationCase / incident log",
    escalationTarget: "FOUNDER",
    humanApprovalRequired: true,
    humanApprover: "HUMAN_SAFETY_RESPONDER",
    preLiveRequired: true,
    failureMode: "ORPHAN TODAY: no runtime owner for physical-world emergencies (s.12).",
  },

  // ---- Verification ------------------------------------------------------
  {
    capability: "driver_identity_verification",
    domain: "VERIFICATION",
    type: "CONTROL_GATE",
    accountableOwner: "VERIFICATION_SERVICE",
    executor: "VERIFICATION_SERVICE",
    reviewer: "HUMAN_DISPATCHER",
    systemOfRecord: "Driver verification state (to be defined)",
    escalationTarget: "ADILET",
    humanApprovalRequired: true,
    humanApprover: "HUMAN_DISPATCHER",
    preLiveRequired: true,
    failureMode:
      "ORPHAN TODAY: no formal verification gate. Scout confidence must not become legal identity proof (s.14).",
  },
  {
    capability: "vehicle_verification",
    domain: "VERIFICATION",
    type: "CONTROL_GATE",
    accountableOwner: "VERIFICATION_SERVICE",
    executor: "VERIFICATION_SERVICE",
    reviewer: "HUMAN_DISPATCHER",
    systemOfRecord: "Vehicle verification state (to be defined)",
    escalationTarget: "ADILET",
    humanApprovalRequired: true,
    humanApprover: "HUMAN_DISPATCHER",
    preLiveRequired: true,
    failureMode: "ORPHAN TODAY: unverified vehicle cannot be proven safe to carry passengers.",
  },
  {
    capability: "partner_verification",
    domain: "PARTNERS",
    type: "CONTROL_GATE",
    accountableOwner: "VERIFICATION_SERVICE",
    executor: "VERIFICATION_SERVICE",
    reviewer: "ZHOLAMAN",
    systemOfRecord: "Partner registry",
    escalationTarget: "ZHOLAMAN",
    humanApprovalRequired: true,
    humanApprover: "HUMAN_DISPATCHER",
    preLiveRequired: false,
    failureMode: "ORPHAN TODAY: a claimed capability can become registry truth without a verification gate (s.26).",
  },
  {
    capability: "partner_registry_record",
    domain: "PARTNERS",
    type: "SYSTEM_OF_RECORD",
    accountableOwner: "NETWORK",
    executor: "NETWORK",
    systemOfRecord: "Partner",
    escalationTarget: "ZHOLAMAN",
    humanApprovalRequired: false,
    preLiveRequired: false,
    failureMode: "Partner not created/updated; CRUD only, no capability inference.",
  },

  // ---- Acquisition -------------------------------------------------------
  {
    capability: "driver_acquisition_outreach",
    domain: "ACQUISITION",
    type: "EXECUTION",
    accountableOwner: "DRIVER_CONTRACTOR",
    executor: "DRIVER_CONTRACTOR",
    systemOfRecord: "AcquisitionOutreachEvent",
    handoffTarget: "AKZHOL",
    escalationTarget: "AKZHOL",
    humanApprovalRequired: false,
    preLiveRequired: false,
    failureMode: "Outreach reported FAILED honestly; never a fabricated SENT.",
  },
  {
    capability: "passenger_acquisition_outreach",
    domain: "ACQUISITION",
    type: "EXECUTION",
    accountableOwner: "PASSENGER_CONTRACTOR",
    executor: "PASSENGER_CONTRACTOR",
    systemOfRecord: "AcquisitionOutreachEvent",
    handoffTarget: "AKZHOL",
    escalationTarget: "AKZHOL",
    humanApprovalRequired: false,
    preLiveRequired: false,
    failureMode: "Outreach reported FAILED honestly; never a fabricated SENT.",
  },
  {
    capability: "business_customer_acquisition",
    domain: "ACQUISITION",
    type: "EXECUTION",
    accountableOwner: "DELIVERY_CONTRACTOR",
    executor: "DELIVERY_CONTRACTOR",
    systemOfRecord: "AcquisitionOutreachEvent / DeliveryCrmEvent",
    handoffTarget: "ZHOLAMAN",
    escalationTarget: "ZHOLAMAN",
    humanApprovalRequired: false,
    preLiveRequired: false,
    failureMode: "Outreach reported FAILED honestly; never a fabricated SENT.",
  },
  {
    capability: "delivery_executor_acquisition",
    domain: "ACQUISITION",
    type: "EXECUTION",
    accountableOwner: "DELIVERY_EXECUTOR_CONTRACTOR",
    executor: "DELIVERY_EXECUTOR_CONTRACTOR",
    systemOfRecord: "AcquisitionOutreachEvent",
    handoffTarget: "ZHOLAMAN",
    escalationTarget: "ZHOLAMAN",
    humanApprovalRequired: false,
    preLiveRequired: false,
    failureMode: "Outreach reported FAILED honestly; never a fabricated SENT.",
  },
  {
    capability: "cargo_carrier_acquisition",
    domain: "ACQUISITION",
    type: "EXECUTION",
    accountableOwner: "CARGO_CARRIER_CONTRACTOR",
    executor: "CARGO_CARRIER_CONTRACTOR",
    systemOfRecord: "AcquisitionOutreachEvent",
    handoffTarget: "ZHOLAMAN",
    escalationTarget: "ZHOLAMAN",
    humanApprovalRequired: false,
    preLiveRequired: false,
    failureMode: "Outreach reported FAILED honestly; never a fabricated SENT.",
  },

  // ---- Cross-company control functions -----------------------------------
  {
    capability: "information_security",
    domain: "SECURITY",
    type: "CONTROL_GATE",
    accountableOwner: "HUMAN_SECURITY_OWNER",
    executor: "HUMAN_SECURITY_OWNER",
    systemOfRecord: "Auth/webhook config + AuditLogEntry",
    escalationTarget: "FOUNDER",
    humanApprovalRequired: true,
    humanApprover: "HUMAN_SECURITY_OWNER",
    preLiveRequired: true,
    failureMode:
      "ORPHAN TODAY: webhook auth already fails closed in code, but no named owner governs secrets/RBAC/rotation (s.16).",
  },
  {
    capability: "privacy_and_data_governance",
    domain: "PRIVACY",
    type: "CONTROL_GATE",
    accountableOwner: "HUMAN_PRIVACY_OWNER",
    executor: "HUMAN_PRIVACY_OWNER",
    systemOfRecord: "Retention policy (to be defined)",
    escalationTarget: "FOUNDER",
    humanApprovalRequired: true,
    humanApprover: "HUMAN_PRIVACY_OWNER",
    preLiveRequired: true,
    failureMode: "ORPHAN TODAY: no retention/deletion policy owner (s.17).",
  },
  {
    capability: "legal_and_regulatory_compliance",
    domain: "LEGAL",
    type: "DECISION",
    accountableOwner: "HUMAN_LEGAL_COMPLIANCE",
    executor: "HUMAN_LEGAL_COMPLIANCE",
    systemOfRecord: "Legal records (outside RT Core)",
    escalationTarget: "FOUNDER",
    humanApprovalRequired: true,
    humanApprover: "HUMAN_LEGAL_COMPLIANCE",
    preLiveRequired: true,
    failureMode: "ORPHAN TODAY. RT software may prepare facts but never decides law (s.18).",
  },
  {
    capability: "platform_reliability_and_incident_response",
    domain: "RELIABILITY",
    type: "EXECUTION",
    accountableOwner: "HUMAN_RELIABILITY_OWNER",
    executor: "HUMAN_RELIABILITY_OWNER",
    systemOfRecord: "/api/health + deployment logs",
    escalationTarget: "FOUNDER",
    humanApprovalRequired: false,
    preLiveRequired: true,
    failureMode:
      "ORPHAN TODAY: readiness endpoint exists but no owner, alerting, rollback policy or on-call rota (s.19).",
  },
  {
    capability: "backup_and_disaster_recovery",
    domain: "RELIABILITY",
    type: "EXECUTION",
    accountableOwner: "HUMAN_RELIABILITY_OWNER",
    executor: "HUMAN_RELIABILITY_OWNER",
    systemOfRecord: "Database provider backups",
    escalationTarget: "FOUNDER",
    humanApprovalRequired: true,
    humanApprover: "HUMAN_RELIABILITY_OWNER",
    preLiveRequired: true,
    failureMode: "ORPHAN TODAY: no documented restore drill or RPO/RTO target.",
  },
  {
    capability: "deployment_and_rollback_policy",
    domain: "RELIABILITY",
    type: "CONTROL_GATE",
    accountableOwner: "HUMAN_RELIABILITY_OWNER",
    executor: "HUMAN_RELIABILITY_OWNER",
    systemOfRecord: "Vercel deployments",
    escalationTarget: "FOUNDER",
    humanApprovalRequired: true,
    humanApprover: "HUMAN_RELIABILITY_OWNER",
    preLiveRequired: true,
    failureMode: "ORPHAN TODAY: no written rollback/verification procedure.",
  },

  // ---- Management / observation ------------------------------------------
  {
    capability: "passenger_operations_performance_management",
    domain: "MANAGEMENT",
    type: "OBSERVATION",
    accountableOwner: "AKZHOL",
    executor: "AKZHOL",
    systemOfRecord: "Manager report (derived from RT Core)",
    escalationTarget: "ARTUR",
    humanApprovalRequired: false,
    preLiveRequired: false,
    failureMode: "ORPHAN TODAY: no manager module; Artur reads raw tables instead (s.8).",
  },
  {
    capability: "delivery_cargo_performance_management",
    domain: "MANAGEMENT",
    type: "OBSERVATION",
    accountableOwner: "ZHOLAMAN",
    executor: "ZHOLAMAN",
    systemOfRecord: "Manager report (derived from RT Core)",
    escalationTarget: "ARTUR",
    humanApprovalRequired: false,
    preLiveRequired: false,
    failureMode: "ORPHAN TODAY: only a payment-visibility filter exists (s.9).",
  },
  {
    capability: "executive_reporting",
    domain: "MANAGEMENT",
    type: "OBSERVATION",
    accountableOwner: "ARTUR",
    executor: "ARTUR",
    systemOfRecord: "DailyBrief / WeeklyReport",
    escalationTarget: "FOUNDER",
    humanApprovalRequired: false,
    preLiveRequired: false,
    failureMode: "Report generation failure must never block operations (s.20).",
  },
  {
    capability: "read_only_business_analytics",
    domain: "ANALYTICS",
    type: "OBSERVATION",
    accountableOwner: "ANALYTICS",
    executor: "ANALYTICS",
    systemOfRecord: "Aggregations over RT Core",
    escalationTarget: "ARTUR",
    humanApprovalRequired: false,
    preLiveRequired: false,
    failureMode: "Analytics failure must never break booking (s.20).",
  },
  {
    capability: "launch_readiness_decision",
    domain: "MANAGEMENT",
    type: "DECISION",
    accountableOwner: "FOUNDER",
    executor: "FOUNDER",
    reviewer: "ARTUR",
    systemOfRecord: "RT_PRE_LIVE_READINESS",
    escalationTarget: "FOUNDER",
    humanApprovalRequired: true,
    humanApprover: "FOUNDER",
    preLiveRequired: true,
    failureMode: "Fails closed: unknown readiness is never LIVE_READY (s.29).",
  },
];

/** Capabilities whose accountable owner does not exist in code yet — the
 * honest list of responsibilities RT has named but not staffed. */
export function unstaffedCapabilities(matrix: RtCapability[] = RT_ACCOUNTABILITY_MATRIX): RtCapability[] {
  return matrix.filter((c) => getOrgNode(c.accountableOwner)?.status !== "IMPLEMENTED");
}
