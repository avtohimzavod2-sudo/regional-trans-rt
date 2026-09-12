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

| Gate | Status | Waiting on | Engineering |
| --- | --- | --- | --- |
| `founder_approved_pricing_policy` | UNKNOWN | engineering, the Founder | work outstanding |
| `founder_approved_passenger_cashier_identity` | UNKNOWN | the Founder | not a code problem |
| `legal_entity_and_regulatory_position_confirmed` | UNKNOWN | the Founder, a person, a provider | not a code problem |
| `named_human_on_call_for_reliability` | UNKNOWN | engineering, a person | work outstanding |
| `named_human_responder_for_safety_incidents` | UNKNOWN | engineering, a person | work outstanding |
| `named_human_owner_for_security_and_secrets` | UNKNOWN | engineering, a person | work outstanding |
| `named_human_owner_for_privacy_and_retention` | UNKNOWN | engineering, a person | work outstanding |
| `backup_restore_drill_performed` | UNKNOWN | engineering, a person | work outstanding |
| `rollback_procedure_written_and_rehearsed` | UNKNOWN | engineering, the Founder, a person | work outstanding |
| `real_provider_credentials_reviewed_and_scoped` | UNKNOWN | engineering, the Founder, a person, a provider | work outstanding |

Total manual gates: 10.

**UNKNOWN is not FAIL.** A gate is UNKNOWN because nobody has looked, and each one has a specific way to be looked at. It is also not readiness: a gate stays closed until someone attests, and no artifact in this repository can attest on a person's behalf.

### What would settle each gate

#### `founder_approved_pricing_policy`

No price rules have been stated. RT never invents a price (s.15), so every quote today is UNKNOWN / REQUIRES_QUOTE — which is the safe answer and also means RT cannot quote at all. There is nothing to attest because there is nothing to approve.

Attested by **Founder** once the evidence exists:

- **the Founder** — Written price rules: per corridor, per seat, per cargo class, plus the commission RT takes. Enough to compute a fare without judgement.
- [ ] **engineering** — TARIFF_ENGINE turning those rules into deterministic quotes, each stamped with its provenance, returning UNKNOWN where no rule applies. *(not built — blocked on the rules above, since there is nothing to encode)*
- [ ] **engineering** — Tests proving no code path can produce a price that did not come from a rule, including the LLM paths. *(not built)*

#### `founder_approved_passenger_cashier_identity`

The org node is deliberately named PASSENGER_CASHIER with DISPLAY_NAME_PENDING_FOUNDER_DECISION. No personal name has been invented for it (s.10), so the identity the gate refers to does not exist yet.

Attested by **Founder** once the evidence exists:

- **the Founder** — Whether the passenger cashier is a person, a role held by an existing post, or a module — and, if a display name is wanted, what it is.
- **the Founder** — Confirmation that the cashier has intake only and no outgoing-money path, matching Sapargul's boundary on the cargo side.

#### `legal_entity_and_regulatory_position_confirmed`

Which legal entity operates RT, in which jurisdiction, under what licence for passenger and cargo transport, is unsettled. Nothing in the repository can determine it, and every provider relationship depends on it being settled first.

Attested by **Founder** once the evidence exists:

- **the Founder** — The operating entity and its jurisdiction, on the record.
- **a provider** — Registration and any transport licence or permit the jurisdiction requires, as issued documents rather than as an intention.
- **a person** — HUMAN_LEGAL_COMPLIANCE reviews the licensing position for both passenger and cargo transport and states in writing whether RT may operate.

#### `named_human_on_call_for_reliability`

The HUMAN_RELIABILITY_OWNER post is vacant. There is no channel to page and no response-time commitment, so 'who answers when RT is down' has no answer — SIDE_EFFECT_GATEWAY reports straight to the Founder precisely because of this.

Attested by **Founder** once the evidence exists:

- **a person** — The Founder appoints a named person to HUMAN_RELIABILITY_OWNER and that person accepts the on-call commitment.
- **a person** — A published reachable channel, stated hours, and a response-time commitment.
- [ ] **engineering** — Something that can actually page them: an alert path from a failing health check to that channel. RT has /api/health and CI, and no alerting at all. *(not built)*

#### `named_human_responder_for_safety_incidents`

The HUMAN_SAFETY_RESPONDER post is vacant. s.12 forbids an agent handling a physical-world emergency alone, and RT honours that by refusing to act — but a refusal with nobody behind it means a real incident reaches nobody.

Attested by **Founder** once the evidence exists:

- **a person** — The Founder names a reachable person with a phone number and defined hours, and that person accepts.
- **a person** — One rehearsal of the escalation script on a scenario incident, including the point at which emergency services are called.
- [ ] **engineering** — A per-incident access path to trip, driver and passenger contact details that logs every read, so the data-minimisation rule is enforced rather than promised. *(not built)*

#### `named_human_owner_for_security_and_secrets`

The HUMAN_SECURITY_OWNER post is vacant. Security ownership is implicit in code review: nobody holds the secret inventory, nobody owns rotation, nobody is accountable for a leak.

Attested by **Founder** once the evidence exists:

- **a person** — The Founder appoints a named person to HUMAN_SECURITY_OWNER.
- [ ] **engineering** — A mechanical inventory of every environment variable the code reads, what each is for, and whether it is a secret. Engineering can produce this from the source today; it is the raw material the security owner needs, not a substitute for them. *(not built)*
- **a person** — The security owner turns that inventory into the authoritative one: blast radius per key, rotation owner per key, and the compromise procedure.

#### `named_human_owner_for_privacy_and_retention`

