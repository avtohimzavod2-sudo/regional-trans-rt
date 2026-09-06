import { describe, expect, it } from "vitest";
import { buildSameCorridorChain, chainFitsWithinOffer, type RouteStop } from "./route";

const stops: RouteStop[] = [
  { id: "bishkek", corridorId: "c1", key: "bishkek", order: 0 },
  { id: "balykchy", corridorId: "c1", key: "balykchy", order: 1 },
  { id: "cholpon-ata", corridorId: "c1", key: "cholpon-ata", order: 2 },
  { id: "bosteri", corridorId: "c1", key: "bosteri", order: 3 },
  { id: "karakol", corridorId: "c1", key: "karakol", order: 4 },
  { id: "osh", corridorId: "c2", key: "osh", order: 0 },
];

describe("buildSameCorridorChain", () => {
  it("returns a direct segment for adjacent stops", () => {
    const chain = buildSameCorridorChain(stops[3], stops[4], stops);
    expect(chain?.isDirect).toBe(true);
    expect(chain?.stops.map((s) => s.key)).toEqual(["bosteri", "karakol"]);
  });

  it("returns an ordered multi-stop chain for a full-corridor trip", () => {
    const chain = buildSameCorridorChain(stops[0], stops[4], stops);
    expect(chain?.isDirect).toBe(false);
    expect(chain?.stops.map((s) => s.key)).toEqual(["bishkek", "balykchy", "cholpon-ata", "bosteri", "karakol"]);
  });

  it("orders the chain correctly for reverse-direction travel", () => {
    const chain = buildSameCorridorChain(stops[4], stops[0], stops);
    expect(chain?.stops.map((s) => s.key)).toEqual(["karakol", "bosteri", "cholpon-ata", "balykchy", "bishkek"]);
  });

  it("returns null across different corridors (no transfer point modelled)", () => {
    const chain = buildSameCorridorChain(stops[0], stops[5], stops);
    expect(chain).toBeNull();
  });

  it("returns null for identical origin/destination", () => {
    const chain = buildSameCorridorChain(stops[0], stops[0], stops);
    expect(chain).toBeNull();
  });
});

describe("chainFitsWithinOffer", () => {
  it("is true when the offer covers the whole chain", () => {
    const chain = buildSameCorridorChain(stops[1], stops[3], stops)!;
    expect(chainFitsWithinOffer(chain, stops[0], stops[4])).toBe(true);
  });

  it("is false when the offer only covers part of the chain", () => {
    const chain = buildSameCorridorChain(stops[0], stops[4], stops)!;
    expect(chainFitsWithinOffer(chain, stops[0], stops[2])).toBe(false);
  });
});
