# RT Pre-LIVE Blockers

<!-- GENERATED FILE - do not edit by hand. Run `npm run docs:governance` after changing src/lib/governance. -->

RT_PRE_LIVE_READINESS.md says RT is not ready. This file says **what kind of thing is missing**, because the four kinds are resolved by completely different people, and confusing them is how a project lies to itself about its own progress.

| Kind | Count | Closed by |
| --- | --- | --- |
| SOFTWARE_BLOCKER | 7 | engineering |
| HUMAN_STAFFING_BLOCKER | 8 | appointing a person to a vacant post |
| EXTERNAL_PROVIDER_BLOCKER | 3 | a third party RT does not control |
| FOUNDER_DECISION_BLOCKER | 3 | the Founder, and only the Founder |

> **A vacant post is not missing code.** If "nobody is accountable for fraud" were filed as a software gap, someone would eventually close it by writing a module, and RT would go live with an unaccountable one. So the human blockers below carry a post specification instead of a ticket.

Blocked pre-LIVE capabilities: **13** · Manual gates still UNKNOWN: **10** · Classified blockers: **21**

Completeness is enforced: `blockers.test.ts` fails if any blocked capability or unattested gate has no entry here, and fails if a purely human vacancy is ever also filed as software.

## Human staffing blockers — vacant posts

These are **not** missing code, and writing code will not close them. Each is a post that nobody holds. Each is specified below — mandate, rights, what the post must never be given, onboarding, credentials, who may appoint — and each specification deliberately describes a seat rather than a person. No individual is named or invented here; appointing someone happens outside this repository.

### No human accountant for financial exceptions

`accountant_post_vacant`

**Situation.** Tyyin escalates anything it cannot reconcile, and the escalation currently terminates at a PLANNED node. An unreconciled payment therefore has no resolver: it waits.

**Clears when.** Founder appoints a person to HUMAN_ACCOUNTANT and completes the onboarding below.

**Holds shut.** `financial_exception_resolution` *(pre-LIVE)*

**Post:** `HUMAN_ACCOUNTANT` — Human accountant *(vacant)*

**Mandate.** Resolves financial exceptions Tyyin cannot reconcile automatically, and answers for the correctness of that resolution.

**Appointed by:** FOUNDER

*Rights — least privilege*

- Read the full treasury ledger, both departments, including amounts.
- Read bank statements provided by the Founder for reconciliation.
- Record a reconciliation decision with a written reason, as an append-only ledger entry.
- Escalate to the Founder, and refuse to reconcile on insufficient evidence.

*Must never be granted — segregation of duties, as prohibitions*

- Initiating an outgoing payment, payout or refund. RT has no outgoing-money ability at all (s.10) and this post must not become the exception.
- Editing or deleting a historical ledger entry. Corrections are new entries.
- Holding bank credentials. Reconciliation reads statements; it does not operate the account.
- Changing fares, tariffs or commission rates.

*The same individual must not also hold*

- PASSENGER_CASHIER and SAPARGUL — whoever accepts money must not be the one who certifies that it arrived.
- HUMAN_SECURITY_OWNER — the holder of credentials must not also be the auditor of their use.

*Onboarding checklist — complete before the post counts as filled*

- Read docs/FINANCIAL_BOUNDARIES.md and confirm in writing that RT cannot send money and must not be made able to.
- Walk one real reconciliation on sandbox data end to end, including one deliberate refusal.
- Sign off on the escalation path: Tyyin → this post → Founder.
- Confirm the four-eyes rule: any single reconciliation above a Founder-set threshold requires Founder counter-approval.

*Credentials*

- Named individual account with the accountant role. Never a shared login.
- Read access to treasury data; no write path except append-only reconciliation entries.
- No bank credentials, no provider API keys, no production database access.
- Access is granted on appointment and revoked the same day the post is vacated.

### No named human responder for serious safety incidents

`safety_responder_post_vacant`

**Situation.** s.12 forbids an agent handling a physical-world emergency alone, and RT honours that by refusing to act — but refusal without a responder means a real incident reaches nobody.

