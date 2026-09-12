// What is actually standing between RT and a controlled pre-LIVE (Founder
// decision D).
//
// readiness.ts answers "is RT ready?" — no. This module answers the question
// that follows: *what kind* of thing is missing, because the four kinds are
// resolved by completely different people and confusing them is how a project
// lies to itself.
//
//   SOFTWARE_BLOCKER          — RT can write it. No permission needed.
//   HUMAN_STAFFING_BLOCKER    — a POST is vacant. No amount of code fills it.
//   EXTERNAL_PROVIDER_BLOCKER — depends on a third party RT does not control.
//   FOUNDER_DECISION_BLOCKER  — a business/money/legal choice only the Founder
//                               may make.
//
// The distinction that matters most: **a human vacancy must never be recorded
// as missing code.** If "nobody is accountable for fraud" is filed as a
// software gap, someone will eventually close it by writing a module, and RT
// will go live with an unaccountable one. So a HUMAN_STAFFING_BLOCKER carries
// a full post specification instead — mandate, rights, what the post must
// never be given, onboarding, credentials, and who may appoint. What it
// deliberately does NOT carry is a person: no name, no invented employee.
// The post is described; filling it is an act outside this repository.
import { RT_ACCOUNTABILITY_MATRIX } from "./capabilities";
import { getOrgNode } from "./org";
import { MANUAL_PRE_LIVE_GATES, type ManualPreLiveGate } from "./readiness";

export type BlockerKind =
  | "SOFTWARE_BLOCKER"
  | "HUMAN_STAFFING_BLOCKER"
  | "EXTERNAL_PROVIDER_BLOCKER"
  | "FOUNDER_DECISION_BLOCKER";

/** A vacant post. Describes the seat, never an occupant. */
export interface PostSpecification {
  /** Org-node id of the vacant post. A node id, never a person's name. */
  post: string;
  /** One sentence: what this post answers for. */
  mandate: string;
  /** Least-privilege rights the post genuinely needs. */
  rights: string[];
  /** Rights the post must never receive, even if convenient. This list is the
   * segregation of duties, stated as prohibitions rather than as an aspiration. */
  deniedRights: string[];
  /** Posts/roles the same individual must not hold simultaneously, and why. */
  incompatibleWith: string[];
  /** Steps that must be complete before the post is treated as filled. */
  onboarding: string[];
  /** Credentials to be issued, and the terms they are issued under. */
  credentials: string[];
  /** Org-node id with the authority to appoint. Must exist today. */
  appointedBy: string;
  /** Manual pre-LIVE gates that stay UNKNOWN until this post is filled. */
  gatesHeldOpen: ManualPreLiveGate[];
}

export interface PreLiveBlocker {
  id: string;
  kind: BlockerKind;
  title: string;
  /** Capability ids and/or manual gate ids this blocker holds shut. */
  blocks: string[];
  /** The factual situation today, in code terms where it is a code fact. */
  detail: string;
  /** What specifically clears it. Not "improve X" — the actual act. */
  resolution: string;
  /** Present exactly when kind is HUMAN_STAFFING_BLOCKER. */
  post?: PostSpecification;
}

