# RT Accountability Matrix

<!-- GENERATED FILE - do not edit by hand. Run `npm run docs:governance` after changing src/lib/governance. -->

One responsibility has exactly one accountable owner. Not zero, not two. Others may execute, review or advise, but one node answers for the result.

**Reading this table**

- **Accountable owner** — who answers for the outcome. Exactly one.
- **Executor** — what actually runs the work. May be the owner.
- **Reviewer** — checks the work. A reviewer is *not* an approver.
- **Human approver** — required where a machine must never decide alone. Must be a person; an agent can never fill this slot.
- **Escalates to** — where this goes when it cannot be resolved. Must be a node that exists today.
- **Pre-LIVE** — must have a real, implemented owner before RT may serve real customers.
- **Code capabilities** — the `ownsExclusiveCapabilities` entries in `AGENT_REGISTRY` this responsibility covers. The two vocabularies differ by design and at different granularities, so the link is written down and checked in both directions; an unmapped code capability fails the build.
- *(planned)* — the node is named but does not exist in code. Naming an owner does not make a responsibility solved; see RT_PRE_LIVE_READINESS.md.

Capabilities: **51** · Pre-LIVE required: **33** · Structural violations: **0**

## ACQUISITION

| Capability | Type | Accountable owner | Executor | Reviewer | Human approver | System of record | Escalates to | Pre-LIVE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `driver_acquisition_outreach` | EXECUTION | DRIVER_CONTRACTOR | DRIVER_CONTRACTOR | — | — | AcquisitionOutreachEvent | ARTUR → AKZHOL *(planned)* | no |
| `passenger_acquisition_outreach` | EXECUTION | PASSENGER_CONTRACTOR | PASSENGER_CONTRACTOR | — | — | AcquisitionOutreachEvent | ARTUR → AKZHOL *(planned)* | no |
| `business_customer_acquisition` | EXECUTION | DELIVERY_CONTRACTOR | DELIVERY_CONTRACTOR | — | — | AcquisitionOutreachEvent / DeliveryCrmEvent | ARTUR → ZHOLAMAN *(planned)* | no |
| `delivery_executor_acquisition` | EXECUTION | DELIVERY_EXECUTOR_CONTRACTOR | DELIVERY_EXECUTOR_CONTRACTOR | — | — | AcquisitionOutreachEvent | ARTUR → ZHOLAMAN *(planned)* | no |
| `cargo_carrier_acquisition` | EXECUTION | CARGO_CARRIER_CONTRACTOR | CARGO_CARRIER_CONTRACTOR | — | — | AcquisitionOutreachEvent | ARTUR → ZHOLAMAN *(planned)* | no |

<details><summary>Failure modes</summary>

- `driver_acquisition_outreach` — Outreach reported FAILED honestly; never a fabricated SENT.
- `passenger_acquisition_outreach` — Outreach reported FAILED honestly; never a fabricated SENT.
- `business_customer_acquisition` — Outreach reported FAILED honestly; never a fabricated SENT.
- `delivery_executor_acquisition` — Outreach reported FAILED honestly; never a fabricated SENT.
- `cargo_carrier_acquisition` — Outreach reported FAILED honestly; never a fabricated SENT.

</details>

<details><summary>Code capabilities (AGENT_REGISTRY)</summary>

- `driver_acquisition_outreach` ← `driver_acquisition_outreach`
- `passenger_acquisition_outreach` ← `passenger_prospect_write`
- `business_customer_acquisition` ← `business_prospect_write`, `delivery_crm_event_write`
- `delivery_executor_acquisition` ← `delivery_executor_prospect_write`
- `cargo_carrier_acquisition` ← `cargo_carrier_prospect_write`

</details>

## ANALYTICS

| Capability | Type | Accountable owner | Executor | Reviewer | Human approver | System of record | Escalates to | Pre-LIVE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `market_gap_computation` | DECISION | RT_OFFICE | RT_OFFICE | — | — | computeMarketGap() | ARTUR → AKZHOL *(planned)* | no |
| `read_only_business_analytics` | OBSERVATION | ANALYTICS | ANALYTICS | — | — | Aggregations over RT Core | ARTUR | no |

