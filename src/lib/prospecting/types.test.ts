import { describe, expect, it } from "vitest";
import {
  canHandoff,
  DELIVERY_CARGO_EVENT_NAMES,
  HANDOFF_TARGETS,
  isAcceptedHandoff,
  PARTNER_REGISTRY_EVENT_NAMES,
  PROSPECT_TYPES_WITH_EXISTING_SCHEMA_SUPPORT,
  PROSPECTING_EVENT_NAMES,
  type ProspectHandoff,
  type ProspectType,
} from "./types";

const ALL_PROSPECT_TYPES: ProspectType[] = ["PASSENGER_DEMAND", "DRIVER_SUPPLY", "DELIVERY_EXECUTOR_SUPPLY", "CARGO_CARRIER_SUPPLY", "BUSINESS_CUSTOMER"];

describe("invariant #9: a ProspectHandoff does not automatically create/duplicate a Partner", () => {
  it("ProspectHandoff carries only referential/contact data, never a Partner-shaped object", () => {
    const handoff: ProspectHandoff = {
      handoffId: "h1",
      prospectId: "p1",
      sourceAgent: "BUSINESS_ACQUISITION",
      targetAgentOrDepartment: "ZHOLAMAN",
      prospectType: "BUSINESS_CUSTOMER",
      expressedInterest: "wants recurring delivery from their shop",
      summary: "UNKNOWN",
      contactData: "+996700000000",
      requestedService: "DELIVERY",
      availableCapabilities: [],
      conversationReference: "UNKNOWN",
      sourceReferences: [],
      createdAt: new Date().toISOString(),
      status: "READY",
    };
    expect(handoff).not.toHaveProperty("partnerId");
    expect(isAcceptedHandoff(handoff)).toBe(false);
  });

  it("isAcceptedHandoff is only true once status is ACCEPTED", () => {
    expect(isAcceptedHandoff({ status: "READY" })).toBe(false);
    expect(isAcceptedHandoff({ status: "ACCEPTED" })).toBe(true);
  });
});

describe("invariant #10: an opted-out prospect must not be considered valid for new outreach/handoff", () => {
  it("canHandoff rejects OPTED_OUT, REJECTED, and DUPLICATE statuses", () => {
    expect(canHandoff("OPTED_OUT")).toBe(false);
    expect(canHandoff("REJECTED")).toBe(false);
    expect(canHandoff("DUPLICATE")).toBe(false);
  });

  it("canHandoff allows an actively qualified/responded prospect", () => {
    expect(canHandoff("QUALIFIED")).toBe(true);
    expect(canHandoff("RESPONDED")).toBe(true);
  });
});

describe("five contragents (spec s.11) each resolve to a documented handoff target", () => {
  for (const prospectType of ALL_PROSPECT_TYPES) {
    it(`${prospectType} has at least one handoff target`, () => {
      expect(HANDOFF_TARGETS[prospectType].length).toBeGreaterThan(0);
    });
  }

  it("all five contragents now map onto the Prisma AcquisitionProspectType enum", () => {
    expect(PROSPECT_TYPES_WITH_EXISTING_SCHEMA_SUPPORT).toEqual(ALL_PROSPECT_TYPES);
  });
});

describe("reserved event names (spec s.20) are unique across the three namespaces", () => {
  it("no event name is reserved twice", () => {
    const all = [...PROSPECTING_EVENT_NAMES, ...PARTNER_REGISTRY_EVENT_NAMES, ...DELIVERY_CARGO_EVENT_NAMES];
    expect(new Set(all).size).toBe(all.length);
  });
});
