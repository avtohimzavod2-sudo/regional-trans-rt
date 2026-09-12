# RT Cold Audit — September 2026

Written adversarially: the question is not "does the work look good" but
"where would this fail, and what is being claimed that is not true". Findings
already fixed are listed with their commit. Findings **not** fixed are listed
too, with the reason — an audit that only reports what was convenient to
repair is marketing.

Scope: the organizational/architectural hardening sprint (governance layer,
accountability matrix, pre-LIVE readiness gate) and the surfaces it touches.

---

## A. Findings fixed during the sprint

**A1. Collision detection could only ever see double-claims.**
`src/lib/artur/collisions.ts` fails the build when two contracts claim the same
exclusive capability. A capability claimed by *nobody* leaves no trace in the
registry, so the more dangerous failure was structurally invisible. Enumerating
RT's responsibilities surfaced 16 with no owner in code. Fixed by
`src/lib/governance/capabilities.ts` + `UNOWNED_CAPABILITY` validation.

**A2. Nineteen live nodes reported to a manager that does not exist.**
`AKZHOL` and `ZHOLAMAN` are referenced in 18 files and implemented in none. An
org chart that draws real nodes under an unbuilt manager is an accountability
hole in the shape of a diagram. Fixed by splitting `reportsTo` (must resolve to
an IMPLEMENTED node) from `plannedReportsTo`, enforced by
`REPORTS_TO_PLANNED_NODE`.

**A3. The most safety-critical control reported to nobody.**
A2's new rule immediately failed on real data: `SIDE_EFFECT_GATEWAY`, the
outbound send boundary, reported to a reliability owner who does not exist. It
now reports to `FOUNDER` with the gap stated in the node's own note. This is
the rule doing its job on its first run.

**A4. A reviewer could satisfy a human-approval requirement.**
An early draft of the matrix let Adilet — an agent — satisfy the human-approval
requirement on `refund_authorization`. That would have permitted an agent to
approve money movement. Fixed with a distinct `humanApprover` field constrained
to `HUMAN_ROLE`, plus a regression test.

**A5. The matrix and AGENT_REGISTRY described the same organization in two
unlinked vocabularies.** 14 of the registry's 18 exclusive capabilities had no
matrix entry naming them. No owner was actually mis-assigned — all 18 agreed —
but nothing was checking, and three pairs differ only in wording
(`external_` vs `public_customer_communication`, `confirm_cargo_payment` vs
`cargo_payment_confirmation`, `complaint_` vs `dispute_arbitration_decision`).
Fixed by `implementedBy` + `validateRegistryCoverage` (commit `c46814f`),
checked in both directions against the live registry.

---

## B. Findings NOT fixed

**B1. The governance layer is inert at runtime. This is its central
limitation.** Nothing in `src/lib/governance/` is imported by any request path.
It is data plus assertions, enforced only by the test suite. A module can
violate the accountability matrix at runtime and nothing will stop it or
notice. The layer constrains what the organization *claims*, not what the code
is *permitted to do*. Treating a green governance suite as a runtime guarantee
would be a serious misreading.

**B2. `preLiveRequired` is one engineer's judgment, unreviewed.** 33 of 51
capabilities are marked as required before serving real customers. That line
was drawn during this sprint by the author of the file. It has business and
legal consequences and has had no business or legal review. The number should
be treated as a proposal.

**B3. Matrix completeness is unprovable.** A5 makes one class of omission
detectable — a capability the code exclusively claims but the matrix ignores.
It does nothing for a responsibility nobody has ever written code for and
nobody thought to enumerate. The 51 entries are what this audit found, not a
proof of what exists. Read "no unowned capabilities" as "none among those
listed".

**B4. `recordPassengerFinancialIntent` idempotency is best-effort, not
atomic.** `src/lib/mira/passenger-finance.ts` dedupes on `idempotencyKey` via
findFirst-then-create against `AuditLogEntry`, which carries no unique
constraint on `entityId`. Concurrent double-delivery of the same inbound
message can record the intent twice. The codebase's own idiom everywhere else
(`NotificationDelivery`, `AcquisitionOutreachEvent`, `DriveCrmEvent`,
`ShipmentPayment`) is a `@unique idempotencyKey` column; this path is the
exception. Not fixed here because the correct fix is a schema change, and this
sprint made no migrations. Materiality today is low and bounded: the
capability it feeds (`passenger_payment_intake`) is LIVE-blocked because
`PASSENGER_CASHIER` is PLANNED, so no money moves through it. It must be fixed
before that owner is staffed, not after.

**B5. Twelve of 42 org nodes are PLANNED — the chart is 29% aspiration.**
Every planned node renders as `*(planned)*` in the generated docs and blocks
its pre-LIVE capabilities, so the disclosure is real. But a reader skimming a
42-box chart sees an organization roughly a third larger than the one that
exists.

