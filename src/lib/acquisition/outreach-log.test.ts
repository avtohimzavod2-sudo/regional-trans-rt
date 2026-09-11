import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// Direct exercise of sendAcquisitionOutreach's actual safety-gate logic (spec
// s.14 items E/G) — every contractor test mocks this function away entirely,
// so without this file the gate itself (do-not-contact, cross-type
// fingerprint block, centralized rate-limit cooldown, mode resolution,
// idempotent retry) has zero direct coverage.
const { dbMocks, adapterForChannelMock } = vi.hoisted(() => ({
  dbMocks: {
    acquisitionOutreachEvent: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
    },
  },
  adapterForChannelMock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: dbMocks }));
vi.mock("./adapters", () => ({ adapterForChannel: adapterForChannelMock }));

import { isDoNotContact, isDoNotContactFingerprint, recordOptOut, sendAcquisitionOutreach } from "./outreach-log";

function p2002Error() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
}

const baseRequest = {
  contractorAgent: "PASSENGER_CONTRACTOR" as const,
  prospectType: "PASSENGER" as const,
  prospectRef: "p-1",
  channel: "WHATSAPP" as const,
  sourceType: "TELEGRAM_GROUP" as const,
  sourceRef: null,
  to: "996700000000",
  text: "hello",
  idempotencyKey: "passenger:p-1:outreach",
};

describe("sendAcquisitionOutreach safety gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ACQUISITION_OUTREACH_MODE;
    dbMocks.acquisitionOutreachEvent.findFirst.mockResolvedValue(null);
    dbMocks.acquisitionOutreachEvent.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "evt-1",
      ...data,
    }));
  });

  it("E: a per-prospect do-not-contact flag blocks outreach before any adapter is touched", async () => {
    dbMocks.acquisitionOutreachEvent.findFirst.mockResolvedValueOnce({ id: "prior-optout" });

    const outcome = await sendAcquisitionOutreach(baseRequest);

    expect(outcome.status).toBe("DO_NOT_CONTACT");
    expect(adapterForChannelMock).not.toHaveBeenCalled();
    expect(dbMocks.acquisitionOutreachEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "DO_NOT_CONTACT" }) }),
    );
  });

  it("E: a cross-type contactFingerprint opt-out blocks outreach even when the per-prospect check passes", async () => {
    dbMocks.acquisitionOutreachEvent.findFirst
      .mockResolvedValueOnce(null) // isDoNotContact (per-prospect)
      .mockResolvedValueOnce({ id: "prior-optout-elsewhere" }); // isDoNotContactFingerprint

    const outcome = await sendAcquisitionOutreach({ ...baseRequest, contactFingerprint: "phone:996700000000" });

    expect(outcome.status).toBe("DO_NOT_CONTACT");
    expect(dbMocks.acquisitionOutreachEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "DO_NOT_CONTACT", doNotContact: true }) }),
    );
    expect(adapterForChannelMock).not.toHaveBeenCalled();
  });

  it("a request with no contactFingerprint never even queries the cross-type opt-out store", async () => {
    await sendAcquisitionOutreach(baseRequest);
    expect(dbMocks.acquisitionOutreachEvent.findFirst).toHaveBeenCalledTimes(2); // isDoNotContact + recentlyContacted only
  });

  it("G: a prospect contacted within the cooldown window is rate-limited, independent of contractor", async () => {
    dbMocks.acquisitionOutreachEvent.findFirst
      .mockResolvedValueOnce(null) // isDoNotContact
      .mockResolvedValueOnce({ id: "recent-send", status: "SENT" }); // recentlyContacted

    const outcome = await sendAcquisitionOutreach(baseRequest);

    expect(outcome.status).toBe("RATE_LIMITED");
    expect(adapterForChannelMock).not.toHaveBeenCalled();
  });

  it("G: the rate-limit check only counts prior SENT events, not DRY_RUN/RATE_LIMITED noise", async () => {
    await sendAcquisitionOutreach(baseRequest);

    expect(dbMocks.acquisitionOutreachEvent.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: expect.objectContaining({ status: "SENT" }) }),
    );
  });

  it("defaults to DRY_RUN when ACQUISITION_OUTREACH_MODE is unset — never a fabricated SENT", async () => {
    const outcome = await sendAcquisitionOutreach(baseRequest);

    expect(outcome.status).toBe("DRY_RUN");
    expect(adapterForChannelMock).not.toHaveBeenCalled();
  });

  it("defaults to DRY_RUN for an unrecognized mode value rather than defaulting to LIVE", async () => {
    process.env.ACQUISITION_OUTREACH_MODE = "banana";

    const outcome = await sendAcquisitionOutreach(baseRequest);

    expect(outcome.status).toBe("DRY_RUN");
    expect(adapterForChannelMock).not.toHaveBeenCalled();
  });

  it("honestly reports SANDBOX mode without touching a real adapter", async () => {
    process.env.ACQUISITION_OUTREACH_MODE = "SANDBOX";

    const outcome = await sendAcquisitionOutreach(baseRequest);

    expect(outcome.status).toBe("SANDBOX");
    expect(adapterForChannelMock).not.toHaveBeenCalled();
  });

  it("LIVE mode with no configured adapter honestly reports NO_PROVIDER_CONFIGURED rather than a fake send", async () => {
    process.env.ACQUISITION_OUTREACH_MODE = "LIVE";
    adapterForChannelMock.mockReturnValue(null);

    const outcome = await sendAcquisitionOutreach(baseRequest);

    expect(outcome.status).toBe("NO_PROVIDER_CONFIGURED");
  });

  it("LIVE mode with a configured adapter that delivers reports SENT", async () => {
    process.env.ACQUISITION_OUTREACH_MODE = "LIVE";
    adapterForChannelMock.mockReturnValue({ isConfigured: () => true, send: vi.fn().mockResolvedValue({ delivered: true }) });

    const outcome = await sendAcquisitionOutreach(baseRequest);

    expect(outcome.status).toBe("SENT");
  });

  it("LIVE mode surfaces a failed adapter send as FAILED, not a thrown error", async () => {
    process.env.ACQUISITION_OUTREACH_MODE = "LIVE";
    adapterForChannelMock.mockReturnValue({ isConfigured: () => true, send: vi.fn().mockResolvedValue({ delivered: false }) });

    const outcome = await sendAcquisitionOutreach(baseRequest);

    expect(outcome.status).toBe("FAILED");
  });

  it("LIVE mode swallows an adapter throw and still records FAILED rather than crashing the caller", async () => {
    process.env.ACQUISITION_OUTREACH_MODE = "LIVE";
    adapterForChannelMock.mockReturnValue({ isConfigured: () => true, send: vi.fn().mockRejectedValue(new Error("network down")) });

    const outcome = await sendAcquisitionOutreach(baseRequest);

    expect(outcome.status).toBe("FAILED");
  });

  it("S: a duplicated outreach attempt with the same idempotencyKey (webhook/source replay) is deduplicated, not double-logged", async () => {
    dbMocks.acquisitionOutreachEvent.create.mockRejectedValueOnce(p2002Error());
    dbMocks.acquisitionOutreachEvent.findUniqueOrThrow.mockResolvedValue({ id: "evt-existing", status: "DRY_RUN" });

    const outcome = await sendAcquisitionOutreach(baseRequest);

    expect(outcome).toEqual({ status: "DRY_RUN", eventId: "evt-existing", deduplicated: true });
  });

  it("propagates a non-P2002 database error rather than silently swallowing it", async () => {
    dbMocks.acquisitionOutreachEvent.create.mockRejectedValueOnce(new Error("connection lost"));

    await expect(sendAcquisitionOutreach(baseRequest)).rejects.toThrow("connection lost");
  });
});

