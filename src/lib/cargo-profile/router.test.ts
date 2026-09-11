import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CargoProfile } from "./types";
import { classifyShipment, deriveTransportRequirements } from "./router";

// Base profile with everything UNKNOWN — each test only fills in the fields
// the worked example actually specifies, per spec s.3/s.12: never invent data
// the router wasn't given.
function blankProfile(): CargoProfile {
  return {
    cargoId: "test-cargo",
    category: "UNKNOWN",
    description: "UNKNOWN",
    totalWeightKg: "UNKNOWN",
    volumeM3: "UNKNOWN",
    packageCount: "UNKNOWN",
    dimensions: "UNKNOWN",
    maxPieceWeightKg: "UNKNOWN",
    maxPieceDimensions: "UNKNOWN",
    densityHint: "UNKNOWN",
    fragile: "UNKNOWN",
    liquid: "UNKNOWN",
    perishable: "UNKNOWN",
    temperatureControlled: "UNKNOWN",
    hazardous: "UNKNOWN",
    personalBaggage: "UNKNOWN",
    furniture: "UNKNOWN",
    constructionMaterial: "UNKNOWN",
    machineryEquipment: "UNKNOWN",
    food: "UNKNOWN",
    documents: "UNKNOWN",
    parcel: "UNKNOWN",
    palletized: "UNKNOWN",
    oversized: "UNKNOWN",
    loadingMethod: "UNKNOWN",
    unloadingMethod: "UNKNOWN",
    loadersRequired: "UNKNOWN",
    liftgateRequired: "UNKNOWN",
    craneRequired: "UNKNOWN",
    manipulatorRequired: "UNKNOWN",
    specialHandling: "UNKNOWN",
    origin: "UNKNOWN",
    destination: "UNKNOWN",
    routeDistanceKm: "UNKNOWN",
    pickupWindow: "UNKNOWN",
    deliveryWindow: "UNKNOWN",
    floor: "UNKNOWN",
    elevatorAvailable: "UNKNOWN",
    stairsOnly: "UNKNOWN",
    photoRefs: [],
    notes: "UNKNOWN",
    unknownFields: {},
  };
}

