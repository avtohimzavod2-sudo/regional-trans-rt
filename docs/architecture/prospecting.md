# RT Prospecting — five contragents, one shared core

RT's external commercial/prospecting layer finds demand and supply (new
passengers, drivers, delivery executors, cargo carriers, business customers)
and hands off a qualified, interested lead to the relevant internal agent.
This document fixes how all five contragents map onto what exists and how
the shared Prospecting Core ties them together. See
[ADR 0001](../adr/0001-delivery-cargo-separation.md) s.5 for the decision
record.

## 1. What already exists (do not duplicate)

`src/lib/acquisition/` is the shared safety-gate infrastructure every
contragent uses:

- `sendAcquisitionOutreach()` (`outreach-log.ts`) — do-not-contact check ->
  cross-contragent `contactFingerprint` opt-out check -> 3-day rate-limit
  cooldown -> `ACQUISITION_OUTREACH_MODE` (LIVE/SANDBOX/DRY_RUN) -> honest
  `NO_PROVIDER_CONFIGURED`/`FAILED` states -> P2002-idempotent dedup on
  write. Directly unit-tested in `src/lib/acquisition/outreach-log.test.ts`.
- `isDoNotContact()` / `isDoNotContactFingerprint()` / `recordOptOut()` —
  append-only opt-out derivation, both per-prospect and cross-contragent.
- `classifyMarketRole()` / `isActionableClassification()` — shared NLU
  (`src/lib/acquisition/role-classifier.ts`) with a 0.55 confidence floor
  and a 7-value role vocabulary (`PASSENGER`, `DRIVER`,
  `DISPATCHER_INTERMEDIARY`, `PARCEL_CARGO_POST`, `BUSINESS_ADVERTISEMENT`,
  `DELIVERY_EXECUTOR`, `CARGO_CARRIER`) plus `IRRELEVANT_SPAM`/`AMBIGUOUS`.
- `src/lib/prospecting/` — the shared Prospecting Core added on top of the
  above (see s.4 below): the `ProspectType`/`ProspectHandoff` vocabulary and
  `createProspectHandoff`/`acceptProspectHandoff`/`rejectProspectHandoff`
  lifecycle every contragent's handoff goes through.

All five contragents exist as agents in `AGENT_REGISTRY`
(`src/lib/agents/registry.ts`):

