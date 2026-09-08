import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { dbMocks, logActionMock } = vi.hoisted(() => ({
  dbMocks: {
    driveCrmEvent: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
    },
  },
  logActionMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/db", () => ({ db: dbMocks }));
vi.mock("@/lib/audit", () => ({ logAction: logActionMock }));

import { openBreakdownIncident, recordExceptionalCorrection, recordOperationalEvent, resolveBreakdownIncident } from "./orchestrator";

function p2002Error() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });
}

describe("recordOperationalEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an invalid draft without touching the database", async () => {
    await expect(
      recordOperationalEvent({ driverId: "d1", eventType: "OPERATIONAL_ETA", source: "JOLCHU", idempotencyKey: "k1" })
    ).rejects.toThrow(/never invents an ETA/);
    expect(dbMocks.driveCrmEvent.create).not.toHaveBeenCalled();
  });

  it("creates a new event and logs it when the idempotencyKey is unused", async () => {
    dbMocks.driveCrmEvent.create.mockResolvedValue({ id: "evt-1" });

    const outcome = await recordOperationalEvent({
      driverId: "d1",
      eventType: "OPERATIONAL_ETA",
      etaMinutes: 15,
      source: "JOLCHU",
      idempotencyKey: "k1",
    });

    expect(outcome).toEqual({ eventId: "evt-1", deduplicated: false });
    expect(dbMocks.driveCrmEvent.create).toHaveBeenCalledTimes(1);
    expect(logActionMock).toHaveBeenCalledWith(expect.objectContaining({ actorId: "CRM_AUTO", entityId: "evt-1" }));
  });

  it("treats a duplicate webhook delivery as a safe no-op by returning the already-recorded event", async () => {
    dbMocks.driveCrmEvent.create.mockRejectedValue(p2002Error());
    dbMocks.driveCrmEvent.findUniqueOrThrow.mockResolvedValue({ id: "evt-existing" });

    const outcome = await recordOperationalEvent({
      driverId: "d1",
      eventType: "OPERATIONAL_ETA",
      etaMinutes: 15,
      source: "JOLCHU",
      idempotencyKey: "k1",
    });

    expect(outcome).toEqual({ eventId: "evt-existing", deduplicated: true });
    expect(logActionMock).not.toHaveBeenCalled();
  });

  it("propagates a non-P2002 database error", async () => {
    dbMocks.driveCrmEvent.create.mockRejectedValue(new Error("connection lost"));

    await expect(
      recordOperationalEvent({ driverId: "d1", eventType: "OPERATIONAL_HISTORY", source: "SYSTEM", idempotencyKey: "k1" })
    ).rejects.toThrow("connection lost");
  });
});

describe("openBreakdownIncident / resolveBreakdownIncident", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens a breakdown when no OPEN incident already exists", async () => {
    dbMocks.driveCrmEvent.findFirst.mockResolvedValue(null);
    dbMocks.driveCrmEvent.create.mockResolvedValue({ id: "evt-open" });

    const outcome = await openBreakdownIncident({ driverId: "d1", source: "DRIVER_REPORT", idempotencyKey: "k-open" });

    expect(outcome).toEqual({ eventId: "evt-open", deduplicated: false });
  });

  it("rejects opening a second concurrent OPEN incident for the same driver", async () => {
    dbMocks.driveCrmEvent.findFirst.mockResolvedValue({ id: "evt-existing-open", incidentStatus: "OPEN" });

    await expect(openBreakdownIncident({ driverId: "d1", source: "DRIVER_REPORT", idempotencyKey: "k-open-2" })).rejects.toThrow(
      /already exists/
    );
    expect(dbMocks.driveCrmEvent.create).not.toHaveBeenCalled();
  });

  it("resolves a breakdown when an OPEN incident exists", async () => {
    dbMocks.driveCrmEvent.findFirst.mockResolvedValue({ id: "evt-existing-open", incidentStatus: "OPEN" });
    dbMocks.driveCrmEvent.create.mockResolvedValue({ id: "evt-resolved" });

    const outcome = await resolveBreakdownIncident({ driverId: "d1", source: "DRIVER_REPORT", idempotencyKey: "k-resolve" });

    expect(outcome).toEqual({ eventId: "evt-resolved", deduplicated: false });
  });

  it("rejects resolving a breakdown when no OPEN incident exists (never invents a resolution)", async () => {
    dbMocks.driveCrmEvent.findFirst.mockResolvedValue(null);

    await expect(resolveBreakdownIncident({ driverId: "d1", source: "DRIVER_REPORT", idempotencyKey: "k-resolve-2" })).rejects.toThrow(
      /no OPEN breakdown incident/
    );
    expect(dbMocks.driveCrmEvent.create).not.toHaveBeenCalled();
  });
});

describe("recordExceptionalCorrection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a CORRECTION event referencing the event it corrects, tagged with a distinct audit action", async () => {
    dbMocks.driveCrmEvent.create.mockResolvedValue({ id: "evt-correction" });

    const outcome = await recordExceptionalCorrection({
      driverId: "d1",
      correctsEventId: "evt-false-breakdown",
      reason: "driver reported breakdown in error, confirmed operational by dispatch",
      source: "RT_OFFICE",
      idempotencyKey: "k-correction",
    });

    expect(outcome).toEqual({ eventId: "evt-correction", deduplicated: false });
    expect(dbMocks.driveCrmEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "CORRECTION", correctsEventId: "evt-false-breakdown" }),
      }),
    );
    expect(logActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "crm_auto.exceptional_correction", entityId: "evt-correction" }),
    );
  });

  it("never mutates the original event — a correction is always a new appended row via create, not an update", async () => {
    dbMocks.driveCrmEvent.create.mockResolvedValue({ id: "evt-correction-2" });

    await recordExceptionalCorrection({
      driverId: "d1",
      correctsEventId: "evt-original",
      reason: "eta source was stale",
      source: "SYSTEM",
      idempotencyKey: "k-correction-2",
    });

    expect(dbMocks.driveCrmEvent.create).toHaveBeenCalledTimes(1);
  });

  it("is idempotent against duplicate correction delivery", async () => {
    dbMocks.driveCrmEvent.create.mockRejectedValue(p2002Error());
    dbMocks.driveCrmEvent.findUniqueOrThrow.mockResolvedValue({ id: "evt-correction-existing" });

    const outcome = await recordExceptionalCorrection({
      driverId: "d1",
      correctsEventId: "evt-original",
      reason: "duplicate delivery",
      source: "SYSTEM",
      idempotencyKey: "k-correction-dup",
    });

    expect(outcome).toEqual({ eventId: "evt-correction-existing", deduplicated: true });
  });
});