// Rights phrasing note: these are written as capability sentences rather than
// as permission strings, because RT has no role-based access system yet.
// Turning them into enforced grants is itself a SOFTWARE_BLOCKER below.
export const RT_PRE_LIVE_BLOCKERS: PreLiveBlocker[] = [
  // ---- Human staffing ----------------------------------------------------
  {
    id: "accountant_post_vacant",
    kind: "HUMAN_STAFFING_BLOCKER",
    title: "No human accountant for financial exceptions",
    blocks: ["financial_exception_resolution"],
    detail:
      "Tyyin escalates anything it cannot reconcile, and the escalation currently terminates at a PLANNED node. An unreconciled payment therefore has no resolver: it waits.",
    resolution: "Founder appoints a person to HUMAN_ACCOUNTANT and completes the onboarding below.",
    post: {
      post: "HUMAN_ACCOUNTANT",
      mandate:
        "Resolves financial exceptions Tyyin cannot reconcile automatically, and answers for the correctness of that resolution.",
      rights: [
        "Read the full treasury ledger, both departments, including amounts.",
        "Read bank statements provided by the Founder for reconciliation.",
        "Record a reconciliation decision with a written reason, as an append-only ledger entry.",
        "Escalate to the Founder, and refuse to reconcile on insufficient evidence.",
      ],
      deniedRights: [
        "Initiating an outgoing payment, payout or refund. RT has no outgoing-money ability at all (s.10) and this post must not become the exception.",
        "Editing or deleting a historical ledger entry. Corrections are new entries.",
        "Holding bank credentials. Reconciliation reads statements; it does not operate the account.",
        "Changing fares, tariffs or commission rates.",
      ],
      incompatibleWith: [
        "PASSENGER_CASHIER and SAPARGUL — whoever accepts money must not be the one who certifies that it arrived.",
        "HUMAN_SECURITY_OWNER — the holder of credentials must not also be the auditor of their use.",
      ],
      onboarding: [
        "Read docs/FINANCIAL_BOUNDARIES.md and confirm in writing that RT cannot send money and must not be made able to.",
        "Walk one real reconciliation on sandbox data end to end, including one deliberate refusal.",
        "Sign off on the escalation path: Tyyin → this post → Founder.",
        "Confirm the four-eyes rule: any single reconciliation above a Founder-set threshold requires Founder counter-approval.",
      ],
      credentials: [
        "Named individual account with the accountant role. Never a shared login.",
        "Read access to treasury data; no write path except append-only reconciliation entries.",
        "No bank credentials, no provider API keys, no production database access.",
        "Access is granted on appointment and revoked the same day the post is vacated.",
      ],
      appointedBy: "FOUNDER",
      gatesHeldOpen: [],
    },
  },
  {
    id: "safety_responder_post_vacant",
    kind: "HUMAN_STAFFING_BLOCKER",
    title: "No named human responder for serious safety incidents",
    blocks: ["serious_safety_incident_response", "named_human_responder_for_safety_incidents"],
    detail:
      "s.12 forbids an agent handling a physical-world emergency alone, and RT honours that by refusing to act — but refusal without a responder means a real incident reaches nobody.",
    resolution:
      "Founder names a reachable person, with a phone number and defined hours, and attests named_human_responder_for_safety_incidents.",
    post: {
      post: "HUMAN_SAFETY_RESPONDER",
      mandate:
        "Answers, within a stated response time, when a trip involves injury, violence, an accident or a missing person.",
      rights: [
        "Read full trip, driver, vehicle and passenger contact details for the specific incident.",
        "Contact the people involved directly, outside RT's automated messaging.",
        "Order an immediate suspension of a driver or vehicle as a precaution, pending Adilet's decision.",
        "Contact emergency services and act before RT's internal process concludes.",
      ],
      deniedRights: [
        "Issuing a disciplinary sanction. Precautionary suspension is not a verdict; conviction stays with Adilet plus the Founder (s.12).",
        "Bulk export of passenger or driver personal data. Access is per-incident.",
        "Any financial action, including compensation promises.",
      ],
      incompatibleWith: [
        "ADILET's human approver role for the same incident — the person who suspended cannot also adjudicate it.",
      ],
      onboarding: [
        "Publish the reachable channel and the response-time commitment; RT records both.",
        "Walk the escalation script once on a scenario incident, including contacting emergency services.",
        "Confirm the precaution/sanction boundary in writing.",
        "Confirm the data-minimisation rule: per-incident access, no browsing.",
      ],
      credentials: [
        "Named individual account with the safety-responder role.",
        "Per-incident access to contact data, logged on every read.",
        "Suspension right scoped to precautionary status only.",
        "No financial, no infrastructure, no secret access.",
        "Revoked the same day the post is vacated, including the suspension right.",
      ],
      appointedBy: "FOUNDER",
      gatesHeldOpen: ["named_human_responder_for_safety_incidents"],
    },
  },
  {
    id: "security_owner_post_vacant",
    kind: "HUMAN_STAFFING_BLOCKER",
    title: "No human owner of information security and secrets",
    blocks: ["information_security", "named_human_owner_for_security_and_secrets"],
    detail:
      "Security ownership today is implicit in code review. Nobody holds the secret inventory, nobody owns rotation, and nobody is accountable for a leak.",
    resolution:
      "Founder appoints a person to HUMAN_SECURITY_OWNER, who produces a secret inventory, and attests named_human_owner_for_security_and_secrets.",
    post: {
      post: "HUMAN_SECURITY_OWNER",
      mandate: "Owns the secret inventory, access grants and the response to a suspected compromise.",
      rights: [
        "Maintain the authoritative inventory of every secret, where it lives and what it can do.",
        "Grant and revoke access, and revoke unilaterally without prior approval when compromise is suspected.",
        "Require rotation, and block a release that would ship a secret or weaken a security control.",
        "Audit who accessed what, including the Founder's access.",
      ],
      deniedRights: [
        "Reading passenger or driver personal data as a matter of course; secret custody is not data access.",
        "Approving their own access grants — the Founder counter-signs grants to this post.",
        "Financial authority of any kind.",
        "Silently weakening a fail-closed control to unblock a release. UNKNOWN must stay closed (s.16/s.29).",
      ],
      incompatibleWith: [
        "HUMAN_ACCOUNTANT — custody of credentials and audit of their financial use must be separate people.",
        "HUMAN_PRIVACY_OWNER — separable in principle; if one person holds both, the Founder must record that concentration as an accepted risk.",
      ],
      onboarding: [
        "Produce the secret inventory: every key, its scope, its blast radius, its rotation owner.",
        "Confirm no production secret is present in the repository or in CI beyond what CI needs.",
        "Define the compromise procedure: revoke first, investigate second.",
        "Confirm that no security control may be disabled to make a test or a build pass.",
      ],
      credentials: [
        "Named individual account with administrative rights over the secret store only.",
        "Two-factor authentication mandatory; no shared credential under any circumstances.",
        "Break-glass credentials sealed, their use alerting the Founder automatically.",
        "Full revocation on the day the post is vacated, including break-glass.",
      ],
      appointedBy: "FOUNDER",
      gatesHeldOpen: ["named_human_owner_for_security_and_secrets"],
    },
  },
  {
    id: "privacy_owner_post_vacant",
    kind: "HUMAN_STAFFING_BLOCKER",
    title: "No human owner of privacy, retention and deletion",
    blocks: ["privacy_and_data_governance", "named_human_owner_for_privacy_and_retention"],
    detail:
      "RT stores passenger and driver personal data with no retention period, no deletion process and no owner for a deletion request (s.17).",
    resolution:
      "Founder appoints a person to HUMAN_PRIVACY_OWNER, who sets retention periods per data category, and attests named_human_owner_for_privacy_and_retention.",
    post: {
      post: "HUMAN_PRIVACY_OWNER",
      mandate:
        "Decides what personal data RT keeps, for how long, and answers for deletion, legal hold and data-subject requests.",
      rights: [
        "Set and change the retention period for each category of personal data.",
        "Order deletion or anonymisation, and place a legal hold that overrides scheduled deletion.",
        "Receive and answer data-subject requests, and require engineering to make the answer possible.",
        "Block a feature that collects personal data with no stated purpose.",
      ],
      deniedRights: [
        "Executing a destructive deletion directly against production. Deletion is ordered here and executed through a reviewed, audited path (s.31).",
        "Deleting financial or dispute records still inside their mandatory retention period.",
        "Holding infrastructure credentials.",
      ],
      incompatibleWith: [
        "HUMAN_SECURITY_OWNER — see the note there; combining them concentrates custody and oversight.",
      ],
      onboarding: [
        "Inventory every personal-data field RT stores and state a purpose for each.",
        "Set a retention period per category; anything without one is a defect, not a default of forever.",
        "Define the deletion request path and its response time.",
        "Confirm the legal-hold procedure with HUMAN_LEGAL_COMPLIANCE.",
      ],
      credentials: [
        "Named individual account with the privacy-owner role.",
        "Read access scoped to data inventory and audit metadata, not to bulk personal data.",
        "No direct database write access; deletion orders travel through a reviewed path.",
        "Revoked on vacating the post.",
      ],
      appointedBy: "FOUNDER",
      gatesHeldOpen: ["named_human_owner_for_privacy_and_retention"],
    },
  },
  {
    id: "legal_compliance_post_vacant",
    kind: "HUMAN_STAFFING_BLOCKER",
    title: "No human legal and compliance officer",
    blocks: ["legal_and_regulatory_compliance"],
    detail:
      "s.18 forbids an autonomous AI lawyer, and RT has correctly not built one — which leaves the responsibility unheld rather than solved.",
    resolution:
      "Founder appoints a person (employee or retained counsel) to HUMAN_LEGAL_COMPLIANCE. This is a prerequisite for the legal-entity gate, not a substitute for it.",
    post: {
      post: "HUMAN_LEGAL_COMPLIANCE",
      mandate:
        "Answers for whether RT's operations, contracts and customer terms are lawful in the jurisdictions it serves.",
      rights: [
        "Read contracts, terms, driver and partner agreements, and the dispute record.",
        "Require a change to terms, or to a product flow, on legal grounds.",
        "Block a launch or a market entry as unlawful, and that block is not overridable by an agent.",
        "Place a legal hold on data jointly with HUMAN_PRIVACY_OWNER.",
      ],
      deniedRights: [
        "Deciding commercial pricing. Legality constrains price; it does not set it.",
        "Adjudicating an individual customer dispute — that is Adilet plus the Founder.",
        "Any financial or infrastructure authority.",
      ],
      incompatibleWith: [
        "ADILET's human approver role — the arbiter of disputes should not also be the author of the terms being disputed.",
      ],
      onboarding: [
        "Confirm the legal entity, its jurisdiction and its licensing position for passenger and cargo transport.",
        "Review the driver, partner and passenger terms as written, and flag what is unenforceable.",
        "Confirm the regulatory reporting obligations, if any, and who files them.",
        "Sign off on the pre-LIVE customer-facing text.",
      ],
      credentials: [
        "Named individual account, or a retained-counsel engagement recorded with a name.",
        "Document and contract access only; no operational system access.",
        "No personal-data access beyond specific matters.",
        "Revoked on termination of the engagement.",
      ],
      appointedBy: "FOUNDER",
      gatesHeldOpen: [],
    },
  },
  {
    id: "reliability_owner_post_vacant",
    kind: "HUMAN_STAFFING_BLOCKER",
    title: "No named human on call for platform reliability",
    blocks: [
      "platform_reliability_and_incident_response",
      "backup_and_disaster_recovery",
      "deployment_and_rollback_policy",
      "named_human_on_call_for_reliability",
    ],
    detail:
      "s.19: RT must not depend on an AI assistant manually checking a dashboard. SIDE_EFFECT_GATEWAY — the control that stands between RT and real customer sends — reports straight to the Founder today precisely because this post does not exist.",
    resolution:
      "Founder names an on-call person with a reachable channel and a response-time commitment, and attests named_human_on_call_for_reliability.",
    post: {
      post: "HUMAN_RELIABILITY_OWNER",
      mandate:
        "Answers when RT is down, degraded or behaving unsafely, and owns deployment, rollback and restore as procedures rather than as improvisations.",
      rights: [
        "Read production logs, metrics and alerts.",
        "Roll back a deployment, and disable a feature flag or outbound sending, without prior approval, in an incident.",
        "Declare an incident and halt releases.",
        "Run a restore drill against a non-production environment.",
      ],
      deniedRights: [
        "Enabling LIVE outbound mode. That is a Founder decision and stays outside the incident toolkit (s.32).",
        "Destructive production data operations. Restore runs forward into a new environment, never as an in-place wipe (s.31).",
        "Reading passenger or driver personal data for debugging without a recorded reason.",
        "Approving their own rollback policy — the Founder signs the policy; this post executes it.",
      ],
      incompatibleWith: [
        "HUMAN_SECURITY_OWNER — separable in principle, but combining on-call production access with secret custody concentrates the two most dangerous grants; the Founder must record it as an accepted risk if one person holds both.",
      ],
      onboarding: [
        "Publish the on-call channel, hours and response-time commitment.",
        "Write the rollback procedure and rehearse it once — this is what the rollback gate attests.",
        "Perform one restore from backup into a scratch environment and record the elapsed time — this is what the backup gate attests.",
        "Confirm that enabling real outbound sending is never part of an incident response.",
      ],
      credentials: [
        "Named individual account with deploy and rollback rights, two-factor mandatory.",
        "Production read access to logs and metrics; personal-data reads logged with a reason.",
        "No standing production database write access; break-glass only, alerting the Founder.",
        "No authority over MIRA_OUTBOUND_MODE.",
        "Deploy, rollback and break-glass access revoked the same day the post is vacated.",
      ],
      appointedBy: "FOUNDER",
      gatesHeldOpen: ["named_human_on_call_for_reliability"],
    },
  },
  {
    id: "passenger_direction_manager_post_vacant",
    kind: "HUMAN_STAFFING_BLOCKER",
    title: "Akzhol — passenger-direction manager post is vacant",
    blocks: ["passenger_operations_performance_management"],
    detail:
      "The management information now exists (src/lib/akzhol/*, read-only, role-gated), but nobody holds the akzhol role. The measurement is not the manager: until the post is filled, the report has no reader who answers for what it shows. Not pre-LIVE blocking — RT can serve customers without a performance manager, it just cannot claim the direction is managed.",
    resolution:
      "Founder appoints a person to AKZHOL and grants the akzhol role. No code change is required to start: the report is already there and already gated.",
    post: {
      post: "AKZHOL",
      mandate:
        "Answers for passenger-direction PERFORMANCE — conversion, decline reasons, handling time, completion, supply gaps — never for an individual booking.",
      rights: [
        "Read the aggregated passenger-direction report: leads, demand, directions, bookings, declines with reasons, handling time, execution, service quality.",
        "Read the operational anomalies the report raises, and require an explanation for each.",
        "Propose changes to corridors, supply targets and outreach priorities.",
        "Escalate a systemic problem to Artur and, for policy, to the Founder.",
      ],
      deniedRights: [
        "Write access of any kind to operational data. The module contains no Prisma write call and a boundary test keeps it that way.",
        "Overriding a Match decision, a Trust gate or an Adilet sanction.",
        "Any money read or action — no amounts, no fares, no ledger (the report queries no money model at all).",
        "Acting as an orchestrator, a cashier or a transaction owner, or replacing Mira, RT Office or the CRM.",
      ],
      incompatibleWith: [
        "PASSENGER_CASHIER and HUMAN_ACCOUNTANT — the person judged on conversion must not also handle the money it produces.",
      ],
      onboarding: [
        "Read the report definitions, including why a rate is n/a rather than 0% when there is no denominator.",
        "Read the missingDataNotes and understand which gaps are known and unresolved.",
        "Confirm the boundary in writing: analysis and management, never execution, never write access.",
        "Agree the reporting cadence with Artur.",
      ],
      credentials: [
        "Named individual account with the akzhol role only.",
        "Read-only by construction; no elevated path exists to grant.",
        "No money access, no dispatcher access, no secret access.",
        "Revoked on vacating the post.",
      ],
      appointedBy: "FOUNDER",
      gatesHeldOpen: [],
    },
  },
  {
    id: "cargo_direction_manager_post_vacant",
    kind: "HUMAN_STAFFING_BLOCKER",
    title: "Zholaman — cargo/delivery-direction manager post is vacant",
    blocks: ["delivery_cargo_performance_management"],
    detail:
      "Same shape as AKZHOL: src/lib/zholaman/* reports orders, execution, partners, incidents, quality and week-over-week dynamics read-only, and the accountable post is empty. Additionally there is no customer-review model in the schema at all, so satisfaction is reported as missing rather than scored.",
    resolution: "Founder appoints a person to ZHOLAMAN and grants the zholaman role.",
    post: {
      post: "ZHOLAMAN",
      mandate:
        "Answers for cargo and delivery PERFORMANCE — order flow, execution quality, lateness, partner mix, incidents, commercial dynamics — never for an individual shipment.",
      rights: [
        "Read the aggregated cargo-direction report: orders, execution and lateness, partners and tiers, incidents by severity, quality signals, week-over-week change.",
        "See payment status only as the coarse PAID / PENDING / PROBLEM collapse (s.21).",
        "Require an explanation for each anomaly, including executor concentration and unverified executors.",
        "Escalate systemic quality problems to Artur, incidents to Adilet, and policy to the Founder.",
      ],
      deniedRights: [
        "Write access of any kind, including partner records — Network owns that CRUD.",
        "Any payment amount, invoice total or revenue figure. Amounts belong to Tyyin and Sapargul.",
        "Approving a partner as verified. Verification is a separate gate (s.26) that does not exist yet.",
        "Assigning an executor to a shipment, or acting as a cashier or transaction owner.",
      ],
      incompatibleWith: [
        "SAPARGUL's cargo-cashier function and HUMAN_ACCOUNTANT — performance judgement stays separate from money handling.",
      ],
      onboarding: [
        "Read the report definitions, including the payment-status collapse and why no amount is shown.",
        "Read the missingDataNotes: no review model, unassigned orders, unverified executors.",
        "Confirm the boundary in writing: read and manage, never execute, never write.",
        "Agree the reporting cadence with Artur.",
      ],
      credentials: [
        "Named individual account with the zholaman role only.",
        "Read-only by construction.",
        "No amount-level financial access, no secret access.",
        "Revoked on vacating the post.",
      ],
      appointedBy: "FOUNDER",
      gatesHeldOpen: [],
    },
  },

  // ---- Software ----------------------------------------------------------
  {
    id: "passenger_cashier_not_wired",
    kind: "SOFTWARE_BLOCKER",
    title: "No passenger cashier module is wired",
    blocks: ["passenger_payment_intake"],
    detail:
      "TreasuryDepartment.PASSENGER exists and mira/passenger-finance.ts records an intent with financialProcessor: null. The idempotency substrate for those intents is now in place (PassengerFinancialIntent, unique idempotency key, replay-safe), but no cashier consumes them.",
    resolution:
      "Build the passenger cashier against the existing intent table: sandbox only, no outgoing-money path, mirroring Sapargul's boundaries for the passenger contour. Its display name stays pending — see founder_names_passenger_cashier.",
  },
  {
    id: "tariff_engine_absent",
    kind: "SOFTWARE_BLOCKER",
    title: "No deterministic tariff engine with price provenance",
    blocks: ["fare_and_tariff_authority"],
    detail:
      "Fare concepts are scattered and no single component stamps where a price came from. RT correctly answers UNKNOWN / REQUIRES_QUOTE rather than inventing a number (s.15), which is safe but means RT cannot quote at all.",
    resolution:
      "Implement TARIFF_ENGINE: deterministic, no reasoning, every returned price carrying its provenance, and UNKNOWN where no rule applies. It can only be built once the pricing policy exists — see founder_approves_pricing_policy.",
  },
  {
    id: "risk_engine_absent",
    kind: "SOFTWARE_BLOCKER",
    title: "No fraud or risk signal detection",
    blocks: ["fraud_risk_signal_detection"],
    detail:
      "Nothing detects a fake driver, a collusive booking pattern or a payment-claim anomaly. Quality flags operational anomalies, which is a different question.",
    resolution:
      "Implement RISK_ENGINE as signal-only: it flags, and conviction stays with Adilet plus a human (s.13). Signals must be reviewable, never auto-punitive.",
  },
  {
    id: "verification_service_absent",
    kind: "SOFTWARE_BLOCKER",
    title: "No driver, vehicle or partner verification service",
    blocks: ["driver_identity_verification", "vehicle_verification", "partner_verification"],
    detail:
      "Scout fingerprinting is intelligence, not identity, and must not quietly become legal verification (s.14/s.26). Today a driver can reach an operational state without any verified document.",
    resolution:
      "Implement VERIFICATION_SERVICE with explicit states: UNVERIFIED, PENDING, VERIFIED, REJECTED, failing closed on UNKNOWN. The service can record and gate on verification; confirming that a document is genuine needs an external source — see identity_verification_provider_absent.",
  },
  {
    id: "backup_and_restore_not_implemented",
    kind: "SOFTWARE_BLOCKER",
    title: "No scripted backup or restore path",
    blocks: ["backup_and_disaster_recovery", "backup_restore_drill_performed"],
    detail:
      "There is no backup script, no documented restore procedure and no evidence a restore has ever been attempted. This is genuinely missing code and tooling, distinct from the vacant reliability post above.",
    resolution:
      "Script the backup, script the restore into a scratch environment, then have the reliability owner run the drill once and record the elapsed time. The drill gate needs both: the tooling and the human who ran it.",
  },
  {
    id: "rollback_procedure_unwritten",
    kind: "SOFTWARE_BLOCKER",
    title: "No deployment or rollback procedure",
    blocks: ["deployment_and_rollback_policy", "rollback_procedure_written_and_rehearsed"],
    detail:
      "CI now verifies every push and pull request — install, typecheck, lint, tests, build, governance validators, failing closed — but it deliberately does not deploy. There is no written way to put a release out or to take it back.",
    resolution:
      "Write the deployment and rollback procedure, rehearse the rollback once, and only then wire deployment. Deployment must stay a deliberate, reversible act with a named owner.",
  },
  {
    id: "role_grants_not_enforced_at_runtime",
    kind: "SOFTWARE_BLOCKER",
    title: "Post rights exist as specifications, not as enforced grants",
    blocks: ["information_security"],
    detail:
      "The rights and denied-rights above are prose in this file. Role gates exist per module (akzhol, zholaman, artur, sapargul, tyyin) and fail closed, but there is no central access model that could enforce, or audit, a post's grant as a whole.",
    resolution:
      "Once posts are actually filled, implement a central role-grant model so that 'this post may not initiate a payout' is enforced rather than asserted. Until then the per-module fail-closed gates are the real boundary.",
  },

  // ---- External providers ------------------------------------------------
  {
    id: "payment_provider_absent",
    kind: "EXTERNAL_PROVIDER_BLOCKER",
    title: "No real payment or banking provider",
    blocks: ["passenger_payment_intake", "real_provider_credentials_reviewed_and_scoped"],
    detail:
      "RT is sandbox-only by design: no real banking, no real payment, no refund, no payout (s.10/s.32). Accepting passenger money for real requires a provider relationship RT does not have.",
    resolution:
      "Founder selects a provider and completes its onboarding as a legal entity. Credentials are then scoped to intake only — no outgoing-money capability — and reviewed before the gate is attested. This depends on legal_entity_unconfirmed.",
  },
  {
    id: "messaging_provider_not_production_scoped",
    kind: "EXTERNAL_PROVIDER_BLOCKER",
    title: "No production-scoped messaging provider credentials",
    blocks: ["public_customer_communication", "real_provider_credentials_reviewed_and_scoped"],
    detail:
      "The send boundary itself is implemented and fails closed — SideEffectGateway plus MIRA_OUTBOUND_MODE keep WhatsApp and Telegram in scenario/test mode, and nothing fabricates a SENT status. What is missing is the outside half: reaching a real customer needs approved business accounts, template approval and rate limits RT does not hold. So the capability is owned and working; it simply cannot yet reach anyone real.",
    resolution:
      "Obtain business messaging accounts under the confirmed legal entity, scope the credentials, review them, then enable outbound as an explicit Founder act. The gateway's fail-closed behaviour must survive that change unchanged.",
  },
  {
    id: "identity_verification_provider_absent",
    kind: "EXTERNAL_PROVIDER_BLOCKER",
    title: "No source of truth for driver and vehicle documents",
    blocks: ["driver_identity_verification", "vehicle_verification"],
    detail:
      "RT can store and gate on a verification state, but confirming that a licence or registration is genuine requires a registry or a KYC provider. Without one, VERIFICATION_SERVICE can only record a human's manual check.",
    resolution:
      "Either integrate a provider or registry, or define manual verification with a named human checker and a recorded evidence trail. Manual is acceptable for a controlled pre-LIVE; silently assuming verified is not.",
  },

  // ---- Founder decisions -------------------------------------------------
  {
    id: "founder_approves_pricing_policy",
    kind: "FOUNDER_DECISION_BLOCKER",
    title: "Pricing policy is not approved",
    blocks: ["fare_and_tariff_authority", "founder_approved_pricing_policy"],
    detail:
      "No engineering choice can determine what RT charges. RT never invents a price (s.15), so absent a policy every quote is UNKNOWN / REQUIRES_QUOTE.",
    resolution:
      "Founder states the pricing rules — per corridor, per seat, per cargo class, plus commission — after which TARIFF_ENGINE is straightforward deterministic work.",
  },
  {
    id: "founder_names_passenger_cashier",
    kind: "FOUNDER_DECISION_BLOCKER",
    title: "Passenger cashier identity is not approved",
    blocks: ["passenger_payment_intake", "founder_approved_passenger_cashier_identity"],
    detail:
      "The node is deliberately called PASSENGER_CASHIER with DISPLAY_NAME_PENDING_FOUNDER_DECISION. No personal name has been invented for it, per s.10.",
    resolution:
      "Founder approves the identity and, if one is wanted, the display name. The module can be built before this lands; it must not be named without it.",
  },
  {
    id: "legal_entity_unconfirmed",
    kind: "FOUNDER_DECISION_BLOCKER",
    title: "Legal entity and regulatory position are not confirmed",
    blocks: ["legal_and_regulatory_compliance", "legal_entity_and_regulatory_position_confirmed"],
    detail:
      "Which entity operates RT, in which jurisdiction, under what licence for passenger and cargo transport. Every provider relationship — payment, messaging — depends on this being settled first.",
    resolution:
      "Founder confirms the entity and licensing position, with HUMAN_LEGAL_COMPLIANCE advising. This is the upstream blocker for both external-provider items above.",
  },
];