<details><summary>Failure modes</summary>

- `market_gap_computation` — Acquisition prioritization degrades to no-signal; never invents demand.
- `read_only_business_analytics` — Analytics failure must never break booking (s.20).

</details>

## COMMUNICATION

| Capability | Type | Accountable owner | Executor | Reviewer | Human approver | System of record | Escalates to | Pre-LIVE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `public_customer_communication` | EXECUTION | MIRA | MIRA | — | — | Conversation / Message | ARTUR → AKZHOL *(planned)* | yes |
| `inbound_message_routing` | DECISION | COMMAND | COMMAND | — | — | Conversation / InboundMessage | ARTUR → AKZHOL *(planned)* | yes |
| `outbound_send_boundary` | CONTROL_GATE | SIDE_EFFECT_GATEWAY | SIDE_EFFECT_GATEWAY | — | — | SuppressedSend log / NotificationDelivery | FOUNDER → HUMAN_RELIABILITY_OWNER *(planned)* | yes |

<details><summary>Failure modes</summary>

- `public_customer_communication` — No reply sent; never a fabricated SENT status (SideEffectGateway enforces).
- `inbound_message_routing` — Unroutable message surfaces to the human dispatcher; never silently dropped.
- `outbound_send_boundary` — Fails closed: send is suppressed and reported as failed, never as delivered.

</details>

<details><summary>Code capabilities (AGENT_REGISTRY)</summary>

- `public_customer_communication` ← `external_customer_communication`

</details>

## DELIVERY OPS

