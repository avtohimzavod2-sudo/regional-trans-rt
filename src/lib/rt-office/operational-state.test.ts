import { describe, expect, it } from "vitest";
import { deriveOperationalState, type OperationalStateInput } from "./operational-state";

function baseInput(overrides: Partial<OperationalStateInput> = {}): OperationalStateInput {
  return {
    driverStatus: "ACTIVE",
    hasOpenBreakdown: false,
    activeOfferStatus: null,
    activeTripStatus: null,
    delayedSignal: false,
    arrivedSignal: false,
    ...overrides,
  };
}

describe("deriveOperationalState", () => {
  it("returns BREAKDOWN whenever an open breakdown exists, overriding everything else", () => {
    const state = deriveOperationalState(baseInput({ hasOpenBreakdown: true, activeTripStatus: "IN_PROGRESS", driverStatus: "SUSPENDED" }));
    expect(state).toBe("BREAKDOWN");
  });

  it("returns CANCELLED for a cancelled or no-show trip", () => {
    expect(deriveOperationalState(baseInput({ activeTripStatus: "CANCELLED" }))).toBe("CANCELLED");
    expect(deriveOperationalState(baseInput({ activeTripStatus: "NO_SHOW" }))).toBe("CANCELLED");
  });

  it("returns COMPLETED for a completed trip with no arrived signal, ARRIVED when the signal is explicit", () => {
    expect(deriveOperationalState(baseInput({ activeTripStatus: "COMPLETED" }))).toBe("COMPLETED");
    expect(deriveOperationalState(baseInput({ activeTripStatus: "COMPLETED", arrivedSignal: true }))).toBe("ARRIVED");
  });

  it("returns EN_ROUTE for an in-progress trip with no delay signal, DELAYED when the signal is explicit", () => {
    expect(deriveOperationalState(baseInput({ activeTripStatus: "IN_PROGRESS" }))).toBe("EN_ROUTE");
    expect(deriveOperationalState(baseInput({ activeTripStatus: "IN_PROGRESS", delayedSignal: true }))).toBe("DELAYED");
  });

  it("returns WAITING_DEPARTURE for a scheduled trip", () => {
    expect(deriveOperationalState(baseInput({ activeTripStatus: "SCHEDULED" }))).toBe("WAITING_DEPARTURE");
  });

  it("returns OFFLINE when the driver is not ACTIVE and there is no active trip", () => {
    expect(deriveOperationalState(baseInput({ driverStatus: "SUSPENDED" }))).toBe("OFFLINE");
    expect(deriveOperationalState(baseInput({ driverStatus: "BLOCKED" }))).toBe("OFFLINE");
    expect(deriveOperationalState(baseInput({ driverStatus: "PENDING_VERIFICATION" }))).toBe("OFFLINE");
  });

  it("returns PLANNED for an active driver with an open or partially-filled offer and no active trip", () => {
    expect(deriveOperationalState(baseInput({ activeOfferStatus: "OPEN" }))).toBe("PLANNED");
    expect(deriveOperationalState(baseInput({ activeOfferStatus: "PARTIALLY_FILLED" }))).toBe("PLANNED");
  });

  it("returns AVAILABLE as the default for an active driver with no active offer or trip", () => {
    expect(deriveOperationalState(baseInput())).toBe("AVAILABLE");
    expect(deriveOperationalState(baseInput({ activeOfferStatus: "CLOSED" }))).toBe("AVAILABLE");
    expect(deriveOperationalState(baseInput({ activeOfferStatus: "FULL" }))).toBe("AVAILABLE");
  });

  it("prioritizes an active trip's state over driver offline status (in-progress trip is never masked as OFFLINE)", () => {
    const state = deriveOperationalState(baseInput({ activeTripStatus: "IN_PROGRESS", driverStatus: "SUSPENDED" }));
    expect(state).toBe("EN_ROUTE");
  });
});
