# ADR 0001: Scaffold RT Delivery / RT Cargo / RT Prospecting as separate domains

- Status: Accepted
- Date: 2026-09-11

This is the first ADR in this repository. Format: Context, Decision,
Consequences. Future architectural decisions worth recording as a discrete,
dated choice (not derivable from reading the code) should follow this same
shape as `docs/adr/NNNN-title.md`.

## Context

RT currently runs passenger transport (Mira/matching), a single
undifferentiated cargo/parcel flow (Sapar), and three market-acquisition
contractors (`passenger-contractor`, `driver-contractor`,
`delivery-contractor`). As RT grows into distinct delivery (courier/
documents/food/small parcels) and cargo (moves, furniture, construction
materials, machinery, commercial freight, trucks, containers, rail) markets,
the codebase needs a foundation that keeps these separate without either (a)
building a second, disconnected system per market, or (b) collapsing
everything into one mega-CRM. A full audit of the existing architecture
(agent registry, Sapar, the three contractors, `src/lib/acquisition/`, the
`Partner`/`DeliveryExecutor`/`AcquisitionProspectType` schema, and the docs
structure) preceded this decision — see [delivery-cargo.md](../architecture/delivery-cargo.md),
[partner-registry.md](../architecture/partner-registry.md), and
[prospecting.md](../architecture/prospecting.md) for what that audit found.

## Decision

1. **Delivery != Cargo.** They are different operational contours with
   different vehicle ladders, different handling requirements, and
   (eventually) different CRMs. Sapar's existing authority over today's
   single contour is unchanged; a future split happens through a documented
   `DeliveryCargoRouter` contract, not a rewrite.
2. **150kg is not a hard threshold.** Service classification is never
   `weight > X`. It runs through CargoProfile -> TransportRequirements ->
   vehicle-class fit. Enforced as `NO_SINGLE_WEIGHT_THRESHOLD_ROUTING` in
   `src/lib/cargo-profile/router.ts`, with tests covering both directions
   (a 150kg shipment that stays Delivery, and one that becomes Cargo).
3. **The Partner Registry is shared.** One `Partner` (existing Prisma model)
   can hold multiple `PartnerCapability` tags and multiple `TransportAsset`
   rigs spanning both Delivery and Cargo vehicle classes. No second partner
   table is created.
4. **Delivery CRM and Cargo CRM are separate**, and neither is mixed with
   Passenger CRM or Drive CRM. Cross-CRM references are by ID plus RT Core
   audit events, never a shared write path.
5. **Five prospecting contragents share one Prospecting Core.** All five use
   `src/lib/acquisition/`'s existing safety-gate/opt-out infrastructure and
   the new `ProspectType`/`ProspectHandoff` vocabulary
   (`src/lib/prospecting/types.ts`), rather than five independent scraper/
   database stacks.
6. **Prospectors hand off; they don't operate.** A contragent's ownership of
   a lead ends at `ProspectHandoff` acceptance; the receiving internal agent
   (Mira, RT OFFICE, Sapar, Cargo Operations, or Zholaman) takes over the
   relationship from there.
7. **No agent name is assigned to Cargo yet.** "Cargo Operations"/"Cargo
   CRM"/"Cargo Matching"/"Cargo Order" are used as neutral namespaces
   pending a separate Founder decision on a named Cargo agent.
8. **The `delivery-contractor` naming mismatch is documented, not silently
   fixed.** It actually implements Contragent #5 (Business Customer
   Acquisition), not Contragent #3 (Delivery Executor Acquisition) — see
   [prospecting.md](../architecture/prospecting.md) s.1. Renaming it is a
   distinct, out-of-scope decision.

## Consequences

- `src/lib/cargo-profile/`, `src/lib/partner-registry/`, and
  `src/lib/prospecting/` are new, dependency-free (no `@/lib/db` import)
  TypeScript modules — pure types, a deterministic classifier, and small
  pure helper functions, each with a `boundary.test.ts` enforcing the
  no-db/no-cross-domain-write rule statically (same pattern as
  `crm-auto/boundary.test.ts` etc.).
- No `prisma/schema.prisma` change, no new agent registration, and no
  existing module (Sapar, the three contractors, `src/lib/acquisition/`) was
  modified in this pass — this is additive scaffolding only.
- Two contragents (#3 Delivery Executor Acquisition, #4 Cargo Carrier
  Acquisition) and the Cargo CRM itself remain undecided/unbuilt on purpose;
  `ProspectType` and the reserved event-name constants exist so that future
  work has a name and a slot to build into instead of inventing one under
  time pressure.
- Follow-on work (a real Cargo CRM, the two missing contragent agents,
  wiring the reserved event names into `logAgentAction` calls, a production
  `DeliveryCargoRouter` used by Sapar) should treat this ADR and the three
  architecture documents as the approved model to build from, rather than
  redesigning the boundary from scratch.