| Capability | Type | Accountable owner | Executor | Reviewer | Human approver | System of record | Escalates to | Pre-LIVE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cargo_shipment_execution` | EXECUTION | SAPAR | SAPAR | — | — | Shipment | ARTUR → ZHOLAMAN *(planned)* | no |
| `assign_cargo_delivery_executor` | DECISION | SAPAR | SAPAR | — | — | Shipment | ARTUR → ZHOLAMAN *(planned)* | no |
| `passenger_corridor_parcel_lifecycle` | SYSTEM_OF_RECORD | PARCEL | PARCEL | — | — | Parcel | ARTUR → ZHOLAMAN *(planned)* | no |

<details><summary>Failure modes</summary>

- `cargo_shipment_execution` — Shipment stays in its prior state; no silent completion.
- `assign_cargo_delivery_executor` — Unassigned shipment surfaces to dispatcher.
- `passenger_corridor_parcel_lifecycle` — Invalid transition rejected by canTransitionParcel().

</details>

<details><summary>Code capabilities (AGENT_REGISTRY)</summary>

- `cargo_shipment_execution` ← `cargo_operational_status`
- `assign_cargo_delivery_executor` ← `assign_cargo_delivery_executor`

</details>

## DISPUTES

| Capability | Type | Accountable owner | Executor | Reviewer | Human approver | System of record | Escalates to | Pre-LIVE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `dispute_arbitration_decision` | DECISION | ADILET | ADILET | — | — | ArbitrationCase | FOUNDER | yes |
| `disciplinary_sanction` | DECISION | ADILET | ADILET | — | — | ArbitrationCase / Sanction | FOUNDER | yes |

<details><summary>Failure modes</summary>

- `dispute_arbitration_decision` — Case stays open. No manager may overturn a decision (adilet/role.ts).
- `disciplinary_sanction` — No sanction applied without an adjudicated case.

</details>

<details><summary>Code capabilities (AGENT_REGISTRY)</summary>

- `dispute_arbitration_decision` ← `complaint_arbitration_decision`
- `disciplinary_sanction` ← `disciplinary_sanction`

</details>

## DRIVER OPS

| Capability | Type | Accountable owner | Executor | Reviewer | Human approver | System of record | Escalates to | Pre-LIVE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `driver_offer_intake` | EXECUTION | MIRA | DRIVER | — | — | DriverOffer | ARTUR → AKZHOL *(planned)* | yes |
| `drive_crm_event_write` | SYSTEM_OF_RECORD | CRM_AUTO | CRM_AUTO | — | — | DriveCrmEvent (append-only) | ARTUR → AKZHOL *(planned)* | yes |
| `driver_discovery_intelligence` | OBSERVATION | SCOUT | SCOUT | — | — | ScoutCandidate | ARTUR → AKZHOL *(planned)* | no |

<details><summary>Failure modes</summary>

- `driver_offer_intake` — Offer not created; driver told honestly.
- `drive_crm_event_write` — Event not appended; no in-place mutation is ever attempted.
- `driver_discovery_intelligence` — No candidate produced. Confidence is never treated as identity proof.

</details>

<details><summary>Code capabilities (AGENT_REGISTRY)</summary>

- `drive_crm_event_write` ← `drive_crm_event_write`

</details>

## FINANCE

| Capability | Type | Accountable owner | Executor | Reviewer | Human approver | System of record | Escalates to | Pre-LIVE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `commission_calculation` | DECISION | PAY | PAY | QUALITY | — | LedgerEntry | TYYIN | yes |
| `driver_rt_balance_ledger` | SYSTEM_OF_RECORD | PAY | PAY | — | — | LedgerEntry / Driver.rtBalance | TYYIN | yes |
| `cargo_payment_confirmation` | DECISION | SAPARGUL | SAPARGUL | TYYIN | — | ShipmentPayment | TYYIN | no |
| `passenger_payment_intake` | EXECUTION | PASSENGER_CASHIER *(planned)* | PASSENGER_CASHIER | TYYIN | — | PassengerFinancialIntent (AuditLogEntry today) | TYYIN | yes |
| `central_treasury_bank_truth` | SYSTEM_OF_RECORD | TYYIN | TYYIN | HUMAN_ACCOUNTANT | — | TreasuryTransaction | ARTUR | yes |
| `refund_authorization` | DECISION | TYYIN | TYYIN | ADILET | FOUNDER | TreasuryTransaction | FOUNDER | yes |
| `financial_exception_resolution` | DECISION | HUMAN_ACCOUNTANT *(planned)* | HUMAN_ACCOUNTANT | — | HUMAN_ACCOUNTANT *(planned)* | TreasuryTransaction / AuditLogEntry | FOUNDER | yes |

<details><summary>Failure modes</summary>

- `commission_calculation` — Deterministic arithmetic; mismatch is flagged by Quality, never auto-corrected.
- `driver_rt_balance_ledger` — Balance unchanged on failure; no partial write.
- `cargo_payment_confirmation` — Stays PAYMENT_PENDING. Never a fabricated confirmation.
- `passenger_payment_intake` — ORPHAN TODAY: mira/passenger-finance.ts records an intent with financialProcessor:null and nothing consumes it.
- `central_treasury_bank_truth` — No confirmation recorded; waits safely rather than assuming receipt.
- `refund_authorization` — Refund not authorized; request stays open for human decision.
- `financial_exception_resolution` — Exception stays queued; no agent may self-resolve it.

</details>

<details><summary>Code capabilities (AGENT_REGISTRY)</summary>

- `cargo_payment_confirmation` ← `confirm_cargo_payment`
- `central_treasury_bank_truth` ← `central_treasury_transaction_record`, `accountant_case_escalation`

</details>

## GEOGRAPHY

| Capability | Type | Accountable owner | Executor | Reviewer | Human approver | System of record | Escalates to | Pre-LIVE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `real_world_geography_eta_traffic` | DECISION | JOLCHU | JOLCHU | — | — | Jolchu location/route cache | ARTUR → AKZHOL *(planned)* | yes |
| `internal_corridor_topology` | SYSTEM_OF_RECORD | ROUTE | ROUTE | — | — | RouteStop / RouteSegment | ARTUR → AKZHOL *(planned)* | yes |

<details><summary>Failure modes</summary>

- `real_world_geography_eta_traffic` — Returns UNKNOWN. Never fabricates an ETA when a provider is down (s.20).
- `internal_corridor_topology` — No chain built; never substitutes real-world distance for topology.

</details>

## LEGAL

| Capability | Type | Accountable owner | Executor | Reviewer | Human approver | System of record | Escalates to | Pre-LIVE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `legal_and_regulatory_compliance` | DECISION | HUMAN_LEGAL_COMPLIANCE *(planned)* | HUMAN_LEGAL_COMPLIANCE | — | HUMAN_LEGAL_COMPLIANCE *(planned)* | Legal records (outside RT Core) | FOUNDER | yes |

<details><summary>Failure modes</summary>

- `legal_and_regulatory_compliance` — ORPHAN TODAY. RT software may prepare facts but never decides law (s.18).

</details>

## MANAGEMENT

| Capability | Type | Accountable owner | Executor | Reviewer | Human approver | System of record | Escalates to | Pre-LIVE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `passenger_operations_performance_management` | OBSERVATION | AKZHOL *(planned)* | AKZHOL_REPORTING | — | — | Manager report (derived from RT Core) | ARTUR | no |
| `delivery_cargo_performance_management` | OBSERVATION | ZHOLAMAN *(planned)* | ZHOLAMAN_REPORTING | — | — | Manager report (derived from RT Core) | ARTUR | no |
| `executive_reporting` | OBSERVATION | ARTUR | ARTUR | — | — | DailyBrief / WeeklyReport | FOUNDER | no |
| `launch_readiness_decision` | DECISION | FOUNDER | FOUNDER | ARTUR | FOUNDER | RT_PRE_LIVE_READINESS | FOUNDER | yes |

<details><summary>Failure modes</summary>

- `passenger_operations_performance_management` — PARTIAL: the measurement exists (src/lib/akzhol/*, read-only, role-gated), the accountable post does not. Until someone holds the akzhol role, nobody answers for what the report shows — so this stays owned by a PLANNED node on purpose (s.8).
- `delivery_cargo_performance_management` — PARTIAL: src/lib/zholaman/* now reports orders, execution, partners, incidents and quality read-only, on top of the existing s.21 payment filter. The accountable post is still vacant, and no customer-review model exists at all — the report says so rather than scoring satisfaction (s.9).
- `executive_reporting` — Report generation failure must never block operations (s.20).
- `launch_readiness_decision` — Fails closed: unknown readiness is never LIVE_READY (s.29).

</details>

<details><summary>Code capabilities (AGENT_REGISTRY)</summary>

- `executive_reporting` ← `director_daily_brief`, `director_weekly_report`, `director_strategic_initiative_proposal`

</details>

## MATCHING

| Capability | Type | Accountable owner | Executor | Reviewer | Human approver | System of record | Escalates to | Pre-LIVE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `matching_decision` | DECISION | MATCH | MATCH | QUALITY | — | Match | ARTUR → AKZHOL *(planned)* | yes |

<details><summary>Failure modes</summary>

- `matching_decision` — No match proposed; demand stays visible as unmatched. Never a fabricated match.

</details>

## PARTNERS

| Capability | Type | Accountable owner | Executor | Reviewer | Human approver | System of record | Escalates to | Pre-LIVE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `partner_verification` | CONTROL_GATE | VERIFICATION_SERVICE *(planned)* | VERIFICATION_SERVICE | ZHOLAMAN | HUMAN_DISPATCHER | Partner registry | ARTUR → ZHOLAMAN *(planned)* | no |
| `partner_registry_record` | SYSTEM_OF_RECORD | NETWORK | NETWORK | — | — | Partner | ARTUR → ZHOLAMAN *(planned)* | no |

<details><summary>Failure modes</summary>

- `partner_verification` — ORPHAN TODAY: a claimed capability can become registry truth without a verification gate (s.26).
- `partner_registry_record` — Partner not created/updated; CRUD only, no capability inference.

</details>

## PASSENGER OPS

| Capability | Type | Accountable owner | Executor | Reviewer | Human approver | System of record | Escalates to | Pre-LIVE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `passenger_request_intake` | EXECUTION | MIRA | PASSENGER | — | — | TripRequest | ARTUR → AKZHOL *(planned)* | yes |
| `seat_reservation_and_booking_lifecycle` | SYSTEM_OF_RECORD | MATCH | MATCH | — | — | Booking / Match | ARTUR → AKZHOL *(planned)* | yes |
| `passenger_driver_operational_loop` | EXECUTION | RT_OFFICE | RT_OFFICE | — | — | PassengerLoop | ARTUR → AKZHOL *(planned)* | yes |
| `service_recovery` | EXECUTION | SUPPORT | SUPPORT | — | — | SupportCase | ADILET | yes |

<details><summary>Failure modes</summary>

- `passenger_request_intake` — Request not created; customer told honestly, no silent drop.
- `seat_reservation_and_booking_lifecycle` — Transition rejected; prior state preserved (state machine is closed).
- `passenger_driver_operational_loop` — Loop stalls visibly in dispatcher UI rather than silently completing.
- `service_recovery` — Case stays open; Support never adjudicates an Adilet-owned dispute (s.3.B).

</details>

## PRICING

| Capability | Type | Accountable owner | Executor | Reviewer | Human approver | System of record | Escalates to | Pre-LIVE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fare_and_tariff_authority` | DECISION | TARIFF_ENGINE *(planned)* | TARIFF_ENGINE | FOUNDER | FOUNDER | Tariff rules (to be defined) | FOUNDER | yes |