**Clears when.** Founder names a reachable person, with a phone number and defined hours, and attests named_human_responder_for_safety_incidents.

**Holds shut.** `serious_safety_incident_response` *(pre-LIVE)*

**Gates held UNKNOWN.** `named_human_responder_for_safety_incidents`

**Post:** `HUMAN_SAFETY_RESPONDER` — Serious-incident responder (human) *(vacant)*

**Mandate.** Answers, within a stated response time, when a trip involves injury, violence, an accident or a missing person.

**Appointed by:** FOUNDER

*Rights — least privilege*

- Read full trip, driver, vehicle and passenger contact details for the specific incident.
- Contact the people involved directly, outside RT's automated messaging.
- Order an immediate suspension of a driver or vehicle as a precaution, pending Adilet's decision.
- Contact emergency services and act before RT's internal process concludes.

*Must never be granted — segregation of duties, as prohibitions*

- Issuing a disciplinary sanction. Precautionary suspension is not a verdict; conviction stays with Adilet plus the Founder (s.12).
- Bulk export of passenger or driver personal data. Access is per-incident.
- Any financial action, including compensation promises.

*The same individual must not also hold*

- ADILET's human approver role for the same incident — the person who suspended cannot also adjudicate it.

*Onboarding checklist — complete before the post counts as filled*

- Publish the reachable channel and the response-time commitment; RT records both.
- Walk the escalation script once on a scenario incident, including contacting emergency services.
- Confirm the precaution/sanction boundary in writing.
- Confirm the data-minimisation rule: per-incident access, no browsing.

*Credentials*

- Named individual account with the safety-responder role.
- Per-incident access to contact data, logged on every read.
- Suspension right scoped to precautionary status only.
- No financial, no infrastructure, no secret access.
- Revoked the same day the post is vacated, including the suspension right.

*Gates that stay UNKNOWN until this post is filled*

- `named_human_responder_for_safety_incidents` — blocks LIVE while UNKNOWN.

### No human owner of information security and secrets

`security_owner_post_vacant`

**Situation.** Security ownership today is implicit in code review. Nobody holds the secret inventory, nobody owns rotation, and nobody is accountable for a leak.

**Clears when.** Founder appoints a person to HUMAN_SECURITY_OWNER, who produces a secret inventory, and attests named_human_owner_for_security_and_secrets.

**Holds shut.** `information_security` *(pre-LIVE)*

**Gates held UNKNOWN.** `named_human_owner_for_security_and_secrets`

**Post:** `HUMAN_SECURITY_OWNER` — Information security owner (human) *(vacant)*

**Mandate.** Owns the secret inventory, access grants and the response to a suspected compromise.

**Appointed by:** FOUNDER

*Rights — least privilege*

- Maintain the authoritative inventory of every secret, where it lives and what it can do.
- Grant and revoke access, and revoke unilaterally without prior approval when compromise is suspected.
- Require rotation, and block a release that would ship a secret or weaken a security control.
- Audit who accessed what, including the Founder's access.

*Must never be granted — segregation of duties, as prohibitions*

- Reading passenger or driver personal data as a matter of course; secret custody is not data access.
- Approving their own access grants — the Founder counter-signs grants to this post.
- Financial authority of any kind.
- Silently weakening a fail-closed control to unblock a release. UNKNOWN must stay closed (s.16/s.29).

*The same individual must not also hold*

- HUMAN_ACCOUNTANT — custody of credentials and audit of their financial use must be separate people.
- HUMAN_PRIVACY_OWNER — separable in principle; if one person holds both, the Founder must record that concentration as an accepted risk.

*Onboarding checklist — complete before the post counts as filled*

- Produce the secret inventory: every key, its scope, its blast radius, its rotation owner.
- Confirm no production secret is present in the repository or in CI beyond what CI needs.
- Define the compromise procedure: revoke first, investigate second.
- Confirm that no security control may be disabled to make a test or a build pass.

*Credentials*

