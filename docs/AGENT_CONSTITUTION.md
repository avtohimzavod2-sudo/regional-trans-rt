# RT AI Workforce — Agent Constitution

This is the binding rulebook every RT AI agent contract (`AgentContract` in
`src/lib/agents/types.ts`, declared per-agent in each domain's
`orchestrator.ts`, indexed in `src/lib/agents/registry.ts`'s
`AGENT_REGISTRY`) is written against. It codifies AGENTS Master Architecture
spec sections 0–4, 20, 23–28, 32, 40. If a future agent's contract
contradicts this document, the contract is wrong, not the document.

## 1. RT Core is the only source of truth

No AI agent — including Artur, the Director — is ever the authoritative
database. Every agent reads and writes through RT Core's Prisma-backed
models. An LLM call may *summarize*, *classify*, *draft*, or *propose*; it
may never be the system of record for a fact that already has a
deterministic home (a payment's status, a case's decision, a sanction's
existence). See spec s.2, s.32.

## 2. One capability, one owner

Every operationally critical capability (confirming money received,
recording a treasury transaction, deciding a disciplinary sanction, sending
an external customer message, assigning a delivery executor, proposing a
director-level initiative) has **exactly one** agent whose contract
declares it in `ownsExclusiveCapabilities`. `src/lib/artur/collisions.ts`'s
`findCapabilityConflicts` / `assertNoCapabilityConflicts` enforce this
mechanically — `collisions.test.ts` runs it against the live
`AGENT_REGISTRY` on every test run, so a second contract accidentally
claiming an already-owned capability fails CI, not code review. See spec
s.3, s.20, s.26.

Current exclusive owners (see each agent's `orchestrator.ts` for the full
contract):

| Capability | Owner |
|---|---|
| `confirm_cargo_payment` | SAPARGUL |
| `central_treasury_transaction_record`, `accountant_case_escalation` | TYYIN |
| `complaint_arbitration_decision`, `disciplinary_sanction` | ADILET |
| `cargo_operational_status`, `assign_cargo_delivery_executor` | SAPAR |
| `external_customer_communication` | MIRA |
| `director_daily_brief`, `director_weekly_report`, `director_strategic_initiative_proposal` | ARTUR |
| `drive_crm_event_write` | CRM_AUTO |
| `driver_acquisition_outreach` | DRIVER_CONTRACTOR |
| `passenger_prospect_write` | PASSENGER_CONTRACTOR |
| `business_prospect_write`, `delivery_crm_event_write` | DELIVERY_CONTRACTOR |
| `delivery_executor_prospect_write` | DELIVERY_EXECUTOR_CONTRACTOR |
| `cargo_carrier_prospect_write` | CARGO_CARRIER_CONTRACTOR |

## 3. Role-boundary preservation

Each specialist's boundary, established before Artur existed and never
weakened by Artur's introduction (spec s.4):

- **Mira** — the only agent that talks to a client. Adilet, Sapar, Sapargul,
  Tyyin never message a customer directly; they hand a neutral summary to
  Mira.
- **Sapar** — owns cargo operational status and executor assignment. Never
  confirms payment.
- **Sapargul** — turns a confirmed order into a payment request and relays
  real payment instructions, but the actual "money received" confirmation
  is a treasurer-only act in `src/lib/sapargul/treasury.ts`, callable only
  under the `tyyin` treasury-ops role.
- **Tyyin** — the central treasury journal. Inbound reconciliation only.
  `TreasuryInboundBankAdapter` has no send/transfer/payout/refund/withdraw
  method anywhere in its interface — this is enforced by the adapter's
  *type signature*, not a runtime check that could be bypassed. See
  `docs/FINANCIAL_BOUNDARIES.md`.
- **Adilet** — independent arbitration. Never confirms money, never
  overrides Sapar's operational decisions, never talks to a client
  directly, never lets a manager silently rewrite an independent decision.
- **Artur (Director)** — observes, synthesizes, proposes. Never a universal
  execution agent: `ARTUR_AGENT_CONTRACT.forbiddenCapabilities` lists every
  capability above by name, and `src/lib/artur/boundary.test.ts` is a
  static source-scan asserting no file under `src/lib/artur/` imports a
  mutation function from Sapargul/Tyyin/Adilet's modules directly. Artur's
  visibility into RT OFFICE / Drive CRM (below) is read-only the same way.