| # | Existing module | AgentName | Actually implements | Own Prisma model |
|---|---|---|---|---|
| 1 | `src/lib/passenger-contractor/` | `PASSENGER_CONTRACTOR` | Passenger Acquisition | `PassengerProspect` |
| 2 | `src/lib/driver-contractor/` | `DRIVER_CONTRACTOR` | Driver Acquisition | `ScoutCandidate` (SCOUT's existing pipeline — no separate model) |
| 3 | `src/lib/delivery-executor-contractor/` | `DELIVERY_EXECUTOR_CONTRACTOR` | Delivery Executor Acquisition | `DeliveryExecutorProspect` |
| 4 | `src/lib/cargo-carrier-contractor/` | `CARGO_CARRIER_CONTRACTOR` | Cargo Carrier Acquisition | `CargoCarrierProspect` |
| 5 | `src/lib/delivery-contractor/` | `DELIVERY_CONTRACTOR` | **Business Customer Acquisition** | `BusinessProspect` + `DeliveryCrmEvent` |

**Naming mismatch, documented rather than silently fixed:** despite its
name, `delivery-contractor`'s `BusinessSightingInput` /
`processBusinessMarketSighting` / `qualifyBusinessProspect` /
`agreeBusinessPartnership` (`src/lib/delivery-contractor/orchestrator.ts`)
target **businesses** (shops, cafes, warehouses — Contragent #5's mandate),
not delivery-workforce executors (Contragent #3's mandate, which is the
genuinely distinct `delivery-executor-contractor` module above). Renaming
`delivery-contractor` remains an out-of-scope breaking change — called out
here so nobody confuses the two modules by name alone.

`AcquisitionProspectType` (`prisma/schema.prisma`) now has all five values —
`DRIVER`, `PASSENGER`, `BUSINESS`, `DELIVERY_EXECUTOR`, `CARGO_CARRIER` —
one per contragent. It is **not** string-identical to `ProspectType`
(`src/lib/prospecting/types.ts`); `handoff.ts`'s
`toAcquisitionProspectType`/`fromAcquisitionProspectType` is the single
explicit, tested mapping point between the two vocabularies.

## 2. Function chain (all five contragents)

```
SEARCH -> DISCOVER -> QUALIFY -> CONTACT -> OFFER -> FOLLOW-UP -> RESPONSE -> HANDOFF
```

After a positive response, the internal agent of the relevant direction
continues the relationship — the contragent never keeps leading it (spec
s.14/s.15/s.16). Once `acceptProspectHandoff` transitions a handoff to
`ACCEPTED`, the originating contragent has no further write surface over
that lead.

## 3. Handoff targets per contragent

| # | Contragent | `ProspectType` | Hands off to |
|---|---|---|---|
| 1 | Passenger Acquisition | `PASSENGER_DEMAND` | Mira / Passenger Operations / Akzhol |
| 2 | Driver Acquisition | `DRIVER_SUPPLY` | RT OFFICE |
| 3 | Delivery Executor Acquisition | `DELIVERY_EXECUTOR_SUPPLY` | Sapar / Delivery Operations |
| 4 | Cargo Carrier Acquisition | `CARGO_CARRIER_SUPPLY` | Cargo Operations |
| 5 | Business Customer Acquisition (`delivery-contractor`) | `BUSINESS_CUSTOMER` | Zholaman (small/ordinary delivery) or Cargo Operations (freight needs) |

`HANDOFF_TARGETS` in `src/lib/prospecting/types.ts` encodes this table, and
`createProspectHandoff` (`src/lib/prospecting/handoff.ts`) rejects any
target outside it (`InvalidHandoffTargetError`) before touching the
database. Contragent #4 also lays groundwork for future **backhaul**
discovery (finding transport returning empty/partially empty that can take
a matching load back) — see [delivery-cargo.md](./delivery-cargo.md) s.8;
no backhaul-matching engine exists yet, only the free-text `backhaulText`
claim captured on a `CargoCarrierProspect`.

## 4. Prospecting Core — real implementation (`src/lib/prospecting/`)

- **`types.ts`** — the `ProspectType`/`ProspectStatus`/`HandoffStatus`
  vocabulary, `HANDOFF_TARGETS`, `canHandoff()` (invariant #10:
  `OPTED_OUT`/`REJECTED`/`DUPLICATE` are never valid for a new handoff), and
  `isAcceptedHandoff()`.
- **`identity.ts`** — `computeContactFingerprint()`: a normalized
  cross-contragent identity (`phone:<normalized>` wins over
  `tg:<handle>`) threaded through every contragent's `sendAcquisitionOutreach`
  and `createProspectHandoff` calls, so an opt-out recorded against one
  contragent's prospect blocks every other contragent from reaching the same
  real person under a different `prospectType`/`prospectRef`.
- **`handoff.ts`** — the real `ProspectHandoff` Prisma model's read/write
  surface: `createProspectHandoff` (P2002-idempotent, target-validated,
  opt-out-checked both per-prospect and per-fingerprint),
  `acceptProspectHandoff`/`rejectProspectHandoff`/
  `requestMoreInfoOnHandoff`/`returnHandoffToReady`/`markHandoffDuplicate`
  (all CAS-guarded via `updateMany({where: {status: {in: fromStatuses}}})` +
  `count === 1`, so concurrent accept/reject races resolve deterministically
  rather than double-applying), and the read-only
  `recentProspectHandoffs()`/`handoffsForProspect()`/`getProspectHandoff()`
  used by the dispatcher.

`ProspectHandoff` (Prisma): `id, prospectType, prospectRef, sourceAgent,
targetAgentOrDepartment, status (READY | ACCEPTED | REJECTED |
NEEDS_MORE_INFO | DUPLICATE), expressedInterest, summary, contactData,
requestedService, availableCapabilities, conversationReference,
sourceReferences, contactFingerprint, decisionNote, decidedBy,
idempotencyKey (unique), createdAt, updatedAt, acceptedAt, rejectedAt`.
Accepting a handoff only ever updates this one row — it never itself
creates or duplicates a `Partner`/`Driver`/`Passenger`/`Shipment`
(invariant #9 — see [partner-registry.md](./partner-registry.md)); a
`ProspectHandoff` carries referential contact data, not a Partner-shaped
payload. `src/lib/prospecting/boundary.test.ts` statically enforces that
nothing under `src/lib/prospecting/` ever calls
`db.partner/driver/passenger/tripRequest/shipment/scoutCandidate.create`
directly, and `src/lib/prospecting/no-duplicate-engines.test.ts` statically
enforces there is exactly one definition each of `computeMarketGap`,
`proposeMatchesForRequest`, `recordOperationalEvent`,
`sendAcquisitionOutreach`, `classifyMarketRole`, and
`createProspectHandoff` anywhere in `src/`.

## 5. Zholaman and Sapar are not duplicated

Zholaman (`src/lib/sapargul/zholaman.ts`'s `paymentStatusForJolaman()` today
— no dedicated folder yet) continues negotiation, relationship-building, and
active-partner development **after** Contragent #5 hands off a business
lead; Contragent #5 does cold search/first contact/initial qualification
only. Sapar continues to own real-order intake (CargoProfile collection,
Safety Gate, executor selection) — prospecting is not folded into Sapar, and
Sapar is not turned into a mass-outreach bot. Delivery Executor and Cargo
Carrier acquisition (#3/#4) hand off *to* Sapar/Cargo Operations the same
way — they never assign a delivery or confirm cargo safety themselves
(`src/lib/delivery-executor-contractor/boundary.test.ts` and
`src/lib/cargo-carrier-contractor/boundary.test.ts` statically forbid
importing `crm-auto/orchestrator`'s or `matching/orchestrate`'s mutation
functions).

## 6. Legal/opt-out rules (spec s.13)

Every prospect record carries: source, discoveredAt, contact identity,
contact-attempt history, last-contact time, response status, owner agent,
handoff status, opt-out flag. `canHandoff()` (`src/lib/prospecting/types.ts`)
enforces invariant #10. The authoritative, append-only opt-out store remains
`isDoNotContact()`/`isDoNotContactFingerprint()`/`recordOptOut()`
(`src/lib/acquisition/outreach-log.ts`) — `canHandoff()` is a handoff-time
guard on top of it, not a second store. Contragents must only use legally
and publicly available information; no CAPTCHA bypass, no closed-account
scraping, no bypassing platform technical restrictions.

## 7. Unverified claims never become Partner Registry facts

A Cargo Carrier or Delivery Executor prospect's stated tonnage,
temperature-control, zone coverage, or backhaul availability is captured
verbatim as free-text (`capacityText`/`temperatureCapability`/`zonesText`/
`backhaulText` on the classification; `availableCapabilities` on the
handoff) and carried through unmodified — never independently verified,
never promoted automatically into a trusted `Partner`/`TransportAsset` row.
`src/lib/cargo-carrier-contractor/orchestrator.test.ts` asserts this
explicitly for the handoff path; only Cargo Operations, acting on the
accepted handoff, decides whether a claim becomes a Partner Registry fact.

## 8. Reserved event names (spec s.20)

`src/lib/prospecting/types.ts` reserves three namespaces of future
domain-event names — `PROSPECTING_EVENT_NAMES`,
`PARTNER_REGISTRY_EVENT_NAMES`, `DELIVERY_CARGO_EVENT_NAMES` — checked
against every existing `logAgentAction`/`details.event` call site for
collisions (none found; `src/lib/prospecting/types.test.ts` asserts no name
is reserved twice). RT has no central event bus; every "event" is an
`AuditLogEntry` row read by `agentName` + `details.event`
(`src/lib/agents/trace.ts`'s `logAgentAction`). These names are a
reservation only — nothing emits them yet.

## 9. Dispatcher visibility

`/dispatcher/prospecting` (`src/app/dispatcher/(app)/prospecting/page.tsx`)
is the one shared, cross-contragent feed — it reads
`recentProspectHandoffs()` directly, the same function `acceptProspectHandoff`
et al. operate on, so there is no second read model to keep in sync.
Driver/Passenger/Delivery additionally have their own dedicated
per-contractor pages (`/dispatcher/driver-contractor`,
`/dispatcher/passenger-contractor`, `/dispatcher/delivery-contractor`);
Delivery Executor and Cargo Carrier do not have a dedicated page yet and are
visible only through the shared `/dispatcher/prospecting` feed.

## 10. Test coverage (spec s.14, items A-T)

The full acceptance list lives across these files — see each for the exact
test names: `src/lib/prospecting/handoff.test.ts` (A-D, F, P),
`src/lib/prospecting/types.test.ts`, `src/lib/prospecting/boundary.test.ts`,
`src/lib/prospecting/no-duplicate-engines.test.ts` (T),
`src/lib/acquisition/outreach-log.test.ts` (E, G, S),
`src/lib/acquisition/role-classifier.test.ts` (Q, R),
`src/lib/{driver,passenger}-contractor/orchestrator.test.ts` (H, I, M, N, Q),
`src/lib/delivery-contractor/orchestrator.test.ts` (J),
`src/lib/{delivery-executor,cargo-carrier}-contractor/orchestrator.test.ts`
(K, L, N, O).

## 11. What this stage deliberately does not do

No five independent scrapers, no shared prospecting database beyond
`src/lib/acquisition/` + `src/lib/prospecting/`'s existing tables, no
mass-mailing campaigns, no real platform integrations, no dedicated
dispatcher page for Contragents #3/#4 yet, no renaming of
`delivery-contractor`. LLM use here is limited to qualifying prospects and
drafting personalized outreach copy — it never decides opt-out validity,
rate-limit state, or handoff acceptance (those stay deterministic, per spec
s.21 — see also [delivery-cargo.md](./delivery-cargo.md) s.5 on the same
principle for shipment classification).