<details><summary>Failure modes</summary>

- `fare_and_tariff_authority` — ORPHAN TODAY: price concepts are scattered with no single provenance-stamping engine. Unknown price must stay UNKNOWN / REQUIRES_QUOTE (s.15).

</details>

## PRIVACY

| Capability | Type | Accountable owner | Executor | Reviewer | Human approver | System of record | Escalates to | Pre-LIVE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `privacy_and_data_governance` | CONTROL_GATE | HUMAN_PRIVACY_OWNER *(planned)* | HUMAN_PRIVACY_OWNER | — | HUMAN_PRIVACY_OWNER *(planned)* | Retention policy (to be defined) | FOUNDER | yes |

<details><summary>Failure modes</summary>

- `privacy_and_data_governance` — ORPHAN TODAY: no retention/deletion policy owner (s.17).

</details>

## RELIABILITY

| Capability | Type | Accountable owner | Executor | Reviewer | Human approver | System of record | Escalates to | Pre-LIVE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `platform_reliability_and_incident_response` | EXECUTION | HUMAN_RELIABILITY_OWNER *(planned)* | HUMAN_RELIABILITY_OWNER | — | — | /api/health + deployment logs | FOUNDER | yes |
| `backup_and_disaster_recovery` | EXECUTION | HUMAN_RELIABILITY_OWNER *(planned)* | HUMAN_RELIABILITY_OWNER | — | HUMAN_RELIABILITY_OWNER *(planned)* | Database provider backups | FOUNDER | yes |
| `deployment_and_rollback_policy` | CONTROL_GATE | HUMAN_RELIABILITY_OWNER *(planned)* | HUMAN_RELIABILITY_OWNER | — | HUMAN_RELIABILITY_OWNER *(planned)* | Vercel deployments | FOUNDER | yes |

