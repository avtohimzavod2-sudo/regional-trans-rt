import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// Coverage for the passenger<->driver loop's own state machine: idempotent
// creation, CAS-guarded transitions, illegal-transition rejection, and the
// audit trail (correlationId/causationId) — spec items D/E/F/G/K/L/O/P/Q.
// This file mocks only @/lib/db and @/lib/agents/trace; every transition
// rule under test is the real LEGAL_RUN_TRANSITIONS/LEGAL_OFFER_TRANSITIONS
// table in passenger-loop.ts, not a re-implementation of it.

function p2002() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
}

const { dbMocks, logAgentActionMock } = vi.hoisted(() => ({
  dbMocks: {
    passengerLoopRun: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
    passengerLoopOffer: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  logAgentActionMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({ db: dbMocks }));
vi.mock("@/lib/agents/trace", () => ({ logAgentAction: logAgentActionMock }));

import {
  startPassengerDemandLoop,
  advanceLoopToMatching,
  recordNoSupply,
  recordOfferReady,
  recordOfferSent,
  recordDriverDeclined,
  recordPassengerAccepted,
  recordPassengerDeclined,
  recordOfferInvalidatedBySeatRace,
  recordOfferExpired,
  cancelPassengerLoop,
  LoopTransitionError,
  LoopNotFoundError,
} from "./passenger-loop";

const ctx = { traceId: "rt_test123", hop: 0 };

function runRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "loop-1",
    tripRequestId: "req-1",
    correlationId: "rt_test123",
    status: "NEW",
    noSupplyReason: null,
    noSupplyDetail: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("startPassengerDemandLoop — idempotent creation (spec G/P)", () => {
  it("creates a fresh run and drives it through NORMALIZED -> SUPPLY_REQUESTED", async () => {
    dbMocks.passengerLoopRun.create.mockResolvedValue(runRow());
    dbMocks.passengerLoopRun.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.passengerLoopRun.findUniqueOrThrow
      .mockResolvedValueOnce(runRow({ status: "NORMALIZED" }))
      .mockResolvedValueOnce(runRow({ status: "SUPPLY_REQUESTED" }));

    const result = await startPassengerDemandLoop(ctx, "req-1");

    expect(result.status).toBe("SUPPLY_REQUESTED");
    expect(dbMocks.passengerLoopRun.create).toHaveBeenCalledWith({ data: { tripRequestId: "req-1", correlationId: "rt_test123" } });
    expect(dbMocks.passengerLoopRun.updateMany).toHaveBeenCalledTimes(2);
  });

  it("a redelivered event that already produced this TripRequest reuses the existing run and never re-transitions it (no duplicate, no invented history)", async () => {
    dbMocks.passengerLoopRun.create.mockRejectedValue(p2002());
    dbMocks.passengerLoopRun.findUniqueOrThrow.mockResolvedValue(runRow({ status: "MATCHING" }));

    const result = await startPassengerDemandLoop(ctx, "req-1");

    expect(result.status).toBe("MATCHING");
    expect(dbMocks.passengerLoopRun.updateMany).not.toHaveBeenCalled();
  });
});

describe("run-level transitions — legality (spec O)", () => {
  it("advances SUPPLY_REQUESTED -> MATCHING", async () => {
    dbMocks.passengerLoopRun.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.passengerLoopRun.findUniqueOrThrow.mockResolvedValue(runRow({ status: "MATCHING" }));

    const row = await advanceLoopToMatching(ctx, "loop-1");

    expect(row.status).toBe("MATCHING");
    expect(dbMocks.passengerLoopRun.updateMany).toHaveBeenCalledWith({
      where: { id: "loop-1", status: { in: ["SUPPLY_REQUESTED", "NO_SUPPLY", "OFFER_READY", "PASSENGER_DECLINED", "EXPIRED"] } },
      data: { status: "MATCHING" },
    });
  });

  it("rejects an impossible transition (e.g. a terminal PASSENGER_ACCEPTED run cannot be pushed back to MATCHING)", async () => {
    dbMocks.passengerLoopRun.updateMany.mockResolvedValue({ count: 0 });
    dbMocks.passengerLoopRun.findUnique.mockResolvedValue(runRow({ status: "PASSENGER_ACCEPTED" }));

    await expect(advanceLoopToMatching(ctx, "loop-1")).rejects.toThrow(LoopTransitionError);
  });

  it("treats a retry landing on the already-current status as a safe dedup no-op, not an error", async () => {
    dbMocks.passengerLoopRun.updateMany.mockResolvedValue({ count: 0 });
    dbMocks.passengerLoopRun.findUnique.mockResolvedValue(runRow({ status: "MATCHING" }));

    const row = await advanceLoopToMatching(ctx, "loop-1");

    expect(row.status).toBe("MATCHING");
    expect(logAgentActionMock).not.toHaveBeenCalled();
  });

  it("throws LoopNotFoundError for a run id that does not exist", async () => {
    dbMocks.passengerLoopRun.updateMany.mockResolvedValue({ count: 0 });
    dbMocks.passengerLoopRun.findUnique.mockResolvedValue(null);

    await expect(advanceLoopToMatching(ctx, "missing")).rejects.toThrow(LoopNotFoundError);
  });
});

describe("recordNoSupply — fail-closed reasons chosen by the actual situation", () => {
  it.each([
    ["NO_SUPPLY", "NO_CANDIDATES"],
    ["TEMPORARILY_UNAVAILABLE", "JOLCHU_TIMEOUT"],
    ["NEEDS_CLARIFICATION", "JOLCHU_NEEDS_CONFIRMATION"],
  ] as const)("records reason=%s detail=%s verbatim, never defaulted", async (reason, detail) => {
    dbMocks.passengerLoopRun.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.passengerLoopRun.findUniqueOrThrow.mockResolvedValue(runRow({ status: "NO_SUPPLY", noSupplyReason: reason, noSupplyDetail: detail }));

    const row = await recordNoSupply(ctx, "loop-1", reason, detail);

    expect(row.noSupplyReason).toBe(reason);
    expect(row.noSupplyDetail).toBe(detail);
    expect(dbMocks.passengerLoopRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "NO_SUPPLY", noSupplyReason: reason, noSupplyDetail: detail }) }),
    );
  });
});

