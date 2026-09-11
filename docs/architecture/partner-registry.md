# RT Partner Registry — one identity, many capabilities

RT works with partners (drivers, delivery executors, cargo carriers,
businesses) who frequently span more than one operational role — a single
carrier may run passenger cars, a minivan, a Sprinter, and a couple of
Porter-class trucks at once. This document fixes that a Partner has **one**
identity record with a **multi-valued** capability/asset profile, rather
than a copy of the same carrier duplicated per CRM. See
[ADR 0001](../adr/0001-delivery-cargo-separation.md) s.4 for the decision
record.

## 1. What already exists (do not duplicate)

`Partner` (`prisma/schema.prisma`) is already the single partner-identity
table: `id`, `type: PartnerType`, `name`, `contactPhone?`, `contactHandle?`,
`stopId?`, `notes?`, `isActive`, `createdAt`. `PartnerType` (`DRIVER_FLEET`,
`DISPATCHER`, `RT_POINT`, `CAFE`, `GAS_STATION`, `SUPERMARKET`, `COURIER`,
`LAST_MILE`, `OTHER`) is a single coarse category chosen at creation time.
Nothing in this document replaces `Partner` or `PartnerType`, and no schema
migration is made in this pass.

`DeliveryExecutor` (`prisma/schema.prisma`) is Sapar's existing
delivery-workforce model — its own separate concept from `Partner`, unaffected
by this document.

## 2. The gap this closes

`PartnerType` cannot express "this Partner has a minivan **and** a Sprinter
**and** does courier work" — it's one enum value per Partner row.
`src/lib/partner-registry/types.ts` adds:

- **`PartnerCapability`** — a granular, multi-valued tag set
  (`PASSENGER_TRANSPORT`, `DELIVERY_COURIER`, `CARGO_CARRIER`,
  `TOW_SERVICE`, `SPECIAL_TRANSPORT`, `LOADING_CREW`, `WAREHOUSE_STORAGE`,
  `OTHER`). A Partner can hold several simultaneously.
- **`TransportAsset`** — one vehicle/rig a Partner operates: `assetId`,
  `partnerId` (references `Partner.id`), `vehicleClass` (reuses
  `src/lib/cargo-profile/vehicle-taxonomy.ts`'s brand-independent taxonomy —
  no separate vehicle vocabulary was created), payload/volume/dimensions,
  body type, refrigeration, equipment, regions, status, and a
  `currentAvailability` field reserved for future backhaul matching (see
  [delivery-cargo.md](./delivery-cargo.md) s.8).
- **`PartnerCapabilityProfile`** — the capability/asset extension record for
  one `partnerId`: capabilities, transport assets, regions, verified/
  cooperation status, opt-out status, notes.

`capabilitiesFromPartnerType()` is a best-effort bridge from the existing
`PartnerType` string to the new granular set, so an existing `Partner` row
isn't left with an empty capability profile the day this module is adopted —
a real onboarding flow should still let a dispatcher correct it.

## 3. What this is not

`PartnerCapabilityProfile`/`TransportAsset` are pure TypeScript types with no
database access (`src/lib/partner-registry/boundary.test.ts` enforces this
statically) — not a new database table, not a second Partner Registry, and
not a replacement for any operational CRM. A `partnerId` is always a real
`Partner.id`; nothing here can create a Partner or a duplicate of one
(mirrors invariant #9 on `ProspectHandoff` — see
[prospecting.md](./prospecting.md)).

## 4. Source-of-truth table across all CRMs/registries

| Domain | Owns |
|---|---|
| Partner Registry | base partner identity + capabilities (this document) |
| Passenger CRM (Mira's) | passenger demand/relationships |
| Drive CRM | passenger drivers, vehicles, trips, seats |
| Delivery CRM (Sapar's `Shipment`/`DeliveryExecutor` today) | ordinary delivery operational orders |
| Cargo CRM (future) | cargo operational orders |
| Prospecting Core (`src/lib/acquisition/` + `src/lib/prospecting/`) | cold leads and the acquisition process |

No universal mega-CRM owns everything; cross-domain references are by ID
(`partnerId`, `prospectId`, …) plus RT Core audit events, never a shared
write path.

## 5. What this stage deliberately does not do

No new Prisma model, no PII-handling logic beyond what `Partner` already
has, no availability/scheduling engine, no automatic promotion of a prospect
into a Partner (see [prospecting.md](./prospecting.md) on `ProspectHandoff`
acceptance being a human/operational decision, not an automatic write).
