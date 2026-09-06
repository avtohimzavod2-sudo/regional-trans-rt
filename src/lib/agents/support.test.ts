import { describe, expect, it } from "vitest";
import { canResolveWithoutNote, initialStatusFor } from "./support";

describe("initialStatusFor", () => {
  it("opens ordinary cases as OPEN", () => {
    expect(initialStatusFor("CANCELLATION")).toBe("OPEN");
    expect(initialStatusFor("DRIVER_NO_SHOW")).toBe("OPEN");
    expect(initialStatusFor("PASSENGER_NO_SHOW")).toBe("OPEN");
    expect(initialStatusFor("LATE")).toBe("OPEN");
    expect(initialStatusFor("ROUTE_CHANGE")).toBe("OPEN");
    expect(initialStatusFor("OTHER")).toBe("OPEN");
  });

  it("auto-escalates disputes and refund requests", () => {
    expect(initialStatusFor("DISPUTE")).toBe("ESCALATED");
    expect(initialStatusFor("REFUND_REQUEST")).toBe("ESCALATED");
  });
});

describe("canResolveWithoutNote", () => {
  it("requires a human decision path for disputes/refunds (not auto-resolvable)", () => {
    expect(canResolveWithoutNote("DISPUTE")).toBe(false);
    expect(canResolveWithoutNote("REFUND_REQUEST")).toBe(false);
  });

  it("allows ordinary cases to resolve without a mandatory escalation note", () => {
    expect(canResolveWithoutNote("CANCELLATION")).toBe(true);
    expect(canResolveWithoutNote("LATE")).toBe(true);
  });
});