describe("recordOfferReady — a real candidate found (spec A/B)", () => {
  it("moves the run to OFFER_READY and creates a PassengerLoopOffer keyed on the real matchId", async () => {
    dbMocks.passengerLoopRun.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.passengerLoopRun.findUniqueOrThrow.mockResolvedValue(runRow({ status: "OFFER_READY" }));
    dbMocks.passengerLoopOffer.create.mockResolvedValue({ id: "offer-row-1", loopRunId: "loop-1", matchId: "match-1", driverOfferId: "do-1", status: "CANDIDATE" });

    const { run, offer } = await recordOfferReady(ctx, "loop-1", "match-1", "do-1");

    expect(run.status).toBe("OFFER_READY");
    expect(offer.matchId).toBe("match-1");
    expect(offer.driverOfferId).toBe("do-1");
    expect(dbMocks.passengerLoopOffer.create).toHaveBeenCalledWith({ data: { loopRunId: "loop-1", matchId: "match-1", driverOfferId: "do-1" } });
  });

  it("a duplicate delivery for the same match is idempotent — never a second offer row (spec G/P)", async () => {
    dbMocks.passengerLoopRun.updateMany.mockResolvedValue({ count: 0 });
    dbMocks.passengerLoopRun.findUnique.mockResolvedValue(runRow({ status: "OFFER_READY" }));
    dbMocks.passengerLoopOffer.create.mockRejectedValue(p2002());
    dbMocks.passengerLoopOffer.findUniqueOrThrow.mockResolvedValue({ id: "offer-row-1", matchId: "match-1", driverOfferId: "do-1", status: "CANDIDATE" });

    const { offer } = await recordOfferReady(ctx, "loop-1", "match-1", "do-1");

    expect(offer.id).toBe("offer-row-1");
  });
});

describe("recordOfferSent — driver accepted, passenger notified", () => {
  it("moves the offer CANDIDATE -> VALIDATED -> RESERVED_PENDING and the run to OFFER_SENT", async () => {
    dbMocks.passengerLoopOffer.findUnique.mockResolvedValue({ id: "offer-row-1", matchId: "match-1", status: "CANDIDATE" });
    dbMocks.passengerLoopOffer.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.passengerLoopOffer.findUniqueOrThrow
      .mockResolvedValueOnce({ id: "offer-row-1", matchId: "match-1", status: "VALIDATED" })
      .mockResolvedValueOnce({ id: "offer-row-1", matchId: "match-1", status: "RESERVED_PENDING" });
    dbMocks.passengerLoopRun.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.passengerLoopRun.findUniqueOrThrow.mockResolvedValue(runRow({ status: "OFFER_SENT" }));

    const row = await recordOfferSent(ctx, "loop-1", "match-1");

    expect(row.status).toBe("OFFER_SENT");
    expect(dbMocks.passengerLoopOffer.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: { status: "VALIDATED" } }));
    expect(dbMocks.passengerLoopOffer.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: { status: "RESERVED_PENDING" } }));
  });
});

