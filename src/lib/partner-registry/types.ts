// Partner Registry extension vocabulary (docs/architecture/partner-registry.md,
// spec s.8). Dependency-free — no db import — same pattern as
// src/lib/cargo-profile/types.ts.
//
// The registry itself already exists: Prisma's `Partner` model
// (prisma/schema.prisma) plus its `PartnerType` enum is the single source of
// partner identity today. This file does NOT redefine or duplicate that
// model — `partnerId` below is always `Partner.id`. What's missing today is
// the *granular, multi-valued* capability/transport-asset vocabulary spec s.8
// asks for ("one partner may simultaneously do passenger transport, own
// several minivans, a Sprinter, a Porter, several trucks, a courier
// service") — `PartnerType` is a single coarse enum picked at creation time
// and cannot express that. `PartnerCapabilityProfile`/`TransportAsset` are
// the additive layer that closes that gap without a schema migration yet.
import type { Known } from "../cargo-profile/types";
import type { VehicleClass } from "../cargo-profile/vehicle-taxonomy";

/** Granular, multi-valued capability tags — deliberately finer-grained than
 * `PartnerType` (prisma/schema.prisma), which stays as-is. A single Partner
 * commonly holds more than one of these at once. */
export type PartnerCapability =
  | "PASSENGER_TRANSPORT"
  | "DELIVERY_COURIER"
  | "CARGO_CARRIER"
  | "TOW_SERVICE"
  | "SPECIAL_TRANSPORT"
  | "LOADING_CREW"
  | "WAREHOUSE_STORAGE"
  | "OTHER";

export type PartnerVerifiedStatus = "UNVERIFIED" | "VERIFIED" | "REJECTED";

export type PartnerCooperationStatus = "PROSPECT" | "ACTIVE" | "INACTIVE" | "SUSPENDED";

export type TransportAssetStatus = "ACTIVE" | "INACTIVE" | "UNVERIFIED";

/** One vehicle/rig owned or operated by a Partner (spec s.8). `partnerId`
 * references `Partner.id`; this is never a copy of the Partner row itself. */
export interface TransportAsset {
  assetId: string;
  partnerId: string;
  vehicleClass: VehicleClass;
  makeModel: Known<string>;
  payloadKg: Known<number>;
  cargoVolumeM3: Known<number>;
  internalDimensions: Known<{ lengthM: number; widthM: number; heightM: number }>;
  bodyType: Known<string>;
  refrigeration: Known<boolean>;
  equipment: string[];
  regions: string[];
  status: TransportAssetStatus;
  /** Left for a future availability/scheduling integration (spec s.8, s.18
   * backhaul groundwork) — never populated by this module today. */
  currentAvailability: Known<{ availableFrom: string; region: string }>;
}

/** The capability/registry-extension record for one Partner. Always keyed by
 * an existing `Partner.id` — this type is never a substitute for the Partner
 * row and must never be persisted as though it were one (no db access lives
 * in this folder; see boundary.test.ts). */
export interface PartnerCapabilityProfile {
  partnerId: string;
  capabilities: PartnerCapability[];
  transportAssets: TransportAsset[];
  regions: string[];
  verifiedStatus: PartnerVerifiedStatus;
  cooperationStatus: PartnerCooperationStatus;
  optOutStatus: boolean;
  notes: Known<string>;
}

export function hasCapability(profile: Pick<PartnerCapabilityProfile, "capabilities">, capability: PartnerCapability): boolean {
  return profile.capabilities.includes(capability);
}

/** True once a Partner has at least one TransportAsset whose vehicleClass
 * envelope belongs to the cargo ladder (src/lib/cargo-profile/vehicle-taxonomy) —
 * i.e. this Partner is a candidate for Cargo Operations matching, regardless
 * of which capability tags they were originally onboarded with. */
export function hasCargoCapableAsset(profile: Pick<PartnerCapabilityProfile, "transportAssets">, cargoVehicleClasses: readonly VehicleClass[]): boolean {
  return profile.transportAssets.some((asset) => cargoVehicleClasses.includes(asset.vehicleClass));
}

/** Best-effort bridge from the existing coarse `PartnerType` (prisma enum,
 * passed as a plain string to keep this module Prisma-free) to the new
 * granular taxonomy — audit-driven default so existing Partner rows aren't
 * left with an empty capability set the day this module is adopted. A real
 * onboarding flow should still let a dispatcher pick the accurate set. */
export function capabilitiesFromPartnerType(partnerType: string): PartnerCapability[] {
  switch (partnerType) {
    case "DRIVER_FLEET":
      return ["PASSENGER_TRANSPORT"];
    case "COURIER":
    case "LAST_MILE":
      return ["DELIVERY_COURIER"];
    case "DISPATCHER":
    case "RT_POINT":
    case "CAFE":
    case "GAS_STATION":
    case "SUPERMARKET":
    case "OTHER":
    default:
      return ["OTHER"];
  }
}