<details><summary>Failure modes</summary>

- `platform_reliability_and_incident_response` — ORPHAN TODAY: readiness endpoint exists but no owner, alerting, rollback policy or on-call rota (s.19).
- `backup_and_disaster_recovery` — ORPHAN TODAY: no documented restore drill or RPO/RTO target.
- `deployment_and_rollback_policy` — ORPHAN TODAY: no written rollback/verification procedure.

</details>

## RISK

| Capability | Type | Accountable owner | Executor | Reviewer | Human approver | System of record | Escalates to | Pre-LIVE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `anomaly_detection` | OBSERVATION | QUALITY | QUALITY | — | — | QualityAnomaly | ARTUR | no |
| `fraud_risk_signal_detection` | OBSERVATION | RISK_ENGINE *(planned)* | RISK_ENGINE | ADILET | — | Risk signals (to be defined) | ADILET | yes |

<details><summary>Failure modes</summary>

- `anomaly_detection` — Audit yields no anomalies; never issues a sanction itself.
- `fraud_risk_signal_detection` — ORPHAN TODAY: fraud signals are fragmented across Sapargul/Quality/Trust/Scout with no owner. A signal must never equal a fraud conviction (s.13).

</details>

## SECURITY

| Capability | Type | Accountable owner | Executor | Reviewer | Human approver | System of record | Escalates to | Pre-LIVE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `information_security` | CONTROL_GATE | HUMAN_SECURITY_OWNER *(planned)* | HUMAN_SECURITY_OWNER | — | HUMAN_SECURITY_OWNER *(planned)* | Auth/webhook config + AuditLogEntry | FOUNDER | yes |

