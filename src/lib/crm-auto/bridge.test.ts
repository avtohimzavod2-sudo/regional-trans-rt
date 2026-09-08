import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMocks } = vi.hoisted(() => ({
  dbMocks: {
    driveCrmEvent: {
      findFirst: vi.fn(),
    },
  },
}));
vi.mock("@/lib/db", () => ({ db: dbMocks }));

import { latestOpenBreakdownForDriver } from "./bridge";

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
