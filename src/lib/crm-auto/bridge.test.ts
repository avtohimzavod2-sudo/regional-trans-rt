import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMocks } = vi.hoisted(() => ({
  dbMocks: {
    driveCrmEvent: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/db", () => ({ db: dbMocks }));

import { latestOpenBreakdownForDriver, latestVerifiedEtaForOffers } from "./bridge";

describe("latestOpenBreakdownForDriver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports no breakdown when the driver has no BREAKDOWN_INCIDENT rows at all", async () => {
    dbMocks.driveCrmEvent.findFirst.mockResolvedValueOnce(null);

    const fact = await latestOpenBreakdownForDriver("d1");

    expect(fact).toEqual({ hasOpenBreakdown: false });
  });

  it("reports a breakdown when the most recent BREAKDOWN_INCIDENT row is OPEN and uncorrected", async () => {
    dbMocks.driveCrmEvent.findFirst
      .mockResolvedValueOnce({ id: "evt-open", incidentStatus: "OPEN" })
      .mockResolvedValueOnce(null);

    const fact = await latestOpenBreakdownForDriver("d1");

    expect(fact).toEqual({ hasOpenBreakdown: true });
  });

  it("reports no breakdown once a newer RESOLVED row is the most recent BREAKDOWN_INCIDENT (not just 'any OPEN row exists')", async () => {
    // The original OPEN row is never deleted (append-only) — it must not be
    // enough to keep matching a naive "any incidentStatus: OPEN" filter.
    dbMocks.driveCrmEvent.findFirst.mockResolvedValueOnce({ id: "evt-resolved", incidentStatus: "RESOLVED" });

    const fact = await latestOpenBreakdownForDriver("d1");

    expect(fact).toEqual({ hasOpenBreakdown: false });
    expect(dbMocks.driveCrmEvent.findFirst).toHaveBeenCalledTimes(1);
  });

  it("reports no breakdown once an exceptional CORRECTION references the latest OPEN incident, without ever mutating it", async () => {
    dbMocks.driveCrmEvent.findFirst
      .mockResolvedValueOnce({ id: "evt-false-breakdown", incidentStatus: "OPEN" })
      .mockResolvedValueOnce({ id: "evt-correction", correctsEventId: "evt-false-breakdown" });

    const fact = await latestOpenBreakdownForDriver("d1");

    expect(fact).toEqual({ hasOpenBreakdown: false });
    expect(dbMocks.driveCrmEvent.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: expect.objectContaining({ eventType: "CORRECTION", correctsEventId: "evt-false-breakdown" }) }),
    );
  });

  it("does not let a correction for an older, already-superseded incident affect the current OPEN one", async () => {
    dbMocks.driveCrmEvent.findFirst
      .mockResolvedValueOnce({ id: "evt-open-2", incidentStatus: "OPEN" })
      .mockResolvedValueOnce(null); // no CORRECTION references evt-open-2 specifically

    const fact = await latestOpenBreakdownForDriver("d1");

    expect(fact).toEqual({ hasOpenBreakdown: true });
  });
});

describe("latestVerifiedEtaForOffers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty map without querying when given no offer ids", async () => {
    const result = await latestVerifiedEtaForOffers([]);

    expect(result).toEqual(new Map());
    expect(dbMocks.driveCrmEvent.findMany).not.toHaveBeenCalled();
  });

  it("reports null ETA facts for offers with no OPERATIONAL_ETA event, never fabricating a value", async () => {
    dbMocks.driveCrmEvent.findMany.mockResolvedValue([]);

    const result = await latestVerifiedEtaForOffers(["offer-1", "offer-2"]);

    expect(result.get("offer-1")).toEqual({ etaMinutes: null, freshness: null, delayed: false, arrived: false });
    expect(result.get("offer-2")).toEqual({ etaMinutes: null, freshness: null, delayed: false, arrived: false });
  });

  it("picks the most recent OPERATIONAL_ETA event per offer in a single query (one findMany regardless of offer count)", async () => {
    const older = { offerId: "offer-1", etaMinutes: 40, source: "JOLCHU", createdAt: new Date("2026-09-09T10:00:00Z"), details: null };
    const newer = { offerId: "offer-1", etaMinutes: 20, source: "JOLCHU", createdAt: new Date("2026-09-09T12:00:00Z"), details: { delayed: true } };
    // Query is ordered by createdAt desc, so the mock returns newest-first.
    dbMocks.driveCrmEvent.findMany.mockResolvedValue([newer, older]);

    const result = await latestVerifiedEtaForOffers(["offer-1"]);

    expect(dbMocks.driveCrmEvent.findMany).toHaveBeenCalledTimes(1);
    expect(result.get("offer-1")).toEqual({
      etaMinutes: 20,
      freshness: { source: "JOLCHU", asOf: newer.createdAt.toISOString() },
      delayed: true,
      arrived: false,
    });
  });

  it("deduplicates repeated offer ids before querying", async () => {
    dbMocks.driveCrmEvent.findMany.mockResolvedValue([]);

    await latestVerifiedEtaForOffers(["offer-1", "offer-1"]);

    expect(dbMocks.driveCrmEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ offerId: { in: ["offer-1"] } }) }),
    );
  });
});
