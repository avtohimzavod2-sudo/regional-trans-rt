import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { passengerFacingSupplyFacts } from "./bridge";
import type { DemandSupplyResolution } from "./types";

// Driver Operations Detail privacy boundary (DRIVER OPERATIONS CENTER pass
// spec s.13): the passenger-facing bridge must never expose driverId,
// offerId, tripId, DriveCrmEvent ids, internal incident detail, correction
// links, internal timestamps, or internal sources to a passenger-facing
// reply. Driver Detail's internal fields never flow through this function at
// all (it only ever accepts a DemandSupplyResolution), and this test locks
// that in at both the source-text and runtime level.
describe("passengerFacingSupplyFacts never leaks internal Driver Detail fields", () => {
  it("does not import driver-detail.ts (no code path for internal detail to flow through)", () => {
    const source = readFileSync(join(__dirname, "bridge.ts"), "utf8");
    expect(source).not.toMatch(/driver-detail/);
  });

  it("strips driverId/offerId/factSource/factAsOf from the best candidate, exposing only passenger-safe fields", () => {
    const resolution: DemandSupplyResolution = {
      tripRequestId: "req-1",
      hasCandidateSupply: true,
      candidates: [
        {
          offerId: "offer-1",
          driverId: "driver-1",
          seatsAvailable: 2,
          departureWindow: { travelDate: "2026-09-10", start: "08:00", end: "10:00" },
          vehicle: { driverId: "driver-1", carModel: "Sprinter", carPlate: "01KG777AAA" },
          operationalState: "PLANNED",
          etaMinutes: 15,
          freshness: { source: "JOLCHU", asOf: "2026-09-10T08:00:00.000Z" },
          confidence: "VERIFIED",
        },
      ],
    };

    const facts = passengerFacingSupplyFacts(resolution);

    expect(facts).not.toHaveProperty("driverId");
    expect(facts).not.toHaveProperty("offerId");
    expect(facts.bestCandidate).not.toHaveProperty("driverId");
    expect(facts.bestCandidate).not.toHaveProperty("offerId");
    expect(facts.bestCandidate).not.toHaveProperty("vehicle");
    expect(facts.bestCandidate).not.toHaveProperty("freshness");
    expect(JSON.stringify(facts)).not.toContain("driver-1");
    expect(JSON.stringify(facts)).not.toContain("offer-1");
  });
});
