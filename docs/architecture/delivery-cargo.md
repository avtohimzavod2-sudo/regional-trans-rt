# RT Delivery vs. RT Cargo — architectural boundary

This document fixes the foundation for splitting today's single,
undifferentiated Sapar cargo/parcel flow into two operational contours — RT
Delivery (courier/documents/food/small parcels) and RT Cargo (moves,
furniture, construction materials, machinery, commercial freight, trucks,
tow trucks, containers, rail) — without breaking Sapar or building either
contour's full production system today. See [ADR 0001](../adr/0001-delivery-cargo-separation.md)
for the decision record and [`docs/RT_ORGANIZATION.md`](../RT_ORGANIZATION.md)
for how this fits the org chart.

## 1. What already exists (do not duplicate)

Sapar (`src/lib/sapar/`) already owns RT's live, single cargo/delivery
contour: `Shipment` / `ShipmentLeg` / `ShipmentQuote` / `DeliveryExecutor` /
`ShipmentIncident` (Prisma models), plus `ShipmentExtraction` and
`ShipmentCargoRequirements` (`src/lib/sapar/types.ts`) as the live
extraction/filtering surface for today's undifferentiated flow. Sapar's
`cargo_operational_status` / `assign_cargo_delivery_executor` capabilities
(`docs/AGENT_CONSTITUTION.md`) are unchanged by this document. Nothing here
migrates a Sapar field or touches `prisma/schema.prisma`.

`CargoProfile` / `TransportRequirements` (`src/lib/cargo-profile/types.ts`)
are a deliberate **superset** of `ShipmentExtraction` /
`ShipmentCargoRequirements` — the broader vocabulary a future
`DeliveryCargoRouter` needs once Delivery and Cargo are genuinely separate
CRMs (see [partner-registry.md](./partner-registry.md) for the equivalent
statement about the Partner registry).

## 2. The invariant: 150kg is not a hard threshold

**`weight <= 150kg => Delivery`, `weight > 150kg => Cargo` is wrong.** Weight
alone never determines service class. The real chain is:

```
Cargo Profile -> Transport Requirements -> Service Classification
              -> Suitable Vehicle Classes -> Candidate Executors
```

This is implemented as the architectural invariant **`NO_SINGLE_WEIGHT_THRESHOLD_ROUTING`**
in `src/lib/cargo-profile/router.ts`'s `classifyShipment()`. Worked examples
(also codified as tests in `router.test.ts`):

| Case | Weight | Signal that actually decides it | Outcome |
|---|---|---|---|
| A | 150kg personal baggage | normal volume, no special handling | Delivery-viable (wagon/minivan-class) |
| B | 150kg cast metal | tiny volume -> very high density (point load) | Cargo (Porter/light-truck-class) |
| C | 150kg down/insulation | very high volume for the weight | Cargo (Sprinter-class) |
| D | 80kg sofa | `oversized`/`furniture` flag | Cargo, despite low weight |
| E | 300kg compact boxes | fits Porter/Sprinter/minivan envelope | must NOT be forced onto a heavy truck |
| F | apartment move | multiple flags + loaders | Cargo, vehicle + loaders, possibly multiple trips |
| G | broken-down car | tow capability | Cargo / Special Transport |
| H | large intercity commercial lot | truck/fura/container/rail-scale requirements | Cargo, class depends on requirements |

Cases A–E are the ones with unit test coverage; F–H are documented as future
scenarios the same classifier is expected to extend to, not implemented
today.

## 3. CargoProfile and TransportRequirements are different concepts

`CargoProfile` (`src/lib/cargo-profile/types.ts`) describes **what is being
moved** — category, weight, volume, dimensions, handling flags, route,
scheduling. `TransportRequirements` describes **what resource is needed** —
minimum payload/volume/dimensions, body/equipment requirements, allowed or
excluded vehicle classes. `deriveTransportRequirements()` in `router.ts`
computes one from the other, but a human dispatcher can also set/override
`TransportRequirements` directly — it is never solely a derived value.

Every field on both types is `Known<T>` (`type Known<T> = T | "UNKNOWN" |
"NOT_PROVIDED"`, `isKnown()` guard) so the router can reason about partial
information without ever inventing a value nobody supplied — an LLM may
extract these fields from free text upstream, but must never fabricate an
absent one.

## 4. VehicleClass / ServiceClass taxonomy