- Named individual account with administrative rights over the secret store only.
- Two-factor authentication mandatory; no shared credential under any circumstances.
- Break-glass credentials sealed, their use alerting the Founder automatically.
- Full revocation on the day the post is vacated, including break-glass.

*Gates that stay UNKNOWN until this post is filled*

- `named_human_owner_for_security_and_secrets` — blocks LIVE while UNKNOWN.

### No human owner of privacy, retention and deletion

`privacy_owner_post_vacant`

**Situation.** RT stores passenger and driver personal data with no retention period, no deletion process and no owner for a deletion request (s.17).

**Clears when.** Founder appoints a person to HUMAN_PRIVACY_OWNER, who sets retention periods per data category, and attests named_human_owner_for_privacy_and_retention.

**Holds shut.** `privacy_and_data_governance` *(pre-LIVE)*

**Gates held UNKNOWN.** `named_human_owner_for_privacy_and_retention`

**Post:** `HUMAN_PRIVACY_OWNER` — Privacy / data governance owner (human) *(vacant)*

**Mandate.** Decides what personal data RT keeps, for how long, and answers for deletion, legal hold and data-subject requests.

**Appointed by:** FOUNDER

*Rights — least privilege*

- Set and change the retention period for each category of personal data.
- Order deletion or anonymisation, and place a legal hold that overrides scheduled deletion.
- Receive and answer data-subject requests, and require engineering to make the answer possible.
- Block a feature that collects personal data with no stated purpose.

*Must never be granted — segregation of duties, as prohibitions*

- Executing a destructive deletion directly against production. Deletion is ordered here and executed through a reviewed, audited path (s.31).
- Deleting financial or dispute records still inside their mandatory retention period.
- Holding infrastructure credentials.

*The same individual must not also hold*

- HUMAN_SECURITY_OWNER — see the note there; combining them concentrates custody and oversight.

*Onboarding checklist — complete before the post counts as filled*

- Inventory every personal-data field RT stores and state a purpose for each.
- Set a retention period per category; anything without one is a defect, not a default of forever.
- Define the deletion request path and its response time.
- Confirm the legal-hold procedure with HUMAN_LEGAL_COMPLIANCE.

*Credentials*

- Named individual account with the privacy-owner role.
- Read access scoped to data inventory and audit metadata, not to bulk personal data.
- No direct database write access; deletion orders travel through a reviewed path.
- Revoked on vacating the post.

*Gates that stay UNKNOWN until this post is filled*

- `named_human_owner_for_privacy_and_retention` — blocks LIVE while UNKNOWN.

### No human legal and compliance officer

`legal_compliance_post_vacant`

**Situation.** s.18 forbids an autonomous AI lawyer, and RT has correctly not built one — which leaves the responsibility unheld rather than solved.

**Clears when.** Founder appoints a person (employee or retained counsel) to HUMAN_LEGAL_COMPLIANCE. This is a prerequisite for the legal-entity gate, not a substitute for it.

**Holds shut.** `legal_and_regulatory_compliance` *(pre-LIVE)*

**Post:** `HUMAN_LEGAL_COMPLIANCE` — Legal & compliance officer (human) *(vacant)*

**Mandate.** Answers for whether RT's operations, contracts and customer terms are lawful in the jurisdictions it serves.

**Appointed by:** FOUNDER

*Rights — least privilege*

- Read contracts, terms, driver and partner agreements, and the dispute record.
- Require a change to terms, or to a product flow, on legal grounds.
- Block a launch or a market entry as unlawful, and that block is not overridable by an agent.
- Place a legal hold on data jointly with HUMAN_PRIVACY_OWNER.

*Must never be granted — segregation of duties, as prohibitions*

- Deciding commercial pricing. Legality constrains price; it does not set it.
- Adjudicating an individual customer dispute — that is Adilet plus the Founder.
- Any financial or infrastructure authority.

*The same individual must not also hold*

- ADILET's human approver role — the arbiter of disputes should not also be the author of the terms being disputed.

*Onboarding checklist — complete before the post counts as filled*