<details><summary>Failure modes</summary>

- `information_security` — ORPHAN TODAY: webhook auth already fails closed in code, but no named owner governs secrets/RBAC/rotation (s.16).

</details>

## TRUST SAFETY

| Capability | Type | Accountable owner | Executor | Reviewer | Human approver | System of record | Escalates to | Pre-LIVE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `preventive_trust_gate` | CONTROL_GATE | TRUST | TRUST | — | — | Driver trust state / Complaint | ADILET | yes |
| `serious_safety_incident_response` | DECISION | HUMAN_SAFETY_RESPONDER *(planned)* | HUMAN_SAFETY_RESPONDER | — | HUMAN_SAFETY_RESPONDER *(planned)* | ArbitrationCase / incident log | FOUNDER | yes |

<details><summary>Failure modes</summary>

- `preventive_trust_gate` — Fails closed: reveal/contact is denied when safety state is unknown.
- `serious_safety_incident_response` — ORPHAN TODAY: no runtime owner for physical-world emergencies (s.12).

</details>

## VERIFICATION

| Capability | Type | Accountable owner | Executor | Reviewer | Human approver | System of record | Escalates to | Pre-LIVE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `driver_identity_verification` | CONTROL_GATE | VERIFICATION_SERVICE *(planned)* | VERIFICATION_SERVICE | HUMAN_DISPATCHER | HUMAN_DISPATCHER | Driver verification state (to be defined) | ADILET | yes |
| `vehicle_verification` | CONTROL_GATE | VERIFICATION_SERVICE *(planned)* | VERIFICATION_SERVICE | HUMAN_DISPATCHER | HUMAN_DISPATCHER | Vehicle verification state (to be defined) | ADILET | yes |

<details><summary>Failure modes</summary>

- `driver_identity_verification` — ORPHAN TODAY: no formal verification gate. Scout confidence must not become legal identity proof (s.14).
- `vehicle_verification` — ORPHAN TODAY: unverified vehicle cannot be proven safe to carry passengers.

</details>

## Organizational chart

Classifications describe what each node **actually is in code**, not what its name suggests. Only Artur, Jolchu and Mira invoke a reasoning provider; everything else is deterministic TypeScript, an adapter, or a human role. Describing a deterministic service as an autonomous employee is management theater and is deliberately avoided here.

`Reports to` is who is accountable **today**. It is never who calls the code.

