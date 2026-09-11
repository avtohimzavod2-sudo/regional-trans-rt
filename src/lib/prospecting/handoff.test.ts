import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { dbMocks, isDoNotContactMock, isDoNotContactFingerprintMock, logAgentActionMock } = vi.hoisted(() => ({
  dbMocks: {
    prospectHandoff: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
    },
  },
  isDoNotContactMock: vi.fn().mockResolvedValue(false),
  isDoNotContactFingerprintMock: vi.fn().mockResolvedValue(false),
  logAgentActionMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/db", () => ({ db: dbMocks }));
vi.mock("@/lib/acquisition/outreach-log", () => ({
  isDoNotContact: isDoNotContactMock,
  isDoNotContactFingerprint: isDoNotContactFingerprintMock,
}));
vi.mock("@/lib/agents/trace", () => ({ logAgentAction: logAgentActionMock }));

import {
  acceptProspectHandoff,
  createProspectHandoff,
  fromAcquisitionProspectType,
  HandoffNotFoundError,
  HandoffOptedOutError,
  HandoffTransitionError,
  HandoffWrongTargetError,
  InvalidHandoffTargetError,
  markHandoffDuplicate,
  rejectProspectHandoff,
  requestMoreInfoOnHandoff,
  returnHandoffToReady,
  toAcquisitionProspectType,
} from "./handoff";

const ctx = { traceId: "t1", hop: 0 };

function p2002Error() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
}

function baseHandoff(overrides: Record<string, unknown> = {}) {
  return {
    id: "ho-1",
    prospectType: "DRIVER",
    prospectRef: "sc-1",
    sourceAgent: "DRIVER_CONTRACTOR",
    targetAgentOrDepartment: "RT_OFFICE",
    status: "READY",
    idempotencyKey: "k-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    acceptedAt: null,
    rejectedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  isDoNotContactMock.mockResolvedValue(false);
  isDoNotContactFingerprintMock.mockResolvedValue(false);
});

describe("ProspectType <-> AcquisitionProspectType mapping", () => {
  it("round-trips every prospect type", () => {
    expect(toAcquisitionProspectType("DRIVER_SUPPLY")).toBe("DRIVER");
    expect(toAcquisitionProspectType("PASSENGER_DEMAND")).toBe("PASSENGER");
    expect(toAcquisitionProspectType("BUSINESS_CUSTOMER")).toBe("BUSINESS");
    expect(toAcquisitionProspectType("DELIVERY_EXECUTOR_SUPPLY")).toBe("DELIVERY_EXECUTOR");
    expect(toAcquisitionProspectType("CARGO_CARRIER_SUPPLY")).toBe("CARGO_CARRIER");
    expect(fromAcquisitionProspectType("DRIVER")).toBe("DRIVER_SUPPLY");
    expect(fromAcquisitionProspectType("CARGO_CARRIER")).toBe("CARGO_CARRIER_SUPPLY");
  });
});

describe("createProspectHandoff", () => {
  const validParams = {
    prospectType: "DRIVER_SUPPLY" as const,
    prospectRef: "sc-1",
    sourceAgent: "DRIVER_CONTRACTOR" as const,
    targetAgentOrDepartment: "RT_OFFICE",
    idempotencyKey: "k-1",
  };

  it("B: rejects a target outside the approved HANDOFF_TARGETS list without touching the database", async () => {
    await expect(createProspectHandoff(ctx, { ...validParams, targetAgentOrDepartment: "CARGO_OPERATIONS" })).rejects.toThrow(
      InvalidHandoffTargetError
    );
    expect(dbMocks.prospectHandoff.create).not.toHaveBeenCalled();
  });

  it("F: refuses to create a handoff for a prospect already opted out (per-prospect check)", async () => {
    isDoNotContactMock.mockResolvedValue(true);
    await expect(createProspectHandoff(ctx, validParams)).rejects.toThrow(HandoffOptedOutError);
    expect(dbMocks.prospectHandoff.create).not.toHaveBeenCalled();
  });

  it("F: refuses to create a handoff when the cross-type contactFingerprint is opted out, even if the per-prospect check passes", async () => {
    isDoNotContactMock.mockResolvedValue(false);
    isDoNotContactFingerprintMock.mockResolvedValue(true);
    await expect(createProspectHandoff(ctx, { ...validParams, contactFingerprint: "phone:996700000000" })).rejects.toThrow(
      HandoffOptedOutError
    );
    expect(dbMocks.prospectHandoff.create).not.toHaveBeenCalled();
  });

  it("creates a READY handoff and logs ProspectHandoffCreated when valid", async () => {
    dbMocks.prospectHandoff.create.mockResolvedValue(baseHandoff());

    const outcome = await createProspectHandoff(ctx, validParams);

    expect(outcome.deduplicated).toBe(false);
    expect(outcome.handoff.status).toBe("READY");
    expect(dbMocks.prospectHandoff.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ prospectType: "DRIVER", targetAgentOrDepartment: "RT_OFFICE" }) })
    );
    expect(logAgentActionMock).toHaveBeenCalledWith(expect.objectContaining({ action: "prospecting.handoff_created", entityId: "ho-1" }));
  });

  it("C: a retried creation with the same idempotencyKey is a safe no-op returning the existing row", async () => {
    const existing = baseHandoff();
    dbMocks.prospectHandoff.create.mockRejectedValue(p2002Error());
    dbMocks.prospectHandoff.findUniqueOrThrow.mockResolvedValue(existing);

    const outcome = await createProspectHandoff(ctx, validParams);

    expect(outcome).toEqual({ handoff: existing, deduplicated: true });
    expect(logAgentActionMock).not.toHaveBeenCalled();
  });

  it("propagates a non-P2002 database error", async () => {
    dbMocks.prospectHandoff.create.mockRejectedValue(new Error("connection lost"));
    await expect(createProspectHandoff(ctx, validParams)).rejects.toThrow("connection lost");
  });
});