- Confirm the legal entity, its jurisdiction and its licensing position for passenger and cargo transport.
- Review the driver, partner and passenger terms as written, and flag what is unenforceable.
- Confirm the regulatory reporting obligations, if any, and who files them.
- Sign off on the pre-LIVE customer-facing text.

*Credentials*

- Named individual account, or a retained-counsel engagement recorded with a name.
- Document and contract access only; no operational system access.
- No personal-data access beyond specific matters.
- Revoked on termination of the engagement.

### No named human on call for platform reliability

`reliability_owner_post_vacant`

**Situation.** s.19: RT must not depend on an AI assistant manually checking a dashboard. SIDE_EFFECT_GATEWAY — the control that stands between RT and real customer sends — reports straight to the Founder today precisely because this post does not exist.

**Clears when.** Founder names an on-call person with a reachable channel and a response-time commitment, and attests named_human_on_call_for_reliability.

**Holds shut.** `platform_reliability_and_incident_response` *(pre-LIVE)*, `backup_and_disaster_recovery` *(pre-LIVE)*, `deployment_and_rollback_policy` *(pre-LIVE)*

**Gates held UNKNOWN.** `named_human_on_call_for_reliability`

**Post:** `HUMAN_RELIABILITY_OWNER` — Platform reliability owner (human on-call) *(vacant)*

**Mandate.** Answers when RT is down, degraded or behaving unsafely, and owns deployment, rollback and restore as procedures rather than as improvisations.

**Appointed by:** FOUNDER

*Rights — least privilege*

- Read production logs, metrics and alerts.
- Roll back a deployment, and disable a feature flag or outbound sending, without prior approval, in an incident.
- Declare an incident and halt releases.
- Run a restore drill against a non-production environment.

*Must never be granted — segregation of duties, as prohibitions*

- Enabling LIVE outbound mode. That is a Founder decision and stays outside the incident toolkit (s.32).
- Destructive production data operations. Restore runs forward into a new environment, never as an in-place wipe (s.31).
- Reading passenger or driver personal data for debugging without a recorded reason.
- Approving their own rollback policy — the Founder signs the policy; this post executes it.

*The same individual must not also hold*

- HUMAN_SECURITY_OWNER — separable in principle, but combining on-call production access with secret custody concentrates the two most dangerous grants; the Founder must record it as an accepted risk if one person holds both.

*Onboarding checklist — complete before the post counts as filled*

- Publish the on-call channel, hours and response-time commitment.
- Write the rollback procedure and rehearse it once — this is what the rollback gate attests.
- Perform one restore from backup into a scratch environment and record the elapsed time — this is what the backup gate attests.
- Confirm that enabling real outbound sending is never part of an incident response.

*Credentials*

- Named individual account with deploy and rollback rights, two-factor mandatory.
- Production read access to logs and metrics; personal-data reads logged with a reason.
- No standing production database write access; break-glass only, alerting the Founder.
- No authority over MIRA_OUTBOUND_MODE.
- Deploy, rollback and break-glass access revoked the same day the post is vacated.

*Gates that stay UNKNOWN until this post is filled*

- `named_human_on_call_for_reliability` — blocks LIVE while UNKNOWN.

### Akzhol — passenger-direction manager post is vacant

`passenger_direction_manager_post_vacant`