describe("driver decline mid-matching (spec K)", () => {
  it("rejects the declined offer and rematches back into MATCHING when a next candidate exists", async () => {
    dbMocks.passengerLoopOffer.findUnique.mockResolvedValue({ id: "offer-row-1", matchId: "match-1", status: "CANDIDATE" });
    dbMocks.passengerLoopOffer.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.passengerLoopOffer.findUniqueOrThrow.mockResolvedValue({ id: "offer-row-1", matchId: "match-1", status: "REJECTED" });
    dbMocks.passengerLoopRun.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.passengerLoopRun.findUniqueOrThrow.mockResolvedValue(runRow({ status: "MATCHING" }));

    const row = await recordDriverDeclined(ctx, "loop-1", "match-1", true);

    expect(row.status).toBe("MATCHING");
  });

  it("falls to NO_SUPPLY when no next candidate exists — never fabricates a match", async () => {
    dbMocks.passengerLoopOffer.findUnique.mockResolvedValue({ id: "offer-row-1", matchId: "match-1", status: "CANDIDATE" });
    dbMocks.passengerLoopOffer.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.passengerLoopOffer.findUniqueOrThrow.mockResolvedValue({ id: "offer-row-1", matchId: "match-1", status: "REJECTED" });
    dbMocks.passengerLoopRun.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.passengerLoopRun.findUniqueOrThrow.mockResolvedValue(runRow({ status: "NO_SUPPLY", noSupplyReason: "NO_SUPPLY" }));

    const row = await recordDriverDeclined(ctx, "loop-1", "match-1", false);

    expect(row.status).toBe("NO_SUPPLY");
    expect(dbMocks.passengerLoopRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ noSupplyReason: "NO_SUPPLY", noSupplyDetail: "NO_CANDIDATES_AFTER_DRIVER_DECLINE" }) }),
    );
  });
});

describe("seat race loss (spec F — two passengers racing for the last seat)", () => {
  it("invalidates the offer and never reports a fabricated success", async () => {
    dbMocks.passengerLoopOffer.findUnique.mockResolvedValue({ id: "offer-row-1", matchId: "match-1", status: "RESERVED_PENDING" });
    dbMocks.passengerLoopOffer.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.passengerLoopOffer.findUniqueOrThrow.mockResolvedValue({ id: "offer-row-1", matchId: "match-1", status: "INVALIDATED" });
    dbMocks.passengerLoopRun.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.passengerLoopRun.findUniqueOrThrow.mockResolvedValue(runRow({ status: "NO_SUPPLY", noSupplyReason: "NO_SUPPLY" }));

    const row = await recordOfferInvalidatedBySeatRace(ctx, "loop-1", "match-1", false);

    expect(row.status).toBe("NO_SUPPLY");
    expect(dbMocks.passengerLoopOffer.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "INVALIDATED" } }));
  });
});

describe("expiry (spec E — stale offer)", () => {
  it("expires the offer and the run, then rematches if a next candidate was found", async () => {
    dbMocks.passengerLoopOffer.findUnique.mockResolvedValue({ id: "offer-row-1", matchId: "match-1", status: "RESERVED_PENDING" });
    dbMocks.passengerLoopOffer.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.passengerLoopOffer.findUniqueOrThrow.mockResolvedValue({ id: "offer-row-1", matchId: "match-1", status: "EXPIRED" });
    dbMocks.passengerLoopRun.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.passengerLoopRun.findUniqueOrThrow.mockResolvedValue(runRow({ status: "MATCHING" }));

    const row = await recordOfferExpired(ctx, "loop-1", "match-1", true);

    expect(row.status).toBe("MATCHING");
  });
});