describe("acceptProspectHandoff — ownership transfer (A/D)", () => {
  const params = { handoffId: "ho-1", targetAgentOrDepartment: "RT_OFFICE" };

  it("transitions READY -> ACCEPTED and logs ProspectHandoffAccepted", async () => {
    dbMocks.prospectHandoff.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.prospectHandoff.findUniqueOrThrow.mockResolvedValue(baseHandoff({ status: "ACCEPTED" }));

    const outcome = await acceptProspectHandoff(ctx, params);

    expect(outcome.deduplicated).toBe(false);
    expect(outcome.handoff.status).toBe("ACCEPTED");
    expect(logAgentActionMock).toHaveBeenCalledWith(expect.objectContaining({ action: "prospecting.handoff_accepted" }));
  });

  it("P: accepting a handoff touches only the ProspectHandoff row — never creates a Partner/Driver/Passenger/Shipment as a side effect", async () => {
    // dbMocks only ever declares a `prospectHandoff` model (see the vi.hoisted
    // block at the top of this file). If acceptProspectHandoff's
    // implementation called db.partner.create / db.driver.create /
    // db.passenger.create / db.shipment.create, that property would be
    // `undefined` on this mock and the call would throw before this
    // assertion is reached — the absence of any other model on the mock is
    // itself the enforcement, not just this test's exhaustive-call check.
    dbMocks.prospectHandoff.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.prospectHandoff.findUniqueOrThrow.mockResolvedValue(baseHandoff({ status: "ACCEPTED" }));

    await acceptProspectHandoff(ctx, params);

    expect(Object.keys(dbMocks)).toEqual(["prospectHandoff"]);
    expect(dbMocks.prospectHandoff.updateMany).toHaveBeenCalledTimes(1);
    expect(dbMocks.prospectHandoff.findUniqueOrThrow).toHaveBeenCalledTimes(1);
  });

  it("D: a retried/duplicated accept (simultaneous accept attempts) is a deterministic no-op, not an error", async () => {
    const existing = baseHandoff({ status: "ACCEPTED" });
    dbMocks.prospectHandoff.updateMany.mockResolvedValue({ count: 0 });
    dbMocks.prospectHandoff.findUnique.mockResolvedValue(existing);

    const outcome = await acceptProspectHandoff(ctx, params);

    expect(outcome).toEqual({ handoff: existing, deduplicated: true });
    expect(logAgentActionMock).not.toHaveBeenCalled();
  });

  it("D: accept racing reject — the loser sees the real terminal state and throws instead of silently succeeding", async () => {
    dbMocks.prospectHandoff.updateMany.mockResolvedValue({ count: 0 });
    dbMocks.prospectHandoff.findUnique.mockResolvedValue(baseHandoff({ status: "REJECTED" }));

    await expect(acceptProspectHandoff(ctx, params)).rejects.toThrow(HandoffTransitionError);
  });

  it("refuses to accept on behalf of the wrong department", async () => {
    dbMocks.prospectHandoff.updateMany.mockResolvedValue({ count: 0 });
    dbMocks.prospectHandoff.findUnique.mockResolvedValue(baseHandoff({ status: "READY", targetAgentOrDepartment: "SAPAR" }));

    await expect(acceptProspectHandoff(ctx, params)).rejects.toThrow(HandoffWrongTargetError);
  });

  it("a terminal handoff can never be silently reopened (accept after reject)", async () => {
    dbMocks.prospectHandoff.updateMany.mockResolvedValue({ count: 0 });
    dbMocks.prospectHandoff.findUnique.mockResolvedValue(baseHandoff({ status: "REJECTED" }));

    await expect(acceptProspectHandoff(ctx, params)).rejects.toThrow(HandoffTransitionError);
  });

  it("throws HandoffNotFoundError when the handoff no longer exists (source record deleted after discovery)", async () => {
    dbMocks.prospectHandoff.updateMany.mockResolvedValue({ count: 0 });
    dbMocks.prospectHandoff.findUnique.mockResolvedValue(null);

    await expect(acceptProspectHandoff(ctx, params)).rejects.toThrow(HandoffNotFoundError);
  });
});

