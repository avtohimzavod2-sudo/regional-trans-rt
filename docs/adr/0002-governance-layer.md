# ADR 0002: A governance layer that models accountability, not just agents

- Status: Accepted
- Date: 2026-09-12

## Context

RT had 27 entries in `AGENT_REGISTRY` and an org map in
`docs/RT_ORGANIZATION.md`, but no machine-checkable answer to "who is
accountable for X". An audit of the repository ahead of this decision found
four structural problems that no existing test could catch.

**1. The only collision check detects double-claims, never zero-claims.**
`src/lib/artur/collisions.ts` fails the build when two contracts claim the
same `ownsExclusiveCapabilities` entry. An *unclaimed* capability leaves no
trace in the registry at all, so the more dangerous failure — nobody owns it —
was structurally invisible. Enumerating RT's real responsibilities surfaced
16 with no owner in code: tariff/pricing authority, fraud-risk signals, driver
and vehicle verification, partner verification, the passenger cashier,
financial exception resolution, serious-incident response, and the human
security, privacy, legal, reliability, backup and rollback functions.

**2. Most of the registry is not what its name implies.** Only `ARTUR`,
`JOLCHU` and `MIRA` actually invoke a reasoning provider. `MATCH`, `ROUTE`,
`PAY`, `TRUST`, `QUALITY`, `SUPPORT`, `PARCEL`, `NETWORK` and `CRM_AUTO` are
deterministic TypeScript; `COMMAND`, `PASSENGER` and `DRIVER` are thin
wrappers, two of them under 40 lines; `ANALYTICS` is read-only aggregation.
Describing these as autonomous employees inflates the apparent size of the
organization and obscures which parts can actually exercise judgement.

**3. Authority was largely undeclared.** 14 of 27 contracts had no
`reportsTo`, 19 had no `escalationTarget`, and 15 declared no exclusive
capability at all — so most of the organization had undefined authority and
was invisible to the collision checker.

**4. Two managers are referenced everywhere and exist nowhere.** `AKZHOL`
and `ZHOLAMAN` appear across 18 files — prospecting handoff targets, Adilet's
manager view, Artur's snapshot — but neither is in the `AgentName` enum or the
registry. `src/lib/artur/snapshot.ts` already admits this in a comment.

## Decision

**1. Add a governance layer as pure TypeScript metadata, in `src/lib/governance/`.**
`org.ts` (who exists, and who is accountable), `capabilities.ts` (the
accountability matrix), `validate.ts` (structural rules), `readiness.ts` (the
pre-LIVE gate). It is data plus assertions, wired into no request path.

**2. Use a governance-only identifier vocabulary, not the Prisma `AgentName` enum.**
Orphan responsibilities must be assignable to managers, humans and planned
services that no enum value exists for. Reusing `AgentName` would have forced
a schema migration to write down a documentation fact. The governance
vocabulary is a superset; a test asserts every registry agent resolves to an
org node, so the two cannot silently diverge.

**3. Classify every node by observed code behavior, not by name.**
`MANAGER`, `OPERATIONAL_AGENT`, `INDEPENDENT_CONTROL`, `DETERMINISTIC_SERVICE`,
`ADAPTER_WRAPPER`, `READ_ONLY_ANALYTICS`, `BACKGROUND_INTELLIGENCE`,
`LEGACY_COMPATIBILITY`, `HUMAN_ROLE`. A test pins the LLM-backed set to exactly
`{ARTUR, JOLCHU, MIRA}` and forbids any deterministic service, adapter,
analytics module or human role from claiming reasoning. Growing that list
requires a module to really start calling a provider.

**4. Make "named" and "staffed" different things.**
Every node carries `status: IMPLEMENTED | PLANNED`. Naming a PLANNED owner in
the matrix is how an orphan responsibility gets an intended home — and the
readiness gate treats a pre-LIVE capability owned by a PLANNED node as **not
ready**. This is the mechanism that stops the matrix from becoming
documentation theater: filling in the table makes the problem *more* visible,
never less.

**5. Separate current accountability from intended structure.**
`reportsTo` means "who answers for this today" and must resolve to an
IMPLEMENTED node; `plannedReportsTo` records the intent. Same split for
`escalationTarget` / `plannedEscalationTarget`. An org chart that draws 19
live nodes under an unbuilt manager is an accountability hole in the shape of
a diagram. This rule caught a real one on its first run: `SIDE_EFFECT_GATEWAY`,
the outbound send boundary, reported to a reliability owner who does not
exist; it now reports to the Founder, stated explicitly.

**6. A reviewer is never an approver.**
`reviewer` may be any node. `humanApprover` is required wherever
`humanApprovalRequired` is set and must be a `HUMAN_ROLE`. An early draft let
Adilet satisfy the human-approval requirement on refund authorization, which
would have let an agent approve money movement. Reviewing and approving are
now distinct fields with distinct rules.

**7. Fail closed, and never let tests imply readiness.**
`readiness.ts` reports three independent verdicts — organizational, pre-LIVE,
LIVE. Ten manual gates (legal position, named on-call, restore drill,
rollback rehearsal, credential review, and so on) default to UNKNOWN when no
human has attested, and UNKNOWN blocks LIVE. No quantity of test coverage can
satisfy any of them, by construction.

**8. Generate the docs from the code.**
`docs/RT_ACCOUNTABILITY_MATRIX.md` and `docs/RT_PRE_LIVE_READINESS.md` are
produced by `npm run docs:governance`, and a test fails the build if the
checked-in files drift. A governance document that disagrees with the code it
describes is worse than none, because people trust it.

## Consequences

- RT now has an explicit, tested answer to "who is accountable for X", and a
  published list of the responsibilities it has *not* staffed.
- The current verdict is ORGANIZATIONAL_ARCHITECTURE **READY** (0 structural
  violations), PRE_LIVE **NOT_READY** (13 of 33 pre-LIVE capabilities blocked),
  LIVE **NOT_READY**. The blockers are real gaps, not modelling artifacts.
- Nothing in the layer changes runtime behavior, and no schema migration was
  required. It can be deleted without affecting a single request path — which
  is also its main limitation: it constrains what the organization *claims*,
  not yet what the code at runtime is permitted to do.
- Closing a blocker means staffing an owner and regenerating the docs. Editing
  the markdown alone changes nothing.
- The known weaknesses of this layer, including the ones not repaired, are
  recorded in `docs/RT_COLD_AUDIT_2026_09.md` (section B), and the
  `FOUNDER_DECISION_REQUIRED` items in its section C.
- Deliberately deferred, and tracked as `FOUNDER_DECISION_REQUIRED`: the
  passenger cashier's display name (the node is `PASSENGER_CASHIER` with
  `DISPLAY_NAME_PENDING_FOUNDER_DECISION` — no personal name was invented),
  and the identity of every human role above.
