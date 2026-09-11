// VehicleClass / ServiceClass taxonomy (spec s.5). Brand-independent: "Porter"
// and "Sprinter" are market names dispatchers/customers use in conversation,
// never load-bearing identifiers in the core. PORTER_CLASS/SPRINTER_CLASS
// exist here as the class those names commonly refer to in the Kyrgyzstan
// market — the taxonomy does not otherwise reference any vehicle brand.
//
// `DeliveryExecutor.vehicleType` (prisma/schema.prisma) remains a free-text
// string today — this taxonomy is additive vocabulary for the future router,
// not a schema migration of that column.

export type DeliveryVehicleClass =
  | "FOOT_COURIER"
  | "BICYCLE"
  | "SCOOTER"
  | "MOPED"
  | "MOTORCYCLE"
  | "PASSENGER_CAR"
  | "WAGON_CAR"
  | "MINIVAN"
  | "SMALL_VAN"
  | "LIGHT_COMMERCIAL_VEHICLE";

export type CargoVehicleClass =
  | "PORTER_CLASS"
  | "SPRINTER_CLASS"
  | "LIGHT_TRUCK"
  | "MEDIUM_TRUCK"
  | "HEAVY_TRUCK"
  | "DUMP_TRUCK"
  | "BOX_TRUCK"
  | "REFRIGERATED_TRUCK"
  | "FLATBED"
  | "TOW_TRUCK"
  | "MANIPULATOR_TRUCK"
  | "TRACTOR_TRAILER"
  | "CONTAINER_CARRIER"
  | "SPECIAL_TRANSPORT"
  | "RAIL_CONTAINER"
  | "RAIL_WAGON";

export type VehicleClass = DeliveryVehicleClass | CargoVehicleClass;

export type ServiceClass = "DELIVERY" | "CARGO";

export const DELIVERY_VEHICLE_CLASSES: readonly DeliveryVehicleClass[] = [
  "FOOT_COURIER",
  "BICYCLE",
  "SCOOTER",
  "MOPED",
  "MOTORCYCLE",
  "PASSENGER_CAR",
  "WAGON_CAR",
  "MINIVAN",
  "SMALL_VAN",
  "LIGHT_COMMERCIAL_VEHICLE",
];

export const CARGO_VEHICLE_CLASSES: readonly CargoVehicleClass[] = [
  "PORTER_CLASS",
  "SPRINTER_CLASS",
  "LIGHT_TRUCK",
  "MEDIUM_TRUCK",
  "HEAVY_TRUCK",
  "DUMP_TRUCK",
  "BOX_TRUCK",
  "REFRIGERATED_TRUCK",
  "FLATBED",
  "TOW_TRUCK",
  "MANIPULATOR_TRUCK",
  "TRACTOR_TRAILER",
  "CONTAINER_CARRIER",
  "SPECIAL_TRANSPORT",
  "RAIL_CONTAINER",
  "RAIL_WAGON",
];

export function serviceClassOf(vehicleClass: VehicleClass): ServiceClass {
  return (DELIVERY_VEHICLE_CLASSES as readonly string[]).includes(vehicleClass) ? "DELIVERY" : "CARGO";
}

/** Rough, deliberately conservative capability envelope per class — good
 * enough to rank "smallest suitable safe transport first" (spec s.17)
 * without pretending to be a real fleet-capacity database. A real Partner's
 * TransportAsset (src/lib/partner-registry/types.ts) always wins over this
 * table once one exists for a given vehicle. */
export const VEHICLE_CLASS_ENVELOPE: Record<VehicleClass, { maxPayloadKg: number; maxVolumeM3: number }> = {
  FOOT_COURIER: { maxPayloadKg: 15, maxVolumeM3: 0.05 },
  BICYCLE: { maxPayloadKg: 20, maxVolumeM3: 0.08 },
  SCOOTER: { maxPayloadKg: 25, maxVolumeM3: 0.1 },
  MOPED: { maxPayloadKg: 30, maxVolumeM3: 0.15 },
  MOTORCYCLE: { maxPayloadKg: 40, maxVolumeM3: 0.2 },
  PASSENGER_CAR: { maxPayloadKg: 100, maxVolumeM3: 0.4 },
  WAGON_CAR: { maxPayloadKg: 150, maxVolumeM3: 0.7 },
  MINIVAN: { maxPayloadKg: 300, maxVolumeM3: 2 },
  SMALL_VAN: { maxPayloadKg: 500, maxVolumeM3: 3 },
  LIGHT_COMMERCIAL_VEHICLE: { maxPayloadKg: 800, maxVolumeM3: 4 },
  PORTER_CLASS: { maxPayloadKg: 1000, maxVolumeM3: 5 },
  SPRINTER_CLASS: { maxPayloadKg: 1500, maxVolumeM3: 14 },
  LIGHT_TRUCK: { maxPayloadKg: 3000, maxVolumeM3: 20 },
  MEDIUM_TRUCK: { maxPayloadKg: 8000, maxVolumeM3: 35 },
  HEAVY_TRUCK: { maxPayloadKg: 20000, maxVolumeM3: 60 },
  DUMP_TRUCK: { maxPayloadKg: 20000, maxVolumeM3: 15 },
  BOX_TRUCK: { maxPayloadKg: 10000, maxVolumeM3: 40 },
  REFRIGERATED_TRUCK: { maxPayloadKg: 10000, maxVolumeM3: 40 },
  FLATBED: { maxPayloadKg: 20000, maxVolumeM3: 0 },
  TOW_TRUCK: { maxPayloadKg: 5000, maxVolumeM3: 0 },
  MANIPULATOR_TRUCK: { maxPayloadKg: 15000, maxVolumeM3: 20 },
  TRACTOR_TRAILER: { maxPayloadKg: 40000, maxVolumeM3: 90 },
  CONTAINER_CARRIER: { maxPayloadKg: 40000, maxVolumeM3: 76 },
  SPECIAL_TRANSPORT: { maxPayloadKg: 100000, maxVolumeM3: 200 },
  RAIL_CONTAINER: { maxPayloadKg: 28000, maxVolumeM3: 76 },
  RAIL_WAGON: { maxPayloadKg: 60000, maxVolumeM3: 120 },
};

/** All vehicle classes whose envelope satisfies a payload/volume requirement,
 * ordered smallest-suitable-first (spec s.17's "USE THE SMALLEST SUITABLE
 * SAFE TRANSPORT" principle) — the caller still applies any
 * allowed/excludedVehicleClasses filter from TransportRequirements. */
export function vehicleClassesSatisfying(minimumPayloadKg: number, minimumCargoVolumeM3: number): VehicleClass[] {
  const all = [...DELIVERY_VEHICLE_CLASSES, ...CARGO_VEHICLE_CLASSES];
  return all
    .filter((vc) => VEHICLE_CLASS_ENVELOPE[vc].maxPayloadKg >= minimumPayloadKg && VEHICLE_CLASS_ENVELOPE[vc].maxVolumeM3 >= minimumCargoVolumeM3)
    .sort((a, b) => VEHICLE_CLASS_ENVELOPE[a].maxPayloadKg - VEHICLE_CLASS_ENVELOPE[b].maxPayloadKg);
}