| Node | Classification | Status | Reports to | Intended manager | LLM |
| --- | --- | --- | --- | --- | --- |
| FOUNDER — Founder | HUMAN_ROLE | IMPLEMENTED | *(root)* | — | no |
| HUMAN_DISPATCHER — Human dispatcher (operations desk) | HUMAN_ROLE | IMPLEMENTED | ARTUR | — | no |
| HUMAN_ACCOUNTANT — Human accountant | HUMAN_ROLE | PLANNED | TYYIN | — | no |
| HUMAN_LEGAL_COMPLIANCE — Legal & compliance officer (human) | HUMAN_ROLE | PLANNED | FOUNDER | — | no |
| HUMAN_SECURITY_OWNER — Information security owner (human) | HUMAN_ROLE | PLANNED | FOUNDER | — | no |
| HUMAN_PRIVACY_OWNER — Privacy / data governance owner (human) | HUMAN_ROLE | PLANNED | FOUNDER | — | no |
| HUMAN_RELIABILITY_OWNER — Platform reliability owner (human on-call) | HUMAN_ROLE | PLANNED | FOUNDER | — | no |
| HUMAN_SAFETY_RESPONDER — Serious-incident responder (human) | HUMAN_ROLE | PLANNED | FOUNDER | — | no |
| ARTUR — Artur — AI Director | MANAGER | IMPLEMENTED | FOUNDER | — | yes |
| AKZHOL — Akzhol — Passenger Operations Manager | MANAGER | PLANNED | ARTUR | — | no |
| ZHOLAMAN — Zholaman — Delivery & Cargo Manager | MANAGER | PLANNED | ARTUR | — | no |
| ADILET — Adilet — Independent Arbitration & Discipline | INDEPENDENT_CONTROL | IMPLEMENTED | ARTUR | — | no |
| TYYIN — Tyyin — Central Treasury / Financial Control | INDEPENDENT_CONTROL | IMPLEMENTED | ARTUR | — | no |
| MIRA — Mira — public customer communication | OPERATIONAL_AGENT | IMPLEMENTED | ARTUR | AKZHOL | yes |
| JOLCHU — Jolchu — real-world geography, ETA, traffic, last mile | OPERATIONAL_AGENT | IMPLEMENTED | ARTUR | AKZHOL | yes |
| SAPAR — Sapar — cargo/delivery operations | OPERATIONAL_AGENT | IMPLEMENTED | ARTUR | ZHOLAMAN | no |
| RT_OFFICE — RT Office — supply/demand intelligence & passenger-driver loop | OPERATIONAL_AGENT | IMPLEMENTED | ARTUR | AKZHOL | no |
| SAPARGUL — Sapargul — cargo cashier | OPERATIONAL_AGENT | IMPLEMENTED | TYYIN | — | no |
| PASSENGER_CASHIER — Passenger cashier (DISPLAY_NAME_PENDING_FOUNDER_DECISION) | OPERATIONAL_AGENT | PLANNED | TYYIN | — | no |
| MATCH — Match — authoritative matching engine | DETERMINISTIC_SERVICE | IMPLEMENTED | ARTUR | AKZHOL | no |
| ROUTE — Route — internal corridor topology | DETERMINISTIC_SERVICE | IMPLEMENTED | ARTUR | AKZHOL | no |
| PAY — Pay — commission & driver RT Balance ledger | DETERMINISTIC_SERVICE | IMPLEMENTED | TYYIN | — | no |
| TRUST — Trust — preventive safety gate | DETERMINISTIC_SERVICE | IMPLEMENTED | ADILET | — | no |
| QUALITY — Quality — anomaly detection & rule verification | DETERMINISTIC_SERVICE | IMPLEMENTED | ARTUR | — | no |
| SUPPORT — Support — service recovery | DETERMINISTIC_SERVICE | IMPLEMENTED | ARTUR | AKZHOL | no |
| PARCEL — Parcel — passenger-corridor small parcel lifecycle | DETERMINISTIC_SERVICE | IMPLEMENTED | ARTUR | ZHOLAMAN | no |
| NETWORK — Network — partner registry CRUD | DETERMINISTIC_SERVICE | IMPLEMENTED | ARTUR | ZHOLAMAN | no |
| CRM_AUTO — CRM Auto — Drive CRM append-only event log | DETERMINISTIC_SERVICE | IMPLEMENTED | ARTUR | AKZHOL | no |
| SIDE_EFFECT_GATEWAY — SideEffectGateway — external send boundary | DETERMINISTIC_SERVICE | IMPLEMENTED | FOUNDER | HUMAN_RELIABILITY_OWNER | no |
| TARIFF_ENGINE — Tariff / pricing engine | DETERMINISTIC_SERVICE | PLANNED | ARTUR | — | no |
| VERIFICATION_SERVICE — Driver / vehicle / partner verification | DETERMINISTIC_SERVICE | PLANNED | ADILET | — | no |
| RISK_ENGINE — Fraud / risk signal engine | DETERMINISTIC_SERVICE | PLANNED | ADILET | — | no |
| SCOUT — Scout — driver discovery & fingerprinting | BACKGROUND_INTELLIGENCE | IMPLEMENTED | ARTUR | AKZHOL | no |
| ANALYTICS — Analytics — read-only aggregation | READ_ONLY_ANALYTICS | IMPLEMENTED | ARTUR | — | no |
| AKZHOL_REPORTING — Akzhol passenger-direction report (read-only) | READ_ONLY_ANALYTICS | IMPLEMENTED | ARTUR | AKZHOL | no |
| ZHOLAMAN_REPORTING — Zholaman cargo-direction report (read-only) | READ_ONLY_ANALYTICS | IMPLEMENTED | ARTUR | ZHOLAMAN | no |
| DRIVER_CONTRACTOR — Driver acquisition contractor | OPERATIONAL_AGENT | IMPLEMENTED | ARTUR | AKZHOL | no |
| PASSENGER_CONTRACTOR — Passenger acquisition contractor | OPERATIONAL_AGENT | IMPLEMENTED | ARTUR | AKZHOL | no |
| DELIVERY_CONTRACTOR — Business customer acquisition contractor | OPERATIONAL_AGENT | IMPLEMENTED | ARTUR | ZHOLAMAN | no |
| DELIVERY_EXECUTOR_CONTRACTOR — Delivery executor acquisition contractor | OPERATIONAL_AGENT | IMPLEMENTED | ARTUR | ZHOLAMAN | no |
| CARGO_CARRIER_CONTRACTOR — Cargo carrier acquisition contractor | OPERATIONAL_AGENT | IMPLEMENTED | ARTUR | ZHOLAMAN | no |
| COMMAND — RT Command — inbound routing wrapper | ADAPTER_WRAPPER | IMPLEMENTED | ARTUR | AKZHOL | no |
| PASSENGER — Passenger ingest wrapper | ADAPTER_WRAPPER | IMPLEMENTED | ARTUR | AKZHOL | no |
| DRIVER — Driver ingest wrapper | ADAPTER_WRAPPER | IMPLEMENTED | ARTUR | AKZHOL | no |

