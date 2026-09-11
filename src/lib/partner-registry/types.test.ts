import { describe, expect, it } from "vitest";
import { capabilitiesFromPartnerType, hasCapability, hasCargoCapableAsset, type PartnerCapabilityProfile, type TransportAsset } from "./types";
import { CARGO_VEHICLE_CLASSES } from "../cargo-profile/vehicle-taxonomy";

function profile(overrides: Partial<PartnerCapabilityProfile> = {}): PartnerCapabilityProfile {
  return {
    partnerId: "partner-1",
    capabilities: [],
    transportAssets: [],
    regions: [],
    verifiedStatus: "UNVERIFIED",
    cooperationStatus: "PROSPECT",
    optOutStatus: false,
    notes: "UNKNOWN",
    ...overrides,
  };
}

function asset(overrides: Partial<TransportAsset> = {}): TransportAsset {
  return {
    assetId: "asset-1",
    partnerId: "partner-1",
    vehicleClass: "MINIVAN",
    makeModel: "UNKNOWN",
    payloadKg: "UNKNOWN",
    cargoVolumeM3: "UNKNOWN",
    internalDimensions: "UNKNOWN",
    bodyType: "UNKNOWN",
    refrigeration: "UNKNOWN",
    equipment: [],
    regions: [],
    status: "ACTIVE",
    currentAvailability: "UNKNOWN",
    ...overrides,
  };
}

describe("invariant #7/#8: a Partner may hold multiple capabilities and multiple transport assets across Delivery and Cargo", () => {
  it("hasCapability finds a tag among several held simultaneously", () => {
    const p = profile({ capabilities: ["PASSENGER_TRANSPORT", "CARGO_CARRIER", "DELIVERY_COURIER"] });
    expect(hasCapability(p, "CARGO_CARRIER")).toBe(true);
    expect(hasCapability(p, "TOW_SERVICE")).toBe(false);
  });

  it("hasCargoCapableAsset is true once one asset in the fleet is cargo-ladder class, even alongside delivery-class assets", () => {
    const p = profile({ transportAssets: [asset({ assetId: "a1", vehicleClass: "MINIVAN" }), asset({ assetId: "a2", vehicleClass: "SPRINTER_CLASS" })] });
    expect(hasCargoCapableAsset(p, CARGO_VEHICLE_CLASSES)).toBe(true);
  });

  it("hasCargoCapableAsset is false when every asset is delivery-ladder class", () => {
    const p = profile({ transportAssets: [asset({ vehicleClass: "MINIVAN" }), asset({ assetId: "a2", vehicleClass: "PASSENGER_CAR" })] });
    expect(hasCargoCapableAsset(p, CARGO_VEHICLE_CLASSES)).toBe(false);
  });
});

describe("capabilitiesFromPartnerType — bridges existing PartnerType enum without duplicating it", () => {
  it("maps DRIVER_FLEET to passenger transport", () => {
    expect(capabilitiesFromPartnerType("DRIVER_FLEET")).toEqual(["PASSENGER_TRANSPORT"]);
  });

  it("maps COURIER and LAST_MILE to delivery courier", () => {
    expect(capabilitiesFromPartnerType("COURIER")).toEqual(["DELIVERY_COURIER"]);
    expect(capabilitiesFromPartnerType("LAST_MILE")).toEqual(["DELIVERY_COURIER"]);
  });

  it("falls back to OTHER for point-of-interest partner types and unknown values", () => {
    expect(capabilitiesFromPartnerType("CAFE")).toEqual(["OTHER"]);
    expect(capabilitiesFromPartnerType("SOMETHING_NEW")).toEqual(["OTHER"]);
  });
});
