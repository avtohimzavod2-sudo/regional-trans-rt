# RT Pre-LIVE Readiness

<!-- GENERATED FILE - do not edit by hand. Run `npm run docs:governance` after changing src/lib/governance. -->

> **A passing test suite is not a launch decision.**
>
> Software tests prove that the code does what it was written to do. They cannot prove that a named human is on call, that a restore has ever been tried, that the legal position is settled, or that anyone is accountable for fraud. Those gates are listed below and they default to UNKNOWN. **UNKNOWN fails closed.**

## Verdict

| Axis | Status |
| --- | --- |
| Organizational architecture | **READY** |
| Pre-LIVE architecture | **NOT_READY** |
| LIVE | **NOT_READY** |

These are independent. A structurally sound organization can be entirely unready to launch, and that is exactly the current state.

Pre-LIVE capabilities: **33** · with a real owner: **20** · blocked: **13**

## Blocked pre-LIVE capabilities

Each of these is a responsibility RT has named but not staffed.

### `passenger_payment_intake`

Intended owner: **PASSENGER_CASHIER** — Passenger cashier (DISPLAY_NAME_PENDING_FOUNDER_DECISION)

- accountable owner "PASSENGER_CASHIER" is PLANNED, not implemented

### `financial_exception_resolution`

Intended owner: **HUMAN_ACCOUNTANT** — Human accountant

- accountable owner "HUMAN_ACCOUNTANT" is PLANNED, not implemented
- human approver "HUMAN_ACCOUNTANT" is not a named, active person

### `fare_and_tariff_authority`

Intended owner: **TARIFF_ENGINE** — Tariff / pricing engine

- accountable owner "TARIFF_ENGINE" is PLANNED, not implemented

### `fraud_risk_signal_detection`

Intended owner: **RISK_ENGINE** — Fraud / risk signal engine

- accountable owner "RISK_ENGINE" is PLANNED, not implemented

### `serious_safety_incident_response`

Intended owner: **HUMAN_SAFETY_RESPONDER** — Serious-incident responder (human)

- accountable owner "HUMAN_SAFETY_RESPONDER" is PLANNED, not implemented
- human approver "HUMAN_SAFETY_RESPONDER" is not a named, active person

### `driver_identity_verification`

Intended owner: **VERIFICATION_SERVICE** — Driver / vehicle / partner verification

- accountable owner "VERIFICATION_SERVICE" is PLANNED, not implemented

### `vehicle_verification`

Intended owner: **VERIFICATION_SERVICE** — Driver / vehicle / partner verification

- accountable owner "VERIFICATION_SERVICE" is PLANNED, not implemented

### `information_security`

Intended owner: **HUMAN_SECURITY_OWNER** — Information security owner (human)

- accountable owner "HUMAN_SECURITY_OWNER" is PLANNED, not implemented
- human approver "HUMAN_SECURITY_OWNER" is not a named, active person

### `privacy_and_data_governance`

Intended owner: **HUMAN_PRIVACY_OWNER** — Privacy / data governance owner (human)

- accountable owner "HUMAN_PRIVACY_OWNER" is PLANNED, not implemented
- human approver "HUMAN_PRIVACY_OWNER" is not a named, active person

### `legal_and_regulatory_compliance`

Intended owner: **HUMAN_LEGAL_COMPLIANCE** — Legal & compliance officer (human)

- accountable owner "HUMAN_LEGAL_COMPLIANCE" is PLANNED, not implemented
- human approver "HUMAN_LEGAL_COMPLIANCE" is not a named, active person

### `platform_reliability_and_incident_response`

Intended owner: **HUMAN_RELIABILITY_OWNER** — Platform reliability owner (human on-call)

- accountable owner "HUMAN_RELIABILITY_OWNER" is PLANNED, not implemented

### `backup_and_disaster_recovery`

Intended owner: **HUMAN_RELIABILITY_OWNER** — Platform reliability owner (human on-call)

- accountable owner "HUMAN_RELIABILITY_OWNER" is PLANNED, not implemented
- human approver "HUMAN_RELIABILITY_OWNER" is not a named, active person

### `deployment_and_rollback_policy`