describe("rejectProspectHandoff", () => {
  it("transitions READY -> REJECTED and logs", async () => {
    dbMocks.prospectHandoff.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.prospectHandoff.findUniqueOrThrow.mockResolvedValue(baseHandoff({ status: "REJECTED" }));

    const outcome = await rejectProspectHandoff(ctx, { handoffId: "ho-1", targetAgentOrDepartment: "RT_OFFICE" });

    expect(outcome.handoff.status).toBe("REJECTED");
    expect(logAgentActionMock).toHaveBeenCalledWith(expect.objectContaining({ action: "prospecting.handoff_rejected" }));
  });

  it("reject racing accept also resolves deterministically", async () => {
    dbMocks.prospectHandoff.updateMany.mockResolvedValue({ count: 0 });
    dbMocks.prospectHandoff.findUnique.mockResolvedValue(baseHandoff({ status: "ACCEPTED" }));

    await expect(rejectProspectHandoff(ctx, { handoffId: "ho-1", targetAgentOrDepartment: "RT_OFFICE" })).rejects.toThrow(
      HandoffTransitionError
    );
  });
});

describe("NEEDS_MORE_INFO <-> READY (spec: NEEDS_MORE_INFO may return to READY)", () => {
  it("READY -> NEEDS_MORE_INFO", async () => {
    dbMocks.prospectHandoff.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.prospectHandoff.findUniqueOrThrow.mockResolvedValue(baseHandoff({ status: "NEEDS_MORE_INFO" }));

    const outcome = await requestMoreInfoOnHandoff(ctx, { handoffId: "ho-1", targetAgentOrDepartment: "RT_OFFICE", decisionNote: "need a phone number" });

    expect(outcome.handoff.status).toBe("NEEDS_MORE_INFO");
  });

  it("NEEDS_MORE_INFO -> READY is the only legal way back out of that state", async () => {
    dbMocks.prospectHandoff.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.prospectHandoff.findUniqueOrThrow.mockResolvedValue(baseHandoff({ status: "READY" }));

    const outcome = await returnHandoffToReady(ctx, "ho-1");

    expect(outcome.handoff.status).toBe("READY");
    expect(dbMocks.prospectHandoff.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { in: ["NEEDS_MORE_INFO"] } }) })
    );
  });

  it("READY cannot be reached directly from ACCEPTED/REJECTED/DUPLICATE", async () => {
    dbMocks.prospectHandoff.updateMany.mockResolvedValue({ count: 0 });
    dbMocks.prospectHandoff.findUnique.mockResolvedValue(baseHandoff({ status: "ACCEPTED" }));

    await expect(returnHandoffToReady(ctx, "ho-1")).rejects.toThrow(HandoffTransitionError);
  });
});

describe("markHandoffDuplicate", () => {
  it("transitions READY -> DUPLICATE", async () => {
    dbMocks.prospectHandoff.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.prospectHandoff.findUniqueOrThrow.mockResolvedValue(baseHandoff({ status: "DUPLICATE" }));

    const outcome = await markHandoffDuplicate(ctx, "ho-1", "same phone number as ho-0");

    expect(outcome.handoff.status).toBe("DUPLICATE");
    expect(logAgentActionMock).toHaveBeenCalledWith(expect.objectContaining({ action: "prospecting.handoff_marked_duplicate" }));
  });
});
