import { describe, expect, it } from "vitest";
import { canTransitionParcel } from "./parcel";

describe("canTransitionParcel", () => {
  it("allows the normal happy path", () => {
    expect(canTransitionParcel("PENDING", "ASSIGNED")).toBe(true);
    expect(canTransitionParcel("ASSIGNED", "PICKED_UP")).toBe(true);
    expect(canTransitionParcel("PICKED_UP", "IN_TRANSIT")).toBe(true);
    expect(canTransitionParcel("IN_TRANSIT", "DELIVERED")).toBe(true);
  });

  it("allows cancellation before pickup", () => {
    expect(canTransitionParcel("PENDING", "CANCELLED")).toBe(true);
    expect(canTransitionParcel("ASSIGNED", "CANCELLED")).toBe(true);
  });

  it("does not allow cancelling after pickup", () => {
    expect(canTransitionParcel("PICKED_UP", "CANCELLED")).toBe(false);
    expect(canTransitionParcel("IN_TRANSIT", "CANCELLED")).toBe(false);
  });

  it("allows disputes to reopen into transit or be cancelled", () => {
    expect(canTransitionParcel("DISPUTED", "IN_TRANSIT")).toBe(true);
    expect(canTransitionParcel("DISPUTED", "CANCELLED")).toBe(true);
  });

  it("treats DELIVERED and CANCELLED as terminal", () => {
    expect(canTransitionParcel("DELIVERED", "IN_TRANSIT")).toBe(false);
    expect(canTransitionParcel("CANCELLED", "PENDING")).toBe(false);
  });

  it("rejects skipping states", () => {
    expect(canTransitionParcel("PENDING", "DELIVERED")).toBe(false);
    expect(canTransitionParcel("PENDING", "PICKED_UP")).toBe(false);
  });
});
