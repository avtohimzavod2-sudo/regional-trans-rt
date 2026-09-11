import { beforeEach, describe, expect, it, vi } from "vitest";

// Task D spec H scenario 15: both acquisition types coexist without
// cross-contamination. Exercises the REAL (unmocked) prospect.ts modules for
// both DELIVERY_EXECUTOR_CONTRACTOR and CARGO_CARRIER_CONTRACTOR against a
// single mocked db, proving that driving one contractor's lifecycle never
// touches the other contractor's Prisma delegate — each is wired to its own
// model only, sharing nothing but the stateless generic engine in ./lifecycle.
const { deliveryExecutorProspectMock, cargoCarrierProspectMock } = vi.hoisted(() => ({
  deliveryExecutorProspectMock: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  cargoCarrierProspectMock: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    deliveryExecutorProspect: deliveryExecutorProspectMock,
    cargoCarrierProspect: cargoCarrierProspectMock,
  },
}));

import {
  captureDeliveryExecutorQualificationFacts,
  flagDeliveryExecutorPossibleDuplicate,
  transitionDeliveryExecutorLifecycleStage,
} from "@/lib/delivery-executor-contractor/prospect";
import {
  captureCargoCarrierQualificationFacts,
  flagCargoCarrierPossibleDuplicate,
  transitionCargoCarrierLifecycleStage,
} from "@/lib/cargo-carrier-contractor/prospect";

function allCargoCarrierCalls() {
  return [
    ...cargoCarrierProspectMock.findFirst.mock.calls,
    ...cargoCarrierProspectMock.findUnique.mock.calls,
    ...cargoCarrierProspectMock.findUniqueOrThrow.mock.calls,
    ...cargoCarrierProspectMock.create.mock.calls,
    ...cargoCarrierProspectMock.update.mock.calls,
    ...cargoCarrierProspectMock.updateMany.mock.calls,
  ];
}

function allDeliveryExecutorCalls() {
  return [
    ...deliveryExecutorProspectMock.findFirst.mock.calls,
    ...deliveryExecutorProspectMock.findUnique.mock.calls,
    ...deliveryExecutorProspectMock.findUniqueOrThrow.mock.calls,
    ...deliveryExecutorProspectMock.create.mock.calls,
    ...deliveryExecutorProspectMock.update.mock.calls,
    ...deliveryExecutorProspectMock.updateMany.mock.calls,
  ];
}

beforeEach(() => vi.clearAllMocks());

describe("acquisition pipelines coexist without cross-contamination (spec H scenario 15)", () => {
  it("a Delivery Executor lifecycle transition never touches the CargoCarrierProspect delegate", async () => {
    deliveryExecutorProspectMock.updateMany.mockResolvedValue({ count: 1 });
    deliveryExecutorProspectMock.findUniqueOrThrow.mockResolvedValue({ id: "de-1", lifecycleStage: "QUALIFICATION_PENDING" });

    await transitionDeliveryExecutorLifecycleStage("de-1", "QUALIFICATION_PENDING");

    expect(allDeliveryExecutorCalls().length).toBeGreaterThan(0);
    expect(allCargoCarrierCalls()).toHaveLength(0);
  });

  it("a Cargo Carrier lifecycle transition never touches the DeliveryExecutorProspect delegate", async () => {
    cargoCarrierProspectMock.updateMany.mockResolvedValue({ count: 1 });
    cargoCarrierProspectMock.findUniqueOrThrow.mockResolvedValue({ id: "cc-1", lifecycleStage: "QUALIFICATION_PENDING" });

    await transitionCargoCarrierLifecycleStage("cc-1", "QUALIFICATION_PENDING");

    expect(allCargoCarrierCalls().length).toBeGreaterThan(0);
    expect(allDeliveryExecutorCalls()).toHaveLength(0);
  });

  it("qualification-fact capture for one type never leaks into the other type's delegate", async () => {
    deliveryExecutorProspectMock.findUnique.mockResolvedValue({ id: "de-1", executorType: null });
    deliveryExecutorProspectMock.update.mockResolvedValue({ id: "de-1", executorType: "courier" });
    cargoCarrierProspectMock.findUnique.mockResolvedValue({ id: "cc-1", fleetTypeText: null });
    cargoCarrierProspectMock.update.mockResolvedValue({ id: "cc-1", fleetTypeText: "3-тонник" });

    await captureDeliveryExecutorQualificationFacts("de-1", { executorType: "courier" });
    await captureCargoCarrierQualificationFacts("cc-1", { fleetTypeText: "3-тонник" });

    expect(deliveryExecutorProspectMock.update).toHaveBeenCalledWith({ where: { id: "de-1" }, data: { executorType: "courier" } });
    expect(cargoCarrierProspectMock.update).toHaveBeenCalledWith({ where: { id: "cc-1" }, data: { fleetTypeText: "3-тонник" } });
    // Cross-checks: neither delegate ever receives the other type's field name.
    expect(deliveryExecutorProspectMock.update.mock.calls[0][0].data).not.toHaveProperty("fleetTypeText");
    expect(cargoCarrierProspectMock.update.mock.calls[0][0].data).not.toHaveProperty("executorType");
  });

  it("possible-duplicate flags are scoped to each type's own delegate, never cross-flagging between types", async () => {
    deliveryExecutorProspectMock.updateMany.mockResolvedValue({ count: 1 });
    deliveryExecutorProspectMock.findUniqueOrThrow.mockResolvedValue({ id: "de-1", possibleDuplicateOfId: "de-0" });
    cargoCarrierProspectMock.updateMany.mockResolvedValue({ count: 1 });
    cargoCarrierProspectMock.findUniqueOrThrow.mockResolvedValue({ id: "cc-1", possibleDuplicateOfId: "cc-0" });

    const deResult = await flagDeliveryExecutorPossibleDuplicate("de-1", "de-0");
    const ccResult = await flagCargoCarrierPossibleDuplicate("cc-1", "cc-0");

    expect(deResult.possibleDuplicateOfId).toBe("de-0");
    expect(ccResult.possibleDuplicateOfId).toBe("cc-0");
    expect(allCargoCarrierCalls().some(([args]) => args?.where?.id === "de-1")).toBe(false);
    expect(allDeliveryExecutorCalls().some(([args]) => args?.where?.id === "cc-1")).toBe(false);
  });
});
