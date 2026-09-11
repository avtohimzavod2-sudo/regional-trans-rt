// CargoProfile / TransportRequirements — dependency-free domain vocabulary
// for the future RT Delivery vs RT Cargo split (docs/architecture/delivery-cargo.md).
// No db/provider imports (mirrors src/lib/sapar/types.ts / src/lib/jolchu/types.ts):
// this file is pure contracts, never a second CRM.
//
// CargoProfile is a deliberate SUPERSET of Sapar's existing
// `ShipmentExtraction` (src/lib/sapar/types.ts) and `ShipmentCargoRequirements`
// (same file). Sapar's types stay exactly as they are — they are the real,
// live extraction/filtering surface for today's single undifferentiated
// cargo/parcel flow. CargoProfile is the broader future model a
// DeliveryCargoRouter needs once RT Delivery and RT Cargo become genuinely
// separate operational contours; nothing here replaces or migrates Sapar's
// fields today.
//
// Every field is optional/UNKNOWN-capable on purpose (spec s.3): the router
// must be able to reason about partial information without ever inventing a
// value nobody supplied. Use `isKnown()` rather than `!= null` checks so the
// "unknown vs. deliberately absent" distinction reads the same everywhere.

export type Known<T> = T | "UNKNOWN" | "NOT_PROVIDED";

export function isKnown<T>(value: Known<T> | undefined | null): value is T {
  return value !== undefined && value !== null && value !== "UNKNOWN" && value !== "NOT_PROVIDED";
}

export type CargoCategory =
  | "PERSONAL_BAGGAGE"
  | "FURNITURE"
  | "CONSTRUCTION_MATERIAL"
  | "MACHINERY_EQUIPMENT"
  | "FOOD"
  | "DOCUMENTS"
  | "PARCEL"
  | "PALLETIZED"
  | "OVERSIZED"
  | "OTHER";

export type LoadingMethod = "HAND_CARRY" | "TROLLEY" | "LIFTGATE" | "CRANE" | "MANIPULATOR" | "FORKLIFT" | "RAMP" | "OTHER";

/** What we are moving — never how we move it (see TransportRequirements).
 * Mirrors the field list in spec s.3 verbatim; grouped only for readability. */
export interface CargoProfile {
  cargoId: string;
  category: Known<CargoCategory>;
  description: Known<string>;

  // Mass / volume / shape — the inputs the 150kg-is-not-a-threshold
  // invariant (docs/architecture/delivery-cargo.md s.2) is built from.
  totalWeightKg: Known<number>;
  volumeM3: Known<number>;
  packageCount: Known<number>;
  dimensions: Known<{ lengthM: number; widthM: number; heightM: number }>;
  maxPieceWeightKg: Known<number>;
  maxPieceDimensions: Known<{ lengthM: number; widthM: number; heightM: number }>;
  /** kg/m3, derived from totalWeightKg/volumeM3 when both are known — a
   * router signal, never a customer-facing input. See densityHintOf() below. */
  densityHint: Known<number>;

  // Handling constraints.
  fragile: Known<boolean>;
  liquid: Known<boolean>;
  perishable: Known<boolean>;
  temperatureControlled: Known<boolean>;
  hazardous: Known<boolean>;

  // Category flags — a profile may legitimately have more than one true
  // (e.g. a house move is both FURNITURE and CONSTRUCTION_MATERIAL-adjacent).
  personalBaggage: Known<boolean>;
  furniture: Known<boolean>;
  constructionMaterial: Known<boolean>;
  machineryEquipment: Known<boolean>;
  food: Known<boolean>;
  documents: Known<boolean>;
  parcel: Known<boolean>;
  palletized: Known<boolean>;
  oversized: Known<boolean>;

  // Loading/unloading.
  loadingMethod: Known<LoadingMethod>;
  unloadingMethod: Known<LoadingMethod>;
  loadersRequired: Known<boolean>;
  liftgateRequired: Known<boolean>;
  craneRequired: Known<boolean>;
  manipulatorRequired: Known<boolean>;
  specialHandling: Known<string>;

  // Route/scheduling — routeDistance is populated from Jolchu when
  // available (never computed here; see docs/architecture/delivery-cargo.md
  // s.10 on Jolchu remaining the single route/ETA source).
  origin: Known<string>;
  destination: Known<string>;
  routeDistanceKm: Known<number>;
  pickupWindow: Known<{ start: string; end: string }>;
  deliveryWindow: Known<{ start: string; end: string }>;

  // House-move context.
  floor: Known<number>;
  elevatorAvailable: Known<boolean>;
  stairsOnly: Known<boolean>;

  photoRefs: string[];
  notes: Known<string>;
  /** Anything extracted from free text that doesn't map to a typed field
   * above yet — never silently dropped, never silently promoted to a typed
   * field without a schema change. */
  unknownFields: Record<string, string>;
}

/** What resource the shipment needs — never a vehicle brand/model. Produced
 * from a CargoProfile by deriveTransportRequirements() (router.ts), but kept
 * as a distinct type because a human dispatcher can also set/override these
 * directly (spec s.4: "CargoProfile != TransportRequirements"). */
export interface TransportRequirements {
  minimumPayloadKg: Known<number>;
  minimumCargoVolumeM3: Known<number>;
  minimumCargoLengthM: Known<number>;
  minimumCargoWidthM: Known<number>;
  minimumCargoHeightM: Known<number>;
  enclosedBodyRequired: Known<boolean>;
  refrigerationRequired: Known<boolean>;
  flatbedRequired: Known<boolean>;
  liftgateRequired: Known<boolean>;
  craneRequired: Known<boolean>;
  towCapabilityRequired: Known<boolean>;
  passengerSeatsRequired: Known<number>;
  loadersRequired: Known<boolean>;
  railRequired: Known<boolean>;
  containerRequired: Known<boolean>;
  specialEquipment: string[];
  allowedVehicleClasses: string[];
  excludedVehicleClasses: string[];
}

export function densityHintOf(profile: Pick<CargoProfile, "totalWeightKg" | "volumeM3">): Known<number> {
  if (!isKnown(profile.totalWeightKg) || !isKnown(profile.volumeM3) || profile.volumeM3 <= 0) return "UNKNOWN";
  return profile.totalWeightKg / profile.volumeM3;
}