### Manager layer gap

22 nodes are intended to sit under a manager that does not exist yet. They report to a real manager in the meantime rather than being drawn under an empty box:

- **MIRA** — reports to ARTUR today, AKZHOL once built.
- **JOLCHU** — reports to ARTUR today, AKZHOL once built.
- **SAPAR** — reports to ARTUR today, ZHOLAMAN once built.
- **RT_OFFICE** — reports to ARTUR today, AKZHOL once built.
- **MATCH** — reports to ARTUR today, AKZHOL once built.
- **ROUTE** — reports to ARTUR today, AKZHOL once built.
- **SUPPORT** — reports to ARTUR today, AKZHOL once built.
- **PARCEL** — reports to ARTUR today, ZHOLAMAN once built.
- **NETWORK** — reports to ARTUR today, ZHOLAMAN once built.
- **CRM_AUTO** — reports to ARTUR today, AKZHOL once built.
- **SIDE_EFFECT_GATEWAY** — reports to FOUNDER today, HUMAN_RELIABILITY_OWNER once built.
- **SCOUT** — reports to ARTUR today, AKZHOL once built.
- **AKZHOL_REPORTING** — reports to ARTUR today, AKZHOL once built.
- **ZHOLAMAN_REPORTING** — reports to ARTUR today, ZHOLAMAN once built.
- **DRIVER_CONTRACTOR** — reports to ARTUR today, AKZHOL once built.
- **PASSENGER_CONTRACTOR** — reports to ARTUR today, AKZHOL once built.
- **DELIVERY_CONTRACTOR** — reports to ARTUR today, ZHOLAMAN once built.
- **DELIVERY_EXECUTOR_CONTRACTOR** — reports to ARTUR today, ZHOLAMAN once built.
- **CARGO_CARRIER_CONTRACTOR** — reports to ARTUR today, ZHOLAMAN once built.
- **COMMAND** — reports to ARTUR today, AKZHOL once built.
- **PASSENGER** — reports to ARTUR today, AKZHOL once built.
- **DRIVER** — reports to ARTUR today, AKZHOL once built.