**Situation.** The management information now exists (src/lib/akzhol/*, read-only, role-gated), but nobody holds the akzhol role. The measurement is not the manager: until the post is filled, the report has no reader who answers for what it shows. Not pre-LIVE blocking — RT can serve customers without a performance manager, it just cannot claim the direction is managed.

**Clears when.** Founder appoints a person to AKZHOL and grants the akzhol role. No code change is required to start: the report is already there and already gated.

**Holds shut.** `passenger_operations_performance_management`

**Post:** `AKZHOL` — Akzhol — Passenger Operations Manager *(vacant)*

**Mandate.** Answers for passenger-direction PERFORMANCE — conversion, decline reasons, handling time, completion, supply gaps — never for an individual booking.

**Appointed by:** FOUNDER

*Rights — least privilege*

- Read the aggregated passenger-direction report: leads, demand, directions, bookings, declines with reasons, handling time, execution, service quality.
- Read the operational anomalies the report raises, and require an explanation for each.
- Propose changes to corridors, supply targets and outreach priorities.
- Escalate a systemic problem to Artur and, for policy, to the Founder.

*Must never be granted — segregation of duties, as prohibitions*

- Write access of any kind to operational data. The module contains no Prisma write call and a boundary test keeps it that way.
- Overriding a Match decision, a Trust gate or an Adilet sanction.
- Any money read or action — no amounts, no fares, no ledger (the report queries no money model at all).
- Acting as an orchestrator, a cashier or a transaction owner, or replacing Mira, RT Office or the CRM.

*The same individual must not also hold*

- PASSENGER_CASHIER and HUMAN_ACCOUNTANT — the person judged on conversion must not also handle the money it produces.

*Onboarding checklist — complete before the post counts as filled*

- Read the report definitions, including why a rate is n/a rather than 0% when there is no denominator.
- Read the missingDataNotes and understand which gaps are known and unresolved.
- Confirm the boundary in writing: analysis and management, never execution, never write access.
- Agree the reporting cadence with Artur.

*Credentials*

- Named individual account with the akzhol role only.
- Read-only by construction; no elevated path exists to grant.
- No money access, no dispatcher access, no secret access.
- Revoked on vacating the post.

### Zholaman — cargo/delivery-direction manager post is vacant

`cargo_direction_manager_post_vacant`

**Situation.** Same shape as AKZHOL: src/lib/zholaman/* reports orders, execution, partners, incidents, quality and week-over-week dynamics read-only, and the accountable post is empty. Additionally there is no customer-review model in the schema at all, so satisfaction is reported as missing rather than scored.

**Clears when.** Founder appoints a person to ZHOLAMAN and grants the zholaman role.

**Holds shut.** `delivery_cargo_performance_management`

**Post:** `ZHOLAMAN` — Zholaman — Delivery & Cargo Manager *(vacant)*

**Mandate.** Answers for cargo and delivery PERFORMANCE — order flow, execution quality, lateness, partner mix, incidents, commercial dynamics — never for an individual shipment.

**Appointed by:** FOUNDER

*Rights — least privilege*

- Read the aggregated cargo-direction report: orders, execution and lateness, partners and tiers, incidents by severity, quality signals, week-over-week change.
- See payment status only as the coarse PAID / PENDING / PROBLEM collapse (s.21).
- Require an explanation for each anomaly, including executor concentration and unverified executors.
- Escalate systemic quality problems to Artur, incidents to Adilet, and policy to the Founder.

*Must never be granted — segregation of duties, as prohibitions*

- Write access of any kind, including partner records — Network owns that CRUD.
- Any payment amount, invoice total or revenue figure. Amounts belong to Tyyin and Sapargul.
- Approving a partner as verified. Verification is a separate gate (s.26) that does not exist yet.
- Assigning an executor to a shipment, or acting as a cashier or transaction owner.

*The same individual must not also hold*

- SAPARGUL's cargo-cashier function and HUMAN_ACCOUNTANT — performance judgement stays separate from money handling.

*Onboarding checklist — complete before the post counts as filled*

- Read the report definitions, including the payment-status collapse and why no amount is shown.
- Read the missingDataNotes: no review model, unassigned orders, unverified executors.
- Confirm the boundary in writing: read and manage, never execute, never write.
- Agree the reporting cadence with Artur.

*Credentials*

- Named individual account with the zholaman role only.
- Read-only by construction.
- No amount-level financial access, no secret access.
- Revoked on vacating the post.

## Software blockers

RT can close these itself. No permission, no appointment, no third party — just work not yet done.

### No passenger cashier module is wired

`passenger_cashier_not_wired`

**Situation.** TreasuryDepartment.PASSENGER exists and mira/passenger-finance.ts records an intent with financialProcessor: null. The idempotency substrate for those intents is now in place (PassengerFinancialIntent, unique idempotency key, replay-safe), but no cashier consumes them.

**Clears when.** Build the passenger cashier against the existing intent table: sandbox only, no outgoing-money path, mirroring Sapargul's boundaries for the passenger contour. Its display name stays pending — see founder_names_passenger_cashier.

**Holds shut.** `passenger_payment_intake` *(pre-LIVE)*

### No deterministic tariff engine with price provenance

`tariff_engine_absent`

**Situation.** Fare concepts are scattered and no single component stamps where a price came from. RT correctly answers UNKNOWN / REQUIRES_QUOTE rather than inventing a number (s.15), which is safe but means RT cannot quote at all.

**Clears when.** Implement TARIFF_ENGINE: deterministic, no reasoning, every returned price carrying its provenance, and UNKNOWN where no rule applies. It can only be built once the pricing policy exists — see founder_approves_pricing_policy.

**Holds shut.** `fare_and_tariff_authority` *(pre-LIVE)*

### No fraud or risk signal detection

`risk_engine_absent`

**Situation.** Nothing detects a fake driver, a collusive booking pattern or a payment-claim anomaly. Quality flags operational anomalies, which is a different question.

**Clears when.** Implement RISK_ENGINE as signal-only: it flags, and conviction stays with Adilet plus a human (s.13). Signals must be reviewable, never auto-punitive.

**Holds shut.** `fraud_risk_signal_detection` *(pre-LIVE)*

### No driver, vehicle or partner verification service

`verification_service_absent`

**Situation.** Scout fingerprinting is intelligence, not identity, and must not quietly become legal verification (s.14/s.26). Today a driver can reach an operational state without any verified document.

**Clears when.** Implement VERIFICATION_SERVICE with explicit states: UNVERIFIED, PENDING, VERIFIED, REJECTED, failing closed on UNKNOWN. The service can record and gate on verification; confirming that a document is genuine needs an external source — see identity_verification_provider_absent.

**Holds shut.** `driver_identity_verification` *(pre-LIVE)*, `vehicle_verification` *(pre-LIVE)*, `partner_verification`

### No scripted backup or restore path

`backup_and_restore_not_implemented`

**Situation.** There is no backup script, no documented restore procedure and no evidence a restore has ever been attempted. This is genuinely missing code and tooling, distinct from the vacant reliability post above.

**Clears when.** Script the backup, script the restore into a scratch environment, then have the reliability owner run the drill once and record the elapsed time. The drill gate needs both: the tooling and the human who ran it.

**Holds shut.** `backup_and_disaster_recovery` *(pre-LIVE)*

**Gates held UNKNOWN.** `backup_restore_drill_performed`

### No deployment or rollback procedure

`rollback_procedure_unwritten`

**Situation.** CI now verifies every push and pull request — install, typecheck, lint, tests, build, governance validators, failing closed — but it deliberately does not deploy. There is no written way to put a release out or to take it back.

**Clears when.** Write the deployment and rollback procedure, rehearse the rollback once, and only then wire deployment. Deployment must stay a deliberate, reversible act with a named owner.

**Holds shut.** `deployment_and_rollback_policy` *(pre-LIVE)*

**Gates held UNKNOWN.** `rollback_procedure_written_and_rehearsed`

### Post rights exist as specifications, not as enforced grants

`role_grants_not_enforced_at_runtime`

**Situation.** The rights and denied-rights above are prose in this file. Role gates exist per module (akzhol, zholaman, artur, sapargul, tyyin) and fail closed, but there is no central access model that could enforce, or audit, a post's grant as a whole.

**Clears when.** Once posts are actually filled, implement a central role-grant model so that 'this post may not initiate a payout' is enforced rather than asserted. Until then the per-module fail-closed gates are the real boundary.

**Holds shut.** `information_security` *(pre-LIVE)*

## External provider blockers

These depend on a third party RT does not control: a bank, a messaging platform, a registry. RT can prepare the integration; it cannot grant itself the relationship.

### No real payment or banking provider

`payment_provider_absent`

**Situation.** RT is sandbox-only by design: no real banking, no real payment, no refund, no payout (s.10/s.32). Accepting passenger money for real requires a provider relationship RT does not have.

**Clears when.** Founder selects a provider and completes its onboarding as a legal entity. Credentials are then scoped to intake only — no outgoing-money capability — and reviewed before the gate is attested. This depends on legal_entity_unconfirmed.

**Holds shut.** `passenger_payment_intake` *(pre-LIVE)*

**Gates held UNKNOWN.** `real_provider_credentials_reviewed_and_scoped`

### No production-scoped messaging provider credentials

`messaging_provider_not_production_scoped`

**Situation.** The send boundary itself is implemented and fails closed — SideEffectGateway plus MIRA_OUTBOUND_MODE keep WhatsApp and Telegram in scenario/test mode, and nothing fabricates a SENT status. What is missing is the outside half: reaching a real customer needs approved business accounts, template approval and rate limits RT does not hold. So the capability is owned and working; it simply cannot yet reach anyone real.

**Clears when.** Obtain business messaging accounts under the confirmed legal entity, scope the credentials, review them, then enable outbound as an explicit Founder act. The gateway's fail-closed behaviour must survive that change unchanged.

**Holds shut.** `public_customer_communication` *(pre-LIVE)*

**Gates held UNKNOWN.** `real_provider_credentials_reviewed_and_scoped`

### No source of truth for driver and vehicle documents

`identity_verification_provider_absent`

**Situation.** RT can store and gate on a verification state, but confirming that a licence or registration is genuine requires a registry or a KYC provider. Without one, VERIFICATION_SERVICE can only record a human's manual check.

**Clears when.** Either integrate a provider or registry, or define manual verification with a named human checker and a recorded evidence trail. Manual is acceptable for a controlled pre-LIVE; silently assuming verified is not.

**Holds shut.** `driver_identity_verification` *(pre-LIVE)*, `vehicle_verification` *(pre-LIVE)*

## Founder decision blockers

Money, law and identity. Each is paired with the engineering work it gates, so that a pending decision never becomes a reason to stop building — the buildable half is listed as a software blocker.

### Pricing policy is not approved

`founder_approves_pricing_policy`

**Situation.** No engineering choice can determine what RT charges. RT never invents a price (s.15), so absent a policy every quote is UNKNOWN / REQUIRES_QUOTE.

**Clears when.** Founder states the pricing rules — per corridor, per seat, per cargo class, plus commission — after which TARIFF_ENGINE is straightforward deterministic work.

**Holds shut.** `fare_and_tariff_authority` *(pre-LIVE)*

**Gates held UNKNOWN.** `founder_approved_pricing_policy`

### Passenger cashier identity is not approved

`founder_names_passenger_cashier`

**Situation.** The node is deliberately called PASSENGER_CASHIER with DISPLAY_NAME_PENDING_FOUNDER_DECISION. No personal name has been invented for it, per s.10.

**Clears when.** Founder approves the identity and, if one is wanted, the display name. The module can be built before this lands; it must not be named without it.

**Holds shut.** `passenger_payment_intake` *(pre-LIVE)*

**Gates held UNKNOWN.** `founder_approved_passenger_cashier_identity`

### Legal entity and regulatory position are not confirmed

`legal_entity_unconfirmed`

**Situation.** Which entity operates RT, in which jurisdiction, under what licence for passenger and cargo transport. Every provider relationship — payment, messaging — depends on this being settled first.

**Clears when.** Founder confirms the entity and licensing position, with HUMAN_LEGAL_COMPLIANCE advising. This is the upstream blocker for both external-provider items above.

**Holds shut.** `legal_and_regulatory_compliance` *(pre-LIVE)*

**Gates held UNKNOWN.** `legal_entity_and_regulatory_position_confirmed`

## What this document is not

It is not a plan with dates, and it is not progress. A complete, tidy blocker list reads like readiness and is not readiness: every item below is still open. The verdict lives in RT_PRE_LIVE_READINESS.md and it is **NOT_READY**.

