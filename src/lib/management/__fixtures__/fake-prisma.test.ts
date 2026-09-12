import { describe, expect, it } from "vitest";
import { createFakeDb } from "./fake-prisma";

// The report tests lean on two guarantees from this fixture: that it cannot
// silently ignore a filter, and that it cannot silently invent an empty table.
// Both are what make "these tables are the report's complete read surface" a
// real assertion rather than a comment, so both are tested here.
describe("createFakeDb strictness", () => {
  it("throws when a model was never declared, instead of returning an empty table", async () => {
    const db = createFakeDb({ shipment: [] });
    await expect(db.treasuryTransaction.count({ where: {} })).rejects.toThrow(/not declared/);
  });

  it("throws on a filter operator it cannot evaluate, instead of matching everything", async () => {
    const db = createFakeDb({ shipment: [{ id: "sh1", publicId: "SPR-1" }] });
    await expect(db.shipment.count({ where: { publicId: { startsWith: "SPR" } } })).rejects.toThrow(/unsupported filter shape/);
  });
});

describe("createFakeDb filter semantics", () => {
  const rows = [
    { id: "a", createdAt: new Date("2026-09-02T00:00:00Z"), status: "DELIVERED", completedAt: new Date("2026-09-03T00:00:00Z"), seats: 2 },
    { id: "b", createdAt: new Date("2026-09-05T00:00:00Z"), status: "FAILED", completedAt: null, seats: 3 },
    { id: "c", createdAt: new Date("2026-08-01T00:00:00Z"), status: "DELIVERED", completedAt: new Date("2026-08-02T00:00:00Z"), seats: 5 },
  ];
  const db = createFakeDb({ shipment: rows });
  const window = { gte: new Date("2026-09-01T00:00:00Z"), lt: new Date("2026-09-08T00:00:00Z") };

  it("applies half-open date windows", async () => {
    expect(await db.shipment.count({ where: { createdAt: window } })).toBe(2);
  });

  it("applies in / notIn / not", async () => {
    expect(await db.shipment.count({ where: { status: { in: ["DELIVERED"] } } })).toBe(2);
    expect(await db.shipment.count({ where: { status: { notIn: ["DELIVERED"] } } })).toBe(1);
    expect(await db.shipment.count({ where: { completedAt: { not: null } } })).toBe(2);
  });

  // A null field must not satisfy a range filter — Prisma's behaviour, and the
  // one the reports depend on: a shipment with no completedAt is not
  // "completed before the period end".
  it("never matches a null field against a range", async () => {
    expect(await db.shipment.count({ where: { completedAt: { lt: new Date("2030-01-01T00:00:00Z") } } })).toBe(2);
  });

  it("returns null, like Prisma, for a sum over no rows", async () => {
    expect(await db.shipment.aggregate({ where: { status: "CANCELLED" }, _sum: { seats: true } })).toEqual({ _sum: { seats: null } });
    expect(await db.shipment.aggregate({ where: { status: "DELIVERED" }, _sum: { seats: true } })).toEqual({ _sum: { seats: 7 } });
  });

  it("groups with _count._all", async () => {
    expect(await db.shipment.groupBy({ by: ["status"], where: { createdAt: window } })).toEqual([
      { status: "DELIVERED", _count: { _all: 1 } },
      { status: "FAILED", _count: { _all: 1 } },
    ]);
  });

  it("follows a declared relation filter", async () => {
    const related = createFakeDb(
      { shipment: rows, shipmentPayment: [{ id: "pay1", shipmentId: "a" }, { id: "pay2", shipmentId: "c" }] },
      { shipmentPayment: { shipment: { table: "shipment", localKey: "shipmentId" } } },
    );
    expect(await related.shipmentPayment.count({ where: { shipment: { createdAt: window } } })).toBe(1);
  });
});
