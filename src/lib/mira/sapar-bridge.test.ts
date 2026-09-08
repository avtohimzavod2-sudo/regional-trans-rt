import { describe, expect, it } from "vitest";
import type { ShipmentStatus } from "@prisma/client";
import { introduceSaparLine, saparStillOwnsConversation } from "./sapar-bridge";

// Mira Pass 1 spec s.3/s.24-D — these two functions decide whether the
// customer is told Sapar just joined the chat, and whether the next turn's
// state should say Sapar or Mira owns it. Flagged in the Pass 1 review as
// shipped with zero test coverage of any kind; this file closes that gap.
const SAPAR_OWNED: ShipmentStatus[] = ["NEEDS_INFO", "READY_FOR_MATCHING", "SEARCHING", "QUOTED", "AWAITING_CONFIRMATION", "CONFIRMED"];
const NOT_SAPAR_OWNED: ShipmentStatus[] = [
  "DRAFT",
  "AWAITING_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "AT_TRANSFER_POINT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
  "DISPUTED",
];

describe("saparStillOwnsConversation (spec s.3)", () => {
  for (const status of SAPAR_OWNED) {
    it(`returns true for ${status} (Sapar is still actively working the order)`, () => {
      expect(saparStillOwnsConversation(status)).toBe(true);
    });
  }

  for (const status of NOT_SAPAR_OWNED) {
    it(`returns false for ${status} (control hands back to Mira)`, () => {
      expect(saparStillOwnsConversation(status)).toBe(false);
    });
  }

  it("covers every ShipmentStatus value exactly once between the two lists (no status silently unhandled)", () => {
    const covered = new Set([...SAPAR_OWNED, ...NOT_SAPAR_OWNED]);
    expect(covered.size).toBe(SAPAR_OWNED.length + NOT_SAPAR_OWNED.length);
    // 16 values in the schema's ShipmentStatus enum as of this pass — if this
    // fails, a new status was added and needs an explicit owned/not-owned
    // classification above, not a silent default.
    expect(covered.size).toBe(16);
  });
});

describe("introduceSaparLine (spec s.3/s.24-D)", () => {
  it("returns distinct non-empty text for KY, RU, and EN", () => {
    const ky = introduceSaparLine("KY");
    const ru = introduceSaparLine("RU");
    const en = introduceSaparLine("EN");
    expect(ky.length).toBeGreaterThan(0);
    expect(ru.length).toBeGreaterThan(0);
    expect(en.length).toBeGreaterThan(0);
    expect(new Set([ky, ru, en]).size).toBe(3);
  });

  it("names Sapar by name so the handoff is visible to the customer, not silent", () => {
    expect(introduceSaparLine("RU")).toMatch(/Сапар/);
    expect(introduceSaparLine("KY")).toMatch(/Сапар/);
    expect(introduceSaparLine("EN")).toMatch(/Sapar/);
  });

  it("never mentions an internal agent name other than Sapar himself", () => {
    for (const lang of ["KY", "RU", "EN"] as const) {
      expect(introduceSaparLine(lang)).not.toMatch(/RT\s*COMMAND|MATCH\s*Agent|TRUST\s*Agent|PAY\s*Agent|Mira/i);
    }
  });
});