describe("classifyShipment — NO_SINGLE_WEIGHT_THRESHOLD_ROUTING (spec s.2/s.7/s.24/s.25)", () => {
  it("case A: 150kg personal baggage in normal volume stays DELIVERY-viable (minivan/wagon-class)", () => {
    const profile = { ...blankProfile(), totalWeightKg: 150, volumeM3: 0.5, personalBaggage: true };
    const result = classifyShipment(profile);
    expect(result.classification).toBe("DELIVERY");
  });

  it("case B: 150kg of dense cast metal in tiny volume forces a cargo-bodied vehicle despite identical weight to case A", () => {
    const profile = { ...blankProfile(), totalWeightKg: 150, volumeM3: 0.05, constructionMaterial: true };
    const result = classifyShipment(profile);
    expect(result.classification).toBe("CARGO");
  });

  it("invariant #6: weight alone does not determine service class — same weight, different outcome", () => {
    const baggage = classifyShipment({ ...blankProfile(), totalWeightKg: 150, volumeM3: 0.5, personalBaggage: true });
    const denseMetal = classifyShipment({ ...blankProfile(), totalWeightKg: 150, volumeM3: 0.05, constructionMaterial: true });
    expect(baggage.classification).not.toBe(denseMetal.classification);
  });

  it("case C: 150kg of very low-density, high-volume cargo (down) requires a large van/Sprinter-class -> CARGO", () => {
    const profile = { ...blankProfile(), totalWeightKg: 150, volumeM3: 8 };
    const result = classifyShipment(profile);
    expect(result.classification).toBe("CARGO");
    expect(result.suggestedVehicleClasses[0]).toBe("SPRINTER_CLASS");
  });

  it("case D: 80kg oversized sofa classifies as CARGO despite low weight", () => {
    const profile = { ...blankProfile(), totalWeightKg: 80, volumeM3: 1.5, furniture: true, oversized: true };
    const result = classifyShipment(profile);
    expect(result.classification).toBe("CARGO");
  });

  it("case E: 300kg of compact, dense-enough boxes never gets pushed onto a medium/heavy truck", () => {
    const profile = { ...blankProfile(), totalWeightKg: 300, volumeM3: 1.5 };
    const result = classifyShipment(profile);
    const oversizedClasses = ["MEDIUM_TRUCK", "HEAVY_TRUCK", "TRACTOR_TRAILER", "CONTAINER_CARRIER", "SPECIAL_TRANSPORT"];
    expect(oversizedClasses).not.toContain(result.suggestedVehicleClasses[0]);
  });

  it("invariant #5: 300kg compact shipment is compatible with Porter/Sprinter/minivan-class capacity", () => {
    const profile = { ...blankProfile(), totalWeightKg: 300, volumeM3: 1.5 };
    const result = classifyShipment(profile);
    expect(["MINIVAN", "SMALL_VAN", "LIGHT_COMMERCIAL_VEHICLE", "PORTER_CLASS", "SPRINTER_CLASS"]).toContain(result.suggestedVehicleClasses[0]);
  });

  it("invariant #2: 150kg dense metal may require a cargo-class vehicle", () => {
    const result = classifyShipment({ ...blankProfile(), totalWeightKg: 150, volumeM3: 0.05, constructionMaterial: true });
    expect(result.classification).toBe("CARGO");
  });

  it("invariant #3: 150kg very-high-volume cargo may require a Sprinter-class/large van", () => {
    const result = classifyShipment({ ...blankProfile(), totalWeightKg: 150, volumeM3: 8 });
    expect(result.suggestedVehicleClasses).toContain("SPRINTER_CLASS");
  });

  it("invariant #4: 80kg oversized furniture may classify as Cargo", () => {
    const result = classifyShipment({ ...blankProfile(), totalWeightKg: 80, volumeM3: 1.5, furniture: true, oversized: true });
    expect(result.classification).toBe("CARGO");
  });

  it("hazardous cargo always escalates to MANUAL_REVIEW rather than being auto-routed (spec s.21)", () => {
    const result = classifyShipment({ ...blankProfile(), totalWeightKg: 50, volumeM3: 0.2, hazardous: true });
    expect(result.classification).toBe("MANUAL_REVIEW");
  });

  it("a profile with no usable signal at all returns INSUFFICIENT_DATA rather than guessing", () => {
    const result = classifyShipment(blankProfile());
    expect(result.classification).toBe("INSUFFICIENT_DATA");
  });

  it("an impossibly large shipment beyond every known vehicle envelope returns MANUAL_REVIEW, not a fabricated class", () => {
    const result = classifyShipment({ ...blankProfile(), totalWeightKg: 500000, volumeM3: 500 });
    expect(result.classification).toBe("MANUAL_REVIEW");
  });

  it("temperature-controlled cargo forces the cargo (refrigerated) ladder regardless of weight", () => {
    const result = classifyShipment({ ...blankProfile(), totalWeightKg: 20, volumeM3: 0.3, temperatureControlled: true });
    expect(result.classification).toBe("CARGO");
  });

  it("never contains a literal weight-only threshold branch (source-text guard on this file)", () => {
    // Belt-and-suspenders companion to the behavioral tests above: this file's
    // own logic must never regress to a `totalWeightKg > 150` / `<= 150`-style
    // comparison. Scan only executable lines, not comments/docstrings, since
    // the module header intentionally *discusses* that exact anti-pattern.
    const source = readFileSync(join(__dirname, "router.ts"), "utf8");
    const codeLines = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*") && !line.trim().startsWith("/*"));
    const codeOnly = codeLines.join("\n");
    expect(codeOnly).not.toMatch(/totalWeightKg\s*[<>]=?\s*150/);
    expect(codeOnly).not.toMatch(/150\s*[<>]=?\s*.*totalWeightKg/);
  });
});

describe("deriveTransportRequirements", () => {
  it("carries known handling flags through and excludes the delivery ladder when a cargo-only requirement is present", () => {
    const requirements = deriveTransportRequirements({ ...blankProfile(), totalWeightKg: 80, volumeM3: 1.5, furniture: true, oversized: true });
    expect(requirements.excludedVehicleClasses.length).toBeGreaterThan(0);
  });
});