/** Blockers of one kind, in declaration order. */
export function blockersOfKind(kind: BlockerKind): PreLiveBlocker[] {
  return RT_PRE_LIVE_BLOCKERS.filter((b) => b.kind === kind);
}

/** Everything holding a given capability or manual gate shut. */
export function blockersFor(subject: string): PreLiveBlocker[] {
  return RT_PRE_LIVE_BLOCKERS.filter((b) => b.blocks.includes(subject));
}

/** The vacant posts, as specifications. Never people. */
export function vacantPosts(): PostSpecification[] {
  return RT_PRE_LIVE_BLOCKERS.flatMap((b) => (b.post ? [b.post] : []));
}

const CAPABILITY_IDS = new Set(RT_ACCOUNTABILITY_MATRIX.map((c) => c.capability));
const GATE_IDS = new Set<string>(MANUAL_PRE_LIVE_GATES);

export type BlockerSubjectKind = "CAPABILITY" | "MANUAL_GATE" | "UNKNOWN";

/** UNKNOWN is returned rather than guessed, so a typo in `blocks` surfaces as a
 * validation failure instead of quietly meaning nothing. */
export function classifySubject(subject: string): BlockerSubjectKind {
  if (CAPABILITY_IDS.has(subject)) return "CAPABILITY";
  if (GATE_IDS.has(subject)) return "MANUAL_GATE";
  return "UNKNOWN";
}

export { getOrgNode };