**B6. The inactive-owner check has never run against a non-empty set.**
`active` is declared on 8 of 27 contracts and has never been set to `false`, so
`INACTIVE_OWNER_OF_PRE_LIVE_CAPABILITY` is exercised only by synthetic tests.
Pinned by test so that broadening it is deliberate, but it is untested against
reality.

**B7. AKZHOL and ZHOLAMAN are still not implemented.** Their *accountability*
is now formalized — they exist as MANAGER nodes, their intended reports are
recorded in `plannedReportsTo`, and 23 capabilities record them as
`plannedEscalationTarget`. No manager modules were written. Until then ARTUR
absorbs the interim span of control for 19 nodes, which is a real concentration
of load on one node and is visible in the chart rather than hidden.

**B8. Three commits sit unpushed on `main`.** Per the sprint's git constraints
(no push, no deploy) this is intended, but it means none of this is on a remote
and none of it is in CI. The drift tests that keep the generated docs honest
only run where someone runs them.

---

## C. FOUNDER_DECISION_REQUIRED

Recorded without stopping work, per the sprint's instruction. None of these
can be resolved by engineering.

1. **Passenger cashier identity.** The node is `PASSENGER_CASHIER` with
   `DISPLAY_NAME_PENDING_FOUNDER_DECISION`. No personal name was invented.
   Blocks `passenger_payment_intake`.
2. **Pricing and tariff policy.** `fare_and_tariff_authority` has no
   implemented owner and no approved policy. Prices are never invented; unknown
   price resolves to REQUIRES_QUOTE. Someone must set the policy.
3. **Named humans for seven roles.** Accountant, safety responder, security
   owner, privacy owner, legal/compliance, reliability owner, and the
   passenger cashier. Nine of the 13 pre-LIVE blockers are one of these roles
   being a job title rather than a person.
4. **Legal entity and regulatory position** for operating passenger transport
   in the pilot corridor.
5. **Whether `preLiveRequired` is correctly drawn** (see B2).
6. **Whether the manager layer gets built or deleted** (see B7). Two options
   are honest: implement AKZHOL/ZHOLAMAN, or drop them and make ARTUR's span
   permanent. Leaving them named-but-unbuilt indefinitely is the third option
   and the worst one.

---

## D. Reconciliation — 12 September 2026

The audit above is left as written. This section records what has changed
since, finding by finding, because an audit edited to match later work stops
being evidence of anything.

### Findings now closed

**B4 — passenger financial intent idempotency.** Closed by `9075275`. There is
now a `PassengerFinancialIntent` model with a `@unique idempotencyKey`, and
`recordPassengerFinancialIntent` relies on the database constraint instead of
findFirst-then-create: a concurrent double-delivery loses the race at the
constraint and returns the existing intent rather than writing a second one.
**The migration is authored but has not been applied to any database** — the
development database was unreachable during this work, and no production
mutation was attempted or permitted. `prisma/migrations/20260912100000_add_passenger_financial_intent`
must be applied before the path is exercised.

**B7 — AKZHOL and ZHOLAMAN unimplemented.** Closed by `5eb65b1`, but not in the
way the audit assumed. The audit offered two honest options — build the manager
layer or delete it. The Founder chose a third that the audit did not consider
and that turns out to be the accurate one: **the management-information layer
is built; the accountable posts stay vacant.** `src/lib/akzhol/*` and
`src/lib/zholaman/*` are read-only, role-gated report builders over existing
events and data, with no Prisma write call anywhere in either (enforced by a
static boundary test) and no money read in the passenger one at all. Two new
IMPLEMENTED `READ_ONLY_ANALYTICS` nodes record the code; `AKZHOL` and
`ZHOLAMAN` remain PLANNED because nobody holds the post. Conflating the
instrumentation with the post is precisely the management theater the sprint
was meant to avoid.

**B8 — three commits unpushed, nothing in CI.** Closed. `1bd7b47..3419133` was
pushed to `origin/main` after verifying no secrets, credentials, `.env` files,
binaries or local tooling artifacts were included, and `d4e23b4` + `1f3f044`
added a fail-closed GitHub Actions workflow that runs on pushes to `main` and
on pull requests: reproducible install, `next typegen`, typecheck, lint, tests,
build, and the governance and readiness validators. It does not deploy, does
not migrate, and uses no production secrets. The drift tests that keep the
generated docs honest now run on every push.

### Findings still open

**B1 — the governance layer is inert at runtime.** Unchanged and still the
central limitation. The new modules do not change it: `src/lib/governance/` is
still imported by no request path. The one place the boundary is real at
runtime is the per-module role gate (akzhol, zholaman, artur, sapargul,
tyyin), which fails closed. Making a post's full grant enforceable rather than
asserted is filed as `role_grants_not_enforced_at_runtime`.

