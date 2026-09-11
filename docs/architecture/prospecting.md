# RT Prospecting — five contragents, one shared core

RT's external commercial/prospecting layer finds demand and supply (new
passengers, drivers, delivery executors, cargo carriers, business customers)
and hands off a qualified, interested lead to the relevant internal agent.
This document fixes how the five contragents described below map onto what
already exists, and what a shared Prospecting Core adds on top. See
[ADR 0001](../adr/0001-delivery-cargo-separation.md) s.5 for the decision
record.

## 1. What already exists (do not duplicate)

`src/lib/acquisition/` is already the shared safety-gate infrastructure
every contragent must use:

- `sendAcquisitionOutreach()` (`outreach-log.ts`) — do-not-contact check ->
  3-day rate-limit cooldown -> `ACQUISITION_OUTREACH_MODE`
  (LIVE/SANDBOX/DRY_RUN) -> honest `NO_PROVIDER_CONFIGURED`/`FAILED` states
  -> P2002-idempotent dedup on write.
- `isDoNotContact()` / `recordOptOut()` — append-only opt-out derivation.
- `classifyMarketRole()` / `isActionableClassification()` — shared NLU with
  a 0.55 confidence floor.

Three of the five contragents already exist as agents in
`AGENT_REGISTRY` (`src/lib/agents/registry.ts`):

| Existing module | AgentName | Actually implements |
|---|---|---|
| `src/lib/passenger-contractor/` | `PASSENGER_CONTRACTOR` | Contragent #1 — Passenger Acquisition |
| `src/lib/driver-contractor/` | `DRIVER_CONTRACTOR` | Contragent #2 — Driver Acquisition |
| `src/lib/delivery-contractor/` | `DELIVERY_CONTRACTOR` | **Contragent #5 — Business Customer Acquisition** |