Intended owner: **HUMAN_RELIABILITY_OWNER** — Platform reliability owner (human on-call)

- accountable owner "HUMAN_RELIABILITY_OWNER" is PLANNED, not implemented
- human approver "HUMAN_RELIABILITY_OWNER" is not a named, active person

## Manual gates

No amount of test coverage can satisfy these. Each requires an explicit human attestation; absent one, the gate is UNKNOWN and LIVE stays blocked.

| Gate | Status |
| --- | --- |
| `founder_approved_pricing_policy` | UNKNOWN |
| `founder_approved_passenger_cashier_identity` | UNKNOWN |
| `legal_entity_and_regulatory_position_confirmed` | UNKNOWN |
| `named_human_on_call_for_reliability` | UNKNOWN |
| `named_human_responder_for_safety_incidents` | UNKNOWN |
| `named_human_owner_for_security_and_secrets` | UNKNOWN |
| `named_human_owner_for_privacy_and_retention` | UNKNOWN |
| `backup_restore_drill_performed` | UNKNOWN |
| `rollback_procedure_written_and_rehearsed` | UNKNOWN |
| `real_provider_credentials_reviewed_and_scoped` | UNKNOWN |

Total manual gates: 10.

## Why each capability is required before LIVE

The pre-LIVE line was drawn by one engineer and has business and legal consequences. Rather than asking for 33 booleans to be reviewed, each flag is traced to a stated rule, so the rules can be reviewed once and only the residue needs a per-capability decision.

| Basis | Pre-LIVE capabilities | Cannot be deferred | Why |
| --- | --- | --- | --- |
| `MONEY_MOVES` | 7 | yes | Real customer money is involved. An error here is not recoverable by an apology. |
| `PHYSICAL_SAFETY` | 4 | yes | A person gets into a stranger's vehicle. Unverified drivers and unhandled safety incidents cause physical harm, which no refund undoes. |
| `PERSONAL_DATA` | 2 | yes | RT holds identifiable data about passengers and drivers, and holding it is itself a duty. |
| `LEGAL_EXPOSURE` | 1 | yes | Operating unlawfully is not a degraded mode of operating. |
| `ABUSE_AND_FRAUD` | 1 | depends on scale | Without detection, a fake driver or a collusive pattern is indistinguishable from normal business until the loss is realized. |
| `CUSTOMER_RECOURSE` | 3 | depends on scale | A customer who has been wronged needs somewhere to go, or RT's only answer is silence. |
| `OPERATIONAL_CONTINUITY` | 3 | depends on scale | A platform that cannot be restored, rolled back or watched is one incident from data loss. |
| `CORE_SERVICE_LOOP` | 10 | depends on scale | On the path a passenger actually travels: ask, match, book, ride. Without these there is no product to launch, so the flag is a tautology rather than a judgment. |
| `LAUNCH_AUTHORITY` | 1 | depends on scale | Someone must decide to launch. Structural, not a judgment about scope. |

"Cannot be deferred" marks the bases where no engineering decision may postpone the requirement: customer money, physical safety, personal data, legality. The rest scale with exposure — a hand-picked pilot is not an open market — so their flags are genuinely the Founder's to set.

### Flags that need a Founder decision

2, out of 51 capabilities:

- `drive_crm_event_write` (DRIVER_OPS) — marked pre-LIVE on judgment alone — confirm it or drop it.
- `cargo_payment_confirmation` (FINANCE) — **a rule says this cannot wait and the flag says it can** (MONEY_MOVES).

## How this is enforced

- `src/lib/governance/org.ts` — who exists and who is accountable, classified by observed code behavior.
- `src/lib/governance/capabilities.ts` — the accountability matrix.
- `src/lib/governance/validate.ts` — structural rules (single owner, no cycles, no service acting as a manager, no escalation into a void).
- `src/lib/governance/readiness.ts` — this gate. Fails closed on UNKNOWN.

To change a verdict, change the organization — staff the owner, name the human, run the drill — and regenerate this file. Editing the markdown alone changes nothing.

Each blocker is classified by kind in RT_PRE_LIVE_BLOCKERS.md — the four kinds are resolved by different people.