- **RT OFFICE** — converts RT Core's existing Driver/DriverOffer/Match/Trip
  state and CRM Auto's DriveCrmEvent log into verified, never-invented
  supply facts for Mira to phrase to a passenger. It owns no exclusive
  capability: every write it triggers flows through the existing matching
  engine (`src/lib/matching/orchestrate.ts` via `src/lib/agents/match.ts`),
  never a second matching engine or a direct write to DriverOffer/Match/Trip.
  Its read path is exclusion-aware for the same reason:
  `resolveDemandAgainstSupply` (`src/lib/rt-office/facts.ts`) calls
  `matching/orchestrate.ts`'s exported `excludedOfferIdsForRequest` — the
  exact function `proposeMatchesForRequest` itself uses — so RT OFFICE can
  never describe an offer to a passenger that the driver has already
  declined for their request. It is never a second public persona —
  `src/lib/rt-office/boundary.test.ts` statically forbids it from importing
  any external-comms/payment function or writing those tables directly.
  - **The end-to-end passenger↔driver operational loop** (Мира → RT Core →
    RT OFFICE → CRM Auto/Drive CRM → Jolchu → RT OFFICE → Мира) is the one
    place RT OFFICE does own its own Prisma state: `PassengerLoopRun`
    (per-`TripRequest` state machine: `NEW → NORMALIZED → SUPPLY_REQUESTED →
    MATCHING → OFFER_READY|NO_SUPPLY → OFFER_SENT → PASSENGER_ACCEPTED|
    PASSENGER_DECLINED|EXPIRED|CANCELLED`) and `PassengerLoopOffer`
    (per-`Match` sub-state: `CANDIDATE → VALIDATED → RESERVED_PENDING →
    ACCEPTED|REJECTED|EXPIRED|INVALIDATED`), both defined and transitioned
    exclusively in `src/lib/rt-office/passenger-loop.ts`. This is
    observability/audit state layered over the real engine, never a second
    matching engine — every transition is driven by a hook call from
    `src/lib/ingest.ts` (loop start, `NO_SUPPLY`/`MATCHING` on the first
    match attempt), `src/lib/matching/orchestrate.ts` (`OFFER_READY` on
    every successful `proposeMatchesForRequest`/`proposeToDriver`,
    `OFFER_SENT`/`PASSENGER_ACCEPTED`/`PASSENGER_DECLINED`/
    `INVALIDATED`-by-seat-race on the real driver/passenger response
    handlers, `CANCELLED` from `cancelPendingDemand`), and
    `src/lib/matching/expiry.ts` (`EXPIRED` from the stale-match sweep) —
    never invoked independently of the real state change it describes.
    `transitionLoop`/`transitionLoopOffer` reject any transition outside
    `LEGAL_RUN_TRANSITIONS`/`LEGAL_OFFER_TRANSITIONS` and are idempotent
    against redelivery (a repeat call that finds the row already at the
    target status is a silent no-op, not an error). Last-mile pickup-point
    resolution goes through `src/lib/rt-office/route-facts.ts`, which calls
    Jolchu's `resolveRouteIntelligence` under a timeout
    (`RT_OFFICE_ROUTE_FACTS_TIMEOUT_MS`, default 8000ms) and fails closed —
    on any timeout, non-`RESOLVED` status, or thrown error it returns
    `NEEDS_CLARIFICATION`/`TEMPORARILY_UNAVAILABLE`, never a fabricated
    match. Mira only ever sees the loop's already-composed, non-over-
    disclosing outcome; it does not read `PassengerLoopRun`/`PassengerLoopOffer`
    directly and never becomes the orchestrator of this sequence.
- **CRM Auto** — services Drive CRM: the sole owner of `drive_crm_event_write`,
  appending verified operational facts (ETA, breakdown/incident, backhaul
  opportunity, operational history) to its own append-only `DriveCrmEvent`
  model. It never owns Mira CRM, never replaces RT OFFICE's demand/supply
  resolution, never orchestrates other agents, and never calculates money —
  `src/lib/crm-auto/boundary.test.ts` statically enforces all of this, the
  same pattern as RT OFFICE's. `DriveCrmEvent` rows are never updated or
  deleted after creation (the boundary test forbids
  `db.driveCrmEvent.update`/`.delete`/`.upsert`) — a mistaken fact (e.g. a
  false breakdown report) is fixed only by `recordExceptionalCorrection`
  appending a new `CORRECTION` event that references the original via
  `correctsEventId`, preserving full historical auditability rather than
  silently rewriting history. That correction does feed back into RT
  OFFICE's derived operational state — a `CORRECTION` covering the driver's
  latest OPEN breakdown clears the "Поломка" state the dispatcher UI shows —
  but strictly as a read-time derivation over the append-only log, never as
  a mutation of the original row.