**Naming mismatch, documented rather than silently fixed:** despite its
name, `delivery-contractor`'s `BusinessSightingInput` /
`processBusinessMarketSighting` / `qualifyBusinessProspect` /
`agreeBusinessPartnership` (`src/lib/delivery-contractor/orchestrator.ts`)
target **businesses** (shops, cafes, warehouses — Contragent #5's mandate),
not delivery-workforce executors (Contragent #3's mandate). Renaming this
module is an out-of-scope breaking change for this pass — it is called out
here so nobody builds a second "Contragent #5" module under a more accurate
name, and so a future rename is a deliberate, reviewed decision rather than
a surprise.

Contragents #3 (Delivery Executor Acquisition) and #4 (Cargo Carrier
Acquisition) have **no existing module or agent** and are not created in
this pass (spec explicitly defers this — see s.6 below). `ProspectType`
(`src/lib/prospecting/types.ts`) reserves their vocabulary
(`DELIVERY_EXECUTOR_SUPPLY`, `CARGO_CARRIER_SUPPLY`) so a future
`DELIVERY_EXECUTOR_CONTRACTOR`/`CARGO_CARRIER_CONTRACTOR` pair has a stable
name to onboard against, following the existing 5-step "onboarding a new
agent" checklist (`docs/AGENT_CONSTITUTION.md` s.7).

`AcquisitionProspectType` (`prisma/schema.prisma`) only has `DRIVER`,
`PASSENGER`, `BUSINESS` today — the three contragents with a live module.
`ProspectType`'s other two members are documented extension points, not a
schema change.

## 2. Function chain (all five contragents)

```
SEARCH -> DISCOVER -> QUALIFY -> CONTACT -> OFFER -> FOLLOW-UP -> RESPONSE -> HANDOFF
```

After a positive response, the internal agent of the relevant direction
continues the relationship — the contragent never keeps leading it (spec
s.14/s.15/s.16).

## 3. Handoff targets per contragent

| # | Contragent | `ProspectType` | Hands off to |
|---|---|---|---|
| 1 | Passenger Acquisition | `PASSENGER_DEMAND` | Mira / Passenger Operations / Akzhol |
| 2 | Driver Acquisition | `DRIVER_SUPPLY` | RT OFFICE |
| 3 | Delivery Executor Acquisition (future) | `DELIVERY_EXECUTOR_SUPPLY` | Sapar / Delivery Operations |
| 4 | Cargo Carrier Acquisition (future) | `CARGO_CARRIER_SUPPLY` | Cargo Operations |
| 5 | Business Customer Acquisition (`delivery-contractor` today) | `BUSINESS_CUSTOMER` | Zholaman (small/ordinary delivery) or Cargo Operations (freight needs) |

`HANDOFF_TARGETS` in `src/lib/prospecting/types.ts` encodes this table.
Contragent #4 also lays groundwork for future **backhaul** discovery
(finding transport returning empty/partially empty that can take a matching
load back) — see [delivery-cargo.md](./delivery-cargo.md) s.8; no backhaul
engine exists yet.

## 4. ProspectHandoff contract (spec s.14, verbatim shape)

`src/lib/prospecting/types.ts`'s `ProspectHandoff`: `handoffId`,
`prospectId`, `sourceAgent`, `targetAgentOrDepartment`, `prospectType`,
`expressedInterest`, `summary`, `contactData`, `requestedService`,
`availableCapabilities`, `conversationReference`, `sourceReferences`,
`createdAt`, `status` (`READY | ACCEPTED | REJECTED | NEEDS_MORE_INFO |
DUPLICATE`). `isAcceptedHandoff()` checks `status === "ACCEPTED"` — the only
point at which ownership transfers to the internal contour. Creating a
handoff never itself creates or duplicates a `Partner`
(invariant #9 — see [partner-registry.md](./partner-registry.md)); a
`ProspectHandoff` carries referential contact data, not a Partner-shaped
payload.

## 5. Zholaman and Sapar are not duplicated

Zholaman (`src/lib/sapargul/zholaman.ts`'s `paymentStatusForJolaman()` today
— no dedicated folder yet) continues negotiation, relationship-building, and
active-partner development **after** Contragent #5 hands off a business
lead; Contragent #5 does cold search/first contact/initial qualification
only. Sapar continues to own real-order intake (CargoProfile collection,
Safety Gate, executor selection) — prospecting is not folded into Sapar, and
Sapar is not turned into a mass-outreach bot.

## 6. Legal/opt-out rules (spec s.13)

Every prospect record must carry: source, discoveredAt, contact identity,
contact-attempt history, last-contact time, response status, owner agent,
handoff status, opt-out flag. `canHandoff()` (`src/lib/prospecting/types.ts`)
enforces invariant #10: `OPTED_OUT`, `REJECTED`, and `DUPLICATE` prospects
are never valid for a new handoff. The authoritative, append-only opt-out
store remains `isDoNotContact()`/`recordOptOut()`
(`src/lib/acquisition/outreach-log.ts`) — `canHandoff()` is a handoff-time
guard on top of it, not a second store. Contragents must only use legally
and publicly available information; no CAPTCHA bypass, no closed-account
scraping, no bypassing platform technical restrictions.

## 7. Reserved event names (spec s.20)

`src/lib/prospecting/types.ts` reserves three namespaces of future
domain-event names — `PROSPECTING_EVENT_NAMES`,
`PARTNER_REGISTRY_EVENT_NAMES`, `DELIVERY_CARGO_EVENT_NAMES` — checked
during this task's audit against every existing `logAgentAction`/
`details.event` call site for collisions (none found). RT has no central
event bus; every "event" is an `AuditLogEntry` row read by `agentName` +
`details.event` (`src/lib/agents/trace.ts`'s `logAgentAction`). These names
are a reservation only — nothing emits them yet.

## 8. What this stage deliberately does not do

No five independent scrapers, no shared prospecting database beyond
`src/lib/acquisition/`'s existing tables, no mass-mailing campaigns, no real
platform integrations, no new agent registration for Contragents #3/#4, no
renaming of `delivery-contractor`. LLM use here is limited to qualifying
prospects and drafting personalized outreach copy — it never decides opt-out
validity, rate-limit state, or handoff acceptance (those stay deterministic,
per spec s.21 — see also [delivery-cargo.md](./delivery-cargo.md) s.5 on the
same principle for shipment classification).