describe("passenger accepted — terminal success", () => {
  it("marks the offer ACCEPTED and the run PASSENGER_ACCEPTED", async () => {
    dbMocks.passengerLoopOffer.findUnique.mockResolvedValue({ id: "offer-row-1", matchId: "match-1", status: "RESERVED_PENDING" });
    dbMocks.passengerLoopOffer.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.passengerLoopOffer.findUniqueOrThrow.mockResolvedValue({ id: "offer-row-1", matchId: "match-1", status: "ACCEPTED" });
    dbMocks.passengerLoopRun.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.passengerLoopRun.findUniqueOrThrow.mockResolvedValue(runRow({ status: "PASSENGER_ACCEPTED" }));

    const row = await recordPassengerAccepted(ctx, "loop-1", "match-1");

    expect(row.status).toBe("PASSENGER_ACCEPTED");
  });
});

describe("passenger decline (mirrors driver decline)", () => {
  it("goes through PASSENGER_DECLINED then back to MATCHING on rematch", async () => {
    dbMocks.passengerLoopOffer.findUnique.mockResolvedValue({ id: "offer-row-1", matchId: "match-1", status: "RESERVED_PENDING" });
    dbMocks.passengerLoopOffer.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.passengerLoopOffer.findUniqueOrThrow.mockResolvedValue({ id: "offer-row-1", matchId: "match-1", status: "REJECTED" });
    dbMocks.passengerLoopRun.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.passengerLoopRun.findUniqueOrThrow
      .mockResolvedValueOnce(runRow({ status: "PASSENGER_DECLINED" }))
      .mockResolvedValueOnce(runRow({ status: "MATCHING" }));

    const row = await recordPassengerDeclined(ctx, "loop-1", "match-1", true);

    expect(row.status).toBe("MATCHING");
  });
});

describe("cancelPassengerLoop (spec L — passenger cancels)", () => {
  it("invalidates any open offer and marks the run CANCELLED — a true terminal", async () => {
    dbMocks.passengerLoopRun.findUnique.mockResolvedValue(runRow({ status: "MATCHING" }));
    dbMocks.passengerLoopOffer.findFirst.mockResolvedValue({ id: "offer-row-1", status: "CANDIDATE" });
    dbMocks.passengerLoopOffer.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.passengerLoopOffer.findUniqueOrThrow.mockResolvedValue({ id: "offer-row-1", status: "INVALIDATED" });
    dbMocks.passengerLoopRun.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.passengerLoopRun.findUniqueOrThrow.mockResolvedValue(runRow({ status: "CANCELLED" }));

    const row = await cancelPassengerLoop(ctx, "req-1");

    expect(row?.status).toBe("CANCELLED");
    expect(dbMocks.passengerLoopOffer.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "INVALIDATED" } }));
  });

  it("is a no-op, not an error, when no loop run exists for this TripRequest", async () => {
    dbMocks.passengerLoopRun.findUnique.mockResolvedValue(null);

    const row = await cancelPassengerLoop(ctx, "req-missing");

    expect(row).toBeNull();
    expect(dbMocks.passengerLoopRun.updateMany).not.toHaveBeenCalled();
  });

  it("is idempotent against a run that already reached a terminal status (race with a concurrent acceptance)", async () => {
    dbMocks.passengerLoopRun.findUnique.mockResolvedValue(runRow({ status: "PASSENGER_ACCEPTED" }));
    dbMocks.passengerLoopOffer.findFirst.mockResolvedValue(null);
    dbMocks.passengerLoopRun.updateMany.mockResolvedValue({ count: 0 });
    dbMocks.passengerLoopRun.findUniqueOrThrow.mockResolvedValue(runRow({ status: "PASSENGER_ACCEPTED" }));

    const row = await cancelPassengerLoop(ctx, "req-1");

    expect(row?.status).toBe("PASSENGER_ACCEPTED");
  });
});

describe("audit trail (spec Q — the chain must be reconstructable)", () => {
  it("tags every real transition with the run's correlationId and the caller's causationId", async () => {
    dbMocks.passengerLoopRun.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.passengerLoopRun.findUniqueOrThrow.mockResolvedValue(runRow({ status: "MATCHING", correlationId: "rt_root" }));

    await advanceLoopToMatching(ctx, "loop-1");

    expect(logAgentActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "RT_OFFICE",
        action: "rt_office.passenger_loop_transition",
        entityType: "PassengerLoopRun",
        entityId: "loop-1",
        details: expect.objectContaining({ toStatus: "MATCHING", correlationId: "rt_root", causationId: ctx.traceId }),
      }),
    );
  });
});