- **Driver / Passenger / Delivery Contractor** (Market Acquisition
  Contractors) — grow verified supply/demand from public, permitted sources
  (Telegram/WhatsApp groups, Lalafo, public ads, manual import) without ever
  becoming a second public persona. None of the three ever sends an external
  message itself outside the shared, safety-gated
  `sendAcquisitionOutreach` adapter (rate-limited, deduped, do-not-contact
  aware, and honest about non-delivery — `DRY_RUN`/`SANDBOX`/
  `NO_PROVIDER_CONFIGURED` are never coerced into a fabricated `SENT`). Each
  owns exactly one Prisma write surface — `ScoutCandidate` import (via
  SCOUT's existing pipeline, not a duplicate one) for Driver Contractor,
  `PassengerProspect` for Passenger Contractor, `BusinessProspect` +
  `DeliveryCrmEvent` for Delivery Contractor — and none may invent its own
  demand/supply number: acquisition priority is always read from RT
  OFFICE's `computeMarketGap()` (see s.8 below), never recomputed locally.
  Passenger Contractor never messages a prospect as Mira; it only hands a
  qualified prospect to Mira for the real conversation. Mira's own bounded,
  read-only touchpoints with this pipeline —
  `recordInboundBusinessProspect` (an inbound partner inquiry Mira is
  already replying to, deduped into `BusinessProspect` but never triggering
  a second outreach message) and `driverDemandProposition` (one honest
  encouragement sentence appended only when `computeMarketGap()` genuinely
  shows `HIGH_DRIVER_ACQUISITION_NEED`) — are documented directly in
  `MIRA_AGENT_CONTRACT.permissions`/`prohibitedActions` and never let Mira
  write `BusinessProspect`/`DeliveryCrmEvent` or a market-gap number
  herself.

A human manager role (Zholaman/Akzhol in the spec's terminology) sits above
individual specialists operationally but still may not rewrite an
independent Adilet decision, confirm a payment itself, or bypass Tyyin's
treasury journal — the AI boundaries above bind human dispatcher roles
acting through the same code paths, not only AI callers.

## 4. Deterministic rules first, LLM context second

Severity, workflow-state transitions, idempotency, and financial arithmetic
are plain functions (`src/lib/artur/severity.ts`, `initiatives.ts`,
`period.ts`) that never call a model. An LLM may explain *why* a
deterministic severity was assigned; it never assigns the severity itself.
See spec s.19, s.23, s.32.

## 5. Never fabricate

A number that cannot be computed from real data is reported as missing
(`missingDataNotes`, `available: false` on a `KpiRow`), never invented. A
cause that is not yet confirmed is labeled a hypothesis, never stated as
fact (`ProblemOfTheWeek.rootCause` is nullable — `null` means "not yet
established," and the weekly report renders that distinction explicitly).
A delivery channel that does not exist is never claimed to have delivered
(`NotificationDelivery` — see `docs/ARTUR_DIRECTOR_PROTOCOL.md` s.30). See
spec s.34.

## 6. Append-only, idempotent, typed

Financial and audit records are never silently overwritten — every mutation
lands as a new row or a state-machine transition on an existing one, never
a destructive update (spec s.25). Every externally-triggered or
scheduler-triggered mutation carries a persistent idempotency key (a
`sourceEventKey`, a `jobName_periodKey` composite unique, a
`reportDate`/`weekStartDate` unique) so a retry or a duplicate cron
invocation is a no-op, never a duplicate record (spec s.21–22, s.31).
Handoffs between agents are typed events (`ArturEvent`, `TyyinEvent`,
`AdiletEvent` unions), never a free-text string an LLM could misspell (spec
s.24).

## 7. Onboarding a new agent

1. Add the agent to the `AgentName` Prisma enum.
2. Write its `orchestrator.ts` declaring a full `AgentContract`: mission,
   inputs/outputs, permissions, `prohibitedActions`, KPIs, escalation
   rules, `reportsTo`, and — if it owns anything operationally critical —
   `ownsExclusiveCapabilities` plus `forbiddenCapabilities` for anything it
   must explicitly never touch.
3. Register it in `AGENT_REGISTRY` (`src/lib/agents/registry.ts`).
4. Run `collisions.test.ts` (or just `assertNoCapabilityConflicts`) before
   merging — a capability collision is a blocking defect, not a warning.
5. If the agent mutates state, give every mutating entry point an
   idempotency key and an append-only audit trail via its own
   `log<Agent>Action` / `emit<Agent>Event` pair, mirroring
   `src/lib/artur/events.ts`.

This scales to 100+ agents because nothing above is agent-count-dependent:
collision detection is O(agents × capabilities), the registry is a flat
array, and every boundary is declared data (`AgentContract` fields) checked
by generic code, not a growing pile of special cases.

## 8. Market Gap — one aggregate number, one home

`src/lib/rt-office/market-gap.ts`'s `computeMarketGap()` is the **only**
place unresolved passenger demand (`TripRequest.seats`, PENDING/MATCHING) is
aggregated against verified driver supply (`DriverOffer.seatsAvailable`,
OPEN/PARTIALLY_FILLED) into a network-wide (or, with `corridorId`, a
per-corridor) gap. It owns no Prisma model of its own — pure read-only
aggregation, same "never invent a number" discipline as `rt-office/facts.ts`
— and every consumer (Driver/Passenger Contractor's acquisition priority,
Mira's `driverDemandProposition`, the `/dispatcher/market-gap` dashboard)
calls this one function rather than recomputing demand/supply itself. The
spec's illustrative 23 demand / 9 supply / -14 gap example is never
hardcoded anywhere in this codebase; every number shown anywhere is this
function's live result at call time.
