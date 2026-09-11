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

## D. Verification at time of audit

`prisma validate` clean · `tsc --noEmit` clean · `eslint src scripts` 0 errors
(6 pre-existing unused-argument warnings in unrelated provider files) ·
144 test files / 1496 tests passing · `next build` clean.

**None of the above is evidence of launch readiness.** The readiness gate
reports ORGANIZATIONAL_ARCHITECTURE READY, PRE_LIVE_ARCHITECTURE NOT_READY,
LIVE NOT_READY, and no quantity of passing tests can change the last two.
