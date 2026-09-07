import { describe, expect, it } from "vitest";
import { canTransitionShipment } from "./lifecycle";

describe("canTransitionShipment", () => {
  it("allows the normal happy path from draft through delivery", () => {
    expect(canTransitionShipment("DRAFT", "READY_FOR_MATCHING")).toBe(true);
    expect(canTransitionShipment("READY_FOR_MATCHING", "SEARCHING")).toBe(true);
    expect(canTransitionShipment("SEARCHING", "QUOTED")).toBe(true);
    expect(canTransitionShipment("QUOTED", "AWAITING_CONFIRMATION")).toBe(true);
    expect(canTransitionShipment("AWAITING_CONFIRMATION", "CONFIRMED")).toBe(true);
    expect(canTransitionShipment("CONFIRMED", "AWAITING_PICKUP")).toBe(true);
    expect(canTransitionShipment("AWAITING_PICKUP", "PICKED_UP")).toBe(true);
    expect(canTransitionShipment("PICKED_UP", "IN_TRANSIT")).toBe(true);
    expect(canTransitionShipment("IN_TRANSIT", "OUT_FOR_DELIVERY")).toBe(true);
    expect(canTransitionShipment("OUT_FOR_DELIVERY", "DELIVERED")).toBe(true);
  });

  it("allows routing through a transfer point", () => {
    expect(canTransitionShipment("IN_TRANSIT", "AT_TRANSFER_POINT")).toBe(true);
    expect(canTransitionShipment("AT_TRANSFER_POINT", "OUT_FOR_DELIVERY")).toBe(true);
  });

  it("requires missing-info shipments to be completed before matching", () => {
    expect(canTransitionShipment("DRAFT", "NEEDS_INFO")).toBe(true);
    expect(canTransitionShipment("NEEDS_INFO", "READY_FOR_MATCHING")).toBe(true);
  });

  it("allows cancellation before pickup but not after", () => {
    expect(canTransitionShipment("DRAFT", "CANCELLED")).toBe(true);
    expect(canTransitionShipment("QUOTED", "CANCELLED")).toBe(true);
    expect(canTransitionShipment("PICKED_UP", "CANCELLED")).toBe(false);
    expect(canTransitionShipment("IN_TRANSIT", "CANCELLED")).toBe(false);
  });

  it("allows a failed match to be re-queued for matching", () => {
    expect(canTransitionShipment("FAILED", "READY_FOR_MATCHING")).toBe(true);
  });

  it("allows disputes to reopen into transit/delivery or be cancelled", () => {
    expect(canTransitionShipment("DISPUTED", "IN_TRANSIT")).toBe(true);
    expect(canTransitionShipment("DISPUTED", "DELIVERED")).toBe(true);
    expect(canTransitionShipment("DISPUTED", "CANCELLED")).toBe(true);
  });

  it("treats CANCELLED as a true terminal state", () => {
    expect(canTransitionShipment("CANCELLED", "DRAFT")).toBe(false);
    expect(canTransitionShipment("CANCELLED", "READY_FOR_MATCHING")).toBe(false);
  });

  it("rejects skipping states", () => {
    expect(canTransitionShipment("DRAFT", "DELIVERED")).toBe(false);
    expect(canTransitionShipment("READY_FOR_MATCHING", "DELIVERED")).toBe(false);
  });

  it("rejects going backwards after delivery except into a dispute", () => {
    expect(canTransitionShipment("DELIVERED", "IN_TRANSIT")).toBe(false);
    expect(canTransitionShipment("DELIVERED", "DISPUTED")).toBe(true);
  });
});