**B2 — `preLiveRequired` is one engineer's unreviewed judgment.** Narrowed, not
closed, by `8353f7e`. Every flag is now traced to a stated rule, so the rules
can be reviewed once instead of 33 booleans one at a time, and the residue is
two items: `drive_crm_event_write` (required on judgment alone) and
`cargo_payment_confirmation` (a money capability a rule says cannot wait, while
the flag says it can). Those two are in section C below. The rules themselves
still have had no business or legal review.

**B3 — matrix completeness is unprovable.** Unchanged. `RT_PRE_LIVE_BLOCKERS`
inherits the same limitation: it is complete with respect to what readiness
reports, which is complete with respect to what the matrix lists.

**B5 — the chart is part aspiration.** Now 12 of 44 nodes are PLANNED (27%).
Two IMPLEMENTED nodes were added and no planned node was filled, so the
proportion improved slightly and nothing about the substance did.

**B6 — the inactive-owner check has never run against a non-empty set.**
Unchanged.

---

## C-2. FOUNDER_DECISION_REQUIRED, re-adjudicated

Each item from section C re-examined against the rule that a Founder Decision
must never be a way to stop engineering work. Where the answer follows from
RT's architecture it was taken as a technical decision and implemented; what
remains is money, law, identity and appointment.

**1. Passenger cashier identity — still the Founder's, engineering unblocked.**
The name cannot be derived from anything; inventing one is forbidden. But the
decision was blocking more than it should: the module can be built against the
neutral `PASSENGER_CASHIER` id and named later. Split accordingly into
`founder_names_passenger_cashier` (decision) and `passenger_cashier_not_wired`
(software, buildable today). The idempotency substrate it will consume already
exists.

**2. Pricing and tariff policy — still the Founder's.** No engineering choice
can determine what RT charges, and RT must never invent a price. What follows
unambiguously from the architecture is already true: an unknown price resolves
to UNKNOWN / REQUIRES_QUOTE rather than to a guess. Once a policy exists,
`TARIFF_ENGINE` is deterministic work with no further decisions in it.

**3. Named humans for seven roles — still the Founder's, but the ask is now
specific.** "Appoint an accountant" was not an actionable request. Each post is
now specified in `docs/RT_PRE_LIVE_BLOCKERS.md`: mandate, least-privilege
rights, the rights the post must never receive, incompatible posts,
onboarding checklist, credentials and their revocation, who may appoint, and
which manual gate stays UNKNOWN until it is filled. No person is named or
invented anywhere — a seat is described, and filling it happens outside this
repository. Eight posts, since the two direction-manager posts joined the list.

**4. Legal entity and regulatory position — still the Founder's**, and it is
upstream of both external-provider blockers: no payment provider and no
production messaging account can be obtained without it.

**5. Whether `preLiveRequired` is correctly drawn — reduced to two questions.**
See B2 above. The engineering half is done; what is left is a business
judgment on exactly two capabilities, one of which is a possible *under*-
statement rather than an over-statement.

**6. Whether the manager layer gets built or deleted — decided, and it was a
technical decision.** RT's architecture answers this without a business choice:
the events and data Akzhol and Zholaman need already exist, so a read-only
management-information layer over them costs nothing structurally and removes
the "named but unbuilt" state the audit called the worst option. Built as
read/analysis modules with no write access and no money authority. The
appointment of managers remains a Founder act, now filed as two
`HUMAN_STAFFING_BLOCKER` posts rather than as an open question.

**Net:** of the six, one is resolved as a technical decision (6), one is
reduced to a two-item question (5), one is made actionable without being
resolved (3), and three remain genuinely the Founder's alone (1, 2, 4).

---

## E. Verification at time of audit

`prisma validate` clean · `tsc --noEmit` clean · `eslint src scripts` 0 errors
(6 pre-existing unused-argument warnings in unrelated provider files) ·
144 test files / 1496 tests passing · `next build` clean.

### At reconciliation, 12 September 2026

`tsc --noEmit` clean · `eslint` 0 errors (the same 6 pre-existing warnings) ·
155 test files / 1656 tests passing · `next build` clean · CI green on
`origin/main`.

**None of the above is evidence of launch readiness**, and the growth from
1496 to 1656 tests is not progress toward launch either — most of it verifies
that new read-only reporting cannot write and that the blocker taxonomy is
complete. The readiness gate still reports ORGANIZATIONAL_ARCHITECTURE READY,
PRE_LIVE_ARCHITECTURE NOT_READY, LIVE NOT_READY, with the same 13 unstaffed
pre-LIVE capabilities and the same 10 UNKNOWN manual gates as on the day of the
audit. Nothing in this reconciliation moved a single one of them, because none
of them are moved by writing code.