`src/lib/cargo-profile/vehicle-taxonomy.ts` defines a brand-independent
ladder: `DeliveryVehicleClass` (FOOT_COURIER through
LIGHT_COMMERCIAL_VEHICLE) and `CargoVehicleClass` (PORTER_CLASS through
RAIL_WAGON). "Porter" and "Sprinter" are market-recognizable names for
`PORTER_CLASS`/`SPRINTER_CLASS` — used in dispatcher/customer conversation
only, never hardcoded as a brand check in the core. `VEHICLE_CLASS_ENVELOPE`
gives a conservative payload/volume capability per class;
`vehicleClassesSatisfying()` returns candidates smallest-suitable-first,
implementing the **"use the smallest suitable safe transport"** principle —
weighed against cost, route, availability, timing, and safety, never pure
size-minimization.

`DeliveryExecutor.vehicleType` (`prisma/schema.prisma`) remains a free-text
string today. This taxonomy is additive vocabulary for the future router; it
is not a migration of that column.

## 5. DeliveryCargoRouter contract

`classifyShipment(profile: CargoProfile)` (`src/lib/cargo-profile/router.ts`)
returns `{ classification: "DELIVERY" | "CARGO" | "MANUAL_REVIEW" |
"INSUFFICIENT_DATA", transportRequirements, suggestedVehicleClasses,
reasons, confidence }`. It is a pure, deterministic function — never an LLM
call (see [prospecting.md](./prospecting.md) and s.21 below on why). Rules,
in priority order:

1. No usable signal at all (every weight/volume/category field unknown) ->
   `INSUFFICIENT_DATA`.
2. `hazardous === true` -> `MANUAL_REVIEW`. Legal/safety permissibility is
   never auto-decided by this router.
3. Handling flags that structurally require a cargo-bodied vehicle
   (crane/manipulator/palletized/machinery/construction material/oversized/
   furniture/temperature-controlled) or a high density-hint (>= 400 kg/m3,
   a point-load proxy) restrict the search to `CARGO_VEHICLE_CLASSES` only,
   regardless of weight.
4. Otherwise, the full combined ladder is searched for the smallest class
   whose envelope satisfies the known payload/volume; if none of the
   delivery-ladder classes can, the search naturally lands on a cargo-ladder
   class (this is how cases C and E resolve without an explicit weight
   check).
5. No candidate anywhere satisfies the requirement -> `MANUAL_REVIEW`
   ("needs human sourcing"), never a fabricated vehicle class.

Full flow this plugs into (spec's future customer-facing pipeline, not all
implemented yet): `Customer Request -> Sapar/Cargo Intake -> CargoProfile ->
TransportRequirements -> DeliveryCargoRouter -> DELIVERY or CARGO ->
matching CRM -> Candidate Search -> Transport Capability Match ->
Quote/Assignment -> Execution`.

## 6. Cargo Operations is a namespace, not an agent

Per Founder decision deferral: this document uses only neutral names —
"Cargo Operations", "Cargo CRM", "Cargo Matching", "Cargo Order" — for the
future Cargo direction. No AI agent name is assigned to Cargo in this pass,
and Sapar's existing authority/contract is unchanged.

## 7. Cargo CRM boundary (future)

When built, Cargo CRM owns `CargoLead`, `CargoOrder`, `CargoProfile`,
`TransportRequirements`, `CargoCarrier`, `CargoVehicle`, `CargoQuote`,
`CargoAssignment`, `CargoTrip`, `CargoStatus`, plus multi-stop/loaders/
special-equipment/backhaul/recurring-route concerns. It must never be mixed
with Passenger CRM (Mira's), Drive CRM (passenger drivers), or Delivery CRM.
Cross-CRM references go through partner IDs and RT Core events/audit
entries, never a shared write path. See [partner-registry.md](./partner-registry.md)
s.4 for the source-of-truth table across all five CRMs/registries.

## 8. Backhaul (future extension point only)

Cargo CRM should eventually be able to match a vehicle finishing one route
(e.g. Bishkek -> Osh) against a compatible return load (Osh -> Bishkek) using
its current point, destination, planned return, available payload/volume,
and time window. `TransportAsset.currentAvailability`
(`src/lib/partner-registry/types.ts`) is the field reserved for this; no
matching engine for it exists yet, by design (spec s.18/s.23).

## 9. What this stage deliberately does not do

No Cargo CRM UI, no schema migration, no new agent registration, no
production matching engine, no naming of a future Cargo agent. This is a
skeleton so future RT Cargo work starts from an approved model instead of a
redesign. See spec s.23 for the full "don't overbuild" list this document
was written against.

## 10. Jolchu remains the only route/ETA source

`CargoProfile.routeDistanceKm` is documented as Jolchu-sourced when
available; nothing in `cargo-profile/` computes a route or ETA
independently.
