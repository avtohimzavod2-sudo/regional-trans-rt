// DeliveryCargoRouter contract (spec s.7): CargoProfile -> TransportRequirements
// -> classification. Deterministic on purpose (spec s.21 — capacity/legality
// decisions are never LLM-decided); an LLM may populate a CargoProfile from
// free text upstream of this file, but never calls into or overrides this
// logic. The one hard architectural invariant this module exists to enforce:
//
//   NO_SINGLE_WEIGHT_THRESHOLD_ROUTING
//
// There is no `if (weightKg > 150) return "CARGO"` anywhere below. Every
// branch reasons about volume, density, handling flags, or the resulting
// vehicle-class fit — never weight alone. See router.test.ts for the worked
// examples (spec s.2/s.25) this guards against regressing.
import { type CargoProfile, densityHintOf, isKnown, type Known, type TransportRequirements } from "./types";
import {
  CARGO_VEHICLE_CLASSES,
  DELIVERY_VEHICLE_CLASSES,
  type VehicleClass,
  vehicleClassesSatisfying,
} from "./vehicle-taxonomy";

/** Above this density, a load is a structural/point-load concern even at
 * modest total weight (spec s.2 case 2 — "литое железо") and must be routed
 * onto a real cargo-bodied vehicle rather than a passenger-style interior. */
const HIGH_DENSITY_KG_PER_M3 = 400;

export type ShipmentClassification = "DELIVERY" | "CARGO" | "MANUAL_REVIEW" | "INSUFFICIENT_DATA";

export interface ClassificationResult {
  classification: ShipmentClassification;
  transportRequirements: TransportRequirements;
  suggestedVehicleClasses: VehicleClass[];
  reasons: string[];
  confidence: number;
}

function knownOrDefault<T>(value: Known<T>, fallback: T): T {
  return isKnown(value) ? value : fallback;
}

/** CargoProfile -> TransportRequirements (spec s.4/s.17). A human dispatcher
 * may still override the result directly — this is a starting point derived
 * from what's known, never a locked-in final answer. */
export function deriveTransportRequirements(profile: CargoProfile): TransportRequirements {
  const density = isKnown(profile.densityHint) ? profile.densityHint : densityHintOf(profile);
  const forcesCargoLadder = requiresCargoLadder(profile, density);

  const specialEquipment: string[] = [];
  if (profile.craneRequired === true) specialEquipment.push("CRANE");
  if (profile.manipulatorRequired === true) specialEquipment.push("MANIPULATOR");
  if (profile.liftgateRequired === true) specialEquipment.push("LIFTGATE");

  return {
    minimumPayloadKg: profile.totalWeightKg,
    minimumCargoVolumeM3: profile.volumeM3,
    minimumCargoLengthM: isKnown(profile.dimensions) ? profile.dimensions.lengthM : "UNKNOWN",
    minimumCargoWidthM: isKnown(profile.dimensions) ? profile.dimensions.widthM : "UNKNOWN",
    minimumCargoHeightM: isKnown(profile.dimensions) ? profile.dimensions.heightM : "UNKNOWN",
    enclosedBodyRequired: profile.liquid === true || profile.fragile === true ? true : "UNKNOWN",
    refrigerationRequired: profile.temperatureControlled,
    flatbedRequired: "UNKNOWN",
    liftgateRequired: profile.liftgateRequired,
    craneRequired: profile.craneRequired,
    towCapabilityRequired: "UNKNOWN",
    passengerSeatsRequired: "UNKNOWN",
    loadersRequired: profile.loadersRequired,
    railRequired: "UNKNOWN",
    containerRequired: "UNKNOWN",
    specialEquipment,
    allowedVehicleClasses: [],
    excludedVehicleClasses: forcesCargoLadder ? [...DELIVERY_VEHICLE_CLASSES] : [],
  };
}

/** Handling flags/density that structurally require a cargo-bodied vehicle
 * regardless of how little the raw weight/volume envelope would otherwise
 * demand (spec s.2 cases 2/4, s.5). Never weight alone — see module header. */
function requiresCargoLadder(profile: CargoProfile, density: Known<number>): boolean {
  return (
    profile.craneRequired === true ||
    profile.manipulatorRequired === true ||
    profile.palletized === true ||
    profile.machineryEquipment === true ||
    profile.constructionMaterial === true ||
    profile.oversized === true ||
    profile.furniture === true ||
    profile.temperatureControlled === true ||
    (isKnown(density) && density >= HIGH_DENSITY_KG_PER_M3)
  );
}

function hasAnyKnownSignal(profile: CargoProfile): boolean {
  const flagFields: (keyof CargoProfile)[] = [
    "totalWeightKg",
    "volumeM3",
    "category",
    "fragile",
    "liquid",
    "perishable",
    "temperatureControlled",
    "hazardous",
    "personalBaggage",
    "furniture",
    "constructionMaterial",
    "machineryEquipment",
    "food",
    "documents",
    "parcel",
    "palletized",
    "oversized",
  ];
  return flagFields.some((field) => isKnown(profile[field] as Known<unknown>));
}

/** Pure, deterministic classification. Never called with side effects, never
 * itself an LLM call — see module header. */
export function classifyShipment(profile: CargoProfile): ClassificationResult {
  const transportRequirements = deriveTransportRequirements(profile);
  const reasons: string[] = [];

  if (!hasAnyKnownSignal(profile)) {
    return {
      classification: "INSUFFICIENT_DATA",
      transportRequirements,
      suggestedVehicleClasses: [],
      reasons: ["no usable weight/volume/category signal on this CargoProfile"],
      confidence: 0,
    };
  }

  // Legality/safety is never auto-decided by this router (spec s.21) —
  // a hazardous flag always escalates to a human rather than picking a
  // vehicle class for it.
  if (profile.hazardous === true) {
    return {
      classification: "MANUAL_REVIEW",
      transportRequirements,
      suggestedVehicleClasses: [],
      reasons: ["hazardous cargo requires human review — never auto-routed"],
      confidence: 1,
    };
  }

  const density = isKnown(profile.densityHint) ? profile.densityHint : densityHintOf(profile);
  const forcedCargo = requiresCargoLadder(profile, density);
  if (forcedCargo) reasons.push("handling requirements or load density require a cargo-bodied vehicle, independent of total weight");

  const ladder = forcedCargo ? CARGO_VEHICLE_CLASSES : [...DELIVERY_VEHICLE_CLASSES, ...CARGO_VEHICLE_CLASSES];
  const minPayload = knownOrDefault(profile.totalWeightKg, 0);
  const minVolume = knownOrDefault(profile.volumeM3, 0);

  const candidates = vehicleClassesSatisfying(minPayload, minVolume).filter((vc) => (ladder as readonly VehicleClass[]).includes(vc));

  if (candidates.length === 0) {
    return {
      classification: "MANUAL_REVIEW",
      transportRequirements,
      suggestedVehicleClasses: [],
      reasons: [...reasons, "no known vehicle class envelope satisfies the requested payload/volume — needs human sourcing"],
      confidence: 0.5,
    };
  }

  const chosen = candidates[0];
  reasons.push(`smallest suitable vehicle class for payload=${minPayload}kg, volume=${minVolume}m3 is ${chosen}`);

  return {
    classification: (DELIVERY_VEHICLE_CLASSES as readonly string[]).includes(chosen) ? "DELIVERY" : "CARGO",
    transportRequirements,
    suggestedVehicleClasses: candidates.slice(0, 3),
    reasons,
    confidence: isKnown(profile.totalWeightKg) && isKnown(profile.volumeM3) ? 1 : 0.6,
  };
}