The HUMAN_PRIVACY_OWNER post is vacant. RT stores passenger and driver personal data with no retention period, no deletion process and no owner for a deletion request (s.17). 'Forever' is the current behaviour and nobody chose it.

Attested by **Founder** once the evidence exists:

- **a person** — The Founder appoints a named person to HUMAN_PRIVACY_OWNER.
- [ ] **engineering** — An inventory of every personal-data field in the Prisma schema, derived from the schema rather than hand-listed so it cannot go stale. *(not built)*
- **a person** — A retention period set per data category, and a deletion-request path with a response time. Anything left without a period is a defect, not a default.
- [ ] **engineering** — An executable deletion path honouring those periods and legal holds, running through a reviewed and audited route rather than direct production DML (s.31). *(not built — needs the periods above to exist first)*

#### `backup_restore_drill_performed`

No backup has ever been taken by RT's own tooling and no restore has ever been attempted, so there is no elapsed time to record and no evidence either way. Note what the database work of this sprint does and does not prove: `prisma migrate deploy` against an empty container proves the *schema* bootstraps from zero, which is not a restore of data.

Attested by **Founder** once the evidence exists:

- [ ] **engineering** — A backup script that runs unattended and states where the backup lands. *(not built)*
- [ ] **engineering** — A restore script that restores into a scratch environment — forward into a new database, never an in-place wipe (s.31). *(not built)*
- [ ] **engineering** — Proof the restored database is usable rather than merely present: migration status clean, no schema drift, a smoke query. *(partly available — the drift check `prisma migrate diff --exit-code` already runs in CI's integration job and can be reused against a restored database)*
- **a person** — HUMAN_RELIABILITY_OWNER runs the drill once against real backed-up data and records the elapsed time. A script that has only ever run in CI has not been drilled.

#### `rollback_procedure_written_and_rehearsed`

There is no deployment procedure and therefore nothing to roll back. CI verifies every push and deliberately does not deploy, so the question 'how do we take a release back' has never had to be answered.

Attested by **Founder** once the evidence exists:

- **the Founder** — Where RT deploys and who may trigger it. Deployment is an act with an owner, not a consequence of merging.
- [ ] **engineering** — The written procedure: how a release goes out, how it comes back, and what happens to a migration that has already applied when the code rolls back. *(not written)*
- **a person** — HUMAN_RELIABILITY_OWNER rehearses the rollback once. A written procedure that has never been executed is a draft.

#### `real_provider_credentials_reviewed_and_scoped`

There are no real provider credentials to review. Every provider defaults to a mock — MIRA_AI_PROVIDER, JOLCHU_ROUTE_PROVIDER, ARTUR_AI_PROVIDER — and there is no payment provider and no approved messaging business account at all. The gate is UNKNOWN rather than PASS because 'no credentials exist' is not the same as 'credentials were reviewed and found correctly scoped'.

Attested by **Founder** once the evidence exists:

- [ ] **engineering** — The environment-variable inventory: every provider variable the code reads, what happens when it is unset, and whether the unset behaviour fails closed. Engineering can produce and test this now, and it is the checklist the review is performed against. *(not built)*
- **the Founder** — Which providers RT will actually use for payment intake and for messaging. Depends on the legal entity being confirmed first.
- **a provider** — Issued credentials under the confirmed entity, plus the provider-side scope: an intake-only payment key with no payout capability, approved messaging templates, and stated rate limits.
- **a person** — HUMAN_SECURITY_OWNER reviews each issued credential against the inventory and confirms its scope is the least that works — in particular that no key can move money outward (s.10).

### What engineering can build now

The honest engineering backlog behind the unknowns. None of these close a gate on their own — they are the material the attester needs in order to have something to look at.

- `founder_approved_pricing_policy` — TARIFF_ENGINE turning those rules into deterministic quotes, each stamped with its provenance, returning UNKNOWN where no rule applies.
- `founder_approved_pricing_policy` — Tests proving no code path can produce a price that did not come from a rule, including the LLM paths.
- `named_human_on_call_for_reliability` — Something that can actually page them: an alert path from a failing health check to that channel. RT has /api/health and CI, and no alerting at all.
- `named_human_responder_for_safety_incidents` — A per-incident access path to trip, driver and passenger contact details that logs every read, so the data-minimisation rule is enforced rather than promised.
- `named_human_owner_for_security_and_secrets` — A mechanical inventory of every environment variable the code reads, what each is for, and whether it is a secret. Engineering can produce this from the source today; it is the raw material the security owner needs, not a substitute for them.
- `named_human_owner_for_privacy_and_retention` — An inventory of every personal-data field in the Prisma schema, derived from the schema rather than hand-listed so it cannot go stale.
- `named_human_owner_for_privacy_and_retention` — An executable deletion path honouring those periods and legal holds, running through a reviewed and audited route rather than direct production DML (s.31).
- `backup_restore_drill_performed` — A backup script that runs unattended and states where the backup lands.
- `backup_restore_drill_performed` — A restore script that restores into a scratch environment — forward into a new database, never an in-place wipe (s.31).
- `backup_restore_drill_performed` — Proof the restored database is usable rather than merely present: migration status clean, no schema drift, a smoke query.
- `rollback_procedure_written_and_rehearsed` — The written procedure: how a release goes out, how it comes back, and what happens to a migration that has already applied when the code rolls back.
- `real_provider_credentials_reviewed_and_scoped` — The environment-variable inventory: every provider variable the code reads, what happens when it is unset, and whether the unset behaviour fails closed. Engineering can produce and test this now, and it is the checklist the review is performed against.

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