describe("recordOptOut", () => {
  it("appends a DO_NOT_CONTACT event rather than mutating any prior row", async () => {
    const dbMocksLocal = dbMocks;
    dbMocksLocal.acquisitionOutreachEvent.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "opt-1", ...data }));

    const outcome = await recordOptOut({
      contractorAgent: "PASSENGER_CONTRACTOR",
      prospectType: "PASSENGER",
      prospectRef: "p-1",
      channel: "WHATSAPP",
      sourceType: "TELEGRAM_GROUP",
      idempotencyKey: "passenger:p-1:optout",
      contactFingerprint: "phone:996700000000",
    });

    expect(outcome.status).toBe("DO_NOT_CONTACT");
    expect(dbMocksLocal.acquisitionOutreachEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ doNotContact: true, contactFingerprint: "phone:996700000000" }) }),
    );
  });
});

describe("isDoNotContact / isDoNotContactFingerprint read paths", () => {
  it("isDoNotContact reflects whether any flagged event exists for this exact prospect", async () => {
    dbMocks.acquisitionOutreachEvent.findFirst.mockResolvedValueOnce(null);
    expect(await isDoNotContact("PASSENGER", "p-1")).toBe(false);

    dbMocks.acquisitionOutreachEvent.findFirst.mockResolvedValueOnce({ id: "x" });
    expect(await isDoNotContact("PASSENGER", "p-1")).toBe(true);
  });

  it("isDoNotContactFingerprint reflects whether any flagged event exists for this fingerprint across contragents", async () => {
    dbMocks.acquisitionOutreachEvent.findFirst.mockResolvedValueOnce({ id: "x" });
    expect(await isDoNotContactFingerprint("phone:996700000000")).toBe(true);
  });
});
