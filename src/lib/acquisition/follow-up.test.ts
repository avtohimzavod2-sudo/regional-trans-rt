import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { dbMocks, sendAcquisitionOutreachMock, logAgentActionMock } = vi.hoisted(() => ({
  dbMocks: {
    prospectFollowUpAttempt: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
  },
  sendAcquisitionOutreachMock: vi.fn(),
  logAgentActionMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/db", () => ({ db: dbMocks }));
vi.mock("@/lib/acquisition/outreach-log", () => ({ sendAcquisitionOutreach: sendAcquisitionOutreachMock }));
vi.mock("@/lib/agents/trace", () => ({ logAgentAction: logAgentActionMock }));

import { MAX_FOLLOW_UP_ATTEMPTS, sendProspectFollowUp } from "./follow-up";

function p2002Error() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
}

const ctx = { traceId: "t1", hop: 0 };

const baseParams = {
  contractorAgent: "DELIVERY_EXECUTOR_CONTRACTOR" as const,
  prospectType: "DELIVERY_EXECUTOR" as const,
  prospectRef: "dep-1",
  channel: "WHATSAPP" as const,
  sourceType: "TELEGRAM_GROUP" as const,
  sourceRef: null,
  to: "996700000000",
  text: "checking in",
  idempotencyKey: "dep-1:follow-up:1",
  hasResponded: false,
  isTerminal: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.prospectFollowUpAttempt.findUnique.mockResolvedValue(null);
  dbMocks.prospectFollowUpAttempt.count.mockResolvedValue(0);
  sendAcquisitionOutreachMock.mockResolvedValue({ status: "DRY_RUN", eventId: "evt-1", deduplicated: false });
  dbMocks.prospectFollowUpAttempt.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "fu-1",
    createdAt: new Date(),
    ...data,
  }));
});

describe("sendProspectFollowUp — stop conditions (spec F)", () => {
  it("stops without sending once the prospect has responded", async () => {
    const outcome = await sendProspectFollowUp(ctx, { ...baseParams, hasResponded: true });

    expect(outcome).toEqual({ sent: false, skippedReason: "ALREADY_RESPONDED", attemptNumber: 0, deduplicated: false });
    expect(sendAcquisitionOutreachMock).not.toHaveBeenCalled();
    expect(dbMocks.prospectFollowUpAttempt.create).not.toHaveBeenCalled();
  });

  it("stops without sending once the prospect has reached a terminal lifecycle stage (rejected/handed off/closed)", async () => {
    const outcome = await sendProspectFollowUp(ctx, { ...baseParams, isTerminal: true });

    expect(outcome.sent).toBe(false);
    expect(outcome.skippedReason).toBe("TERMINAL_STAGE");
    expect(sendAcquisitionOutreachMock).not.toHaveBeenCalled();
  });

  it("stops without sending once MAX_FOLLOW_UP_ATTEMPTS has been reached — never an unbounded loop", async () => {
    dbMocks.prospectFollowUpAttempt.count.mockResolvedValue(MAX_FOLLOW_UP_ATTEMPTS);

    const outcome = await sendProspectFollowUp(ctx, baseParams);

    expect(outcome).toEqual({ sent: false, skippedReason: "LIMIT_REACHED", attemptNumber: MAX_FOLLOW_UP_ATTEMPTS, deduplicated: false });
    expect(sendAcquisitionOutreachMock).not.toHaveBeenCalled();
  });

  it("sends while under the bound and records the attempt", async () => {
    dbMocks.prospectFollowUpAttempt.count.mockResolvedValue(1);

    const outcome = await sendProspectFollowUp(ctx, baseParams);

    expect(outcome.sent).toBe(true);
    expect(outcome.attemptNumber).toBe(2);
    expect(dbMocks.prospectFollowUpAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ attemptNumber: 2, outreachStatus: "DRY_RUN", idempotencyKey: baseParams.idempotencyKey }) }),
    );
    expect(logAgentActionMock).toHaveBeenCalledWith(expect.objectContaining({ action: "prospecting.follow_up_sent" }));
  });
});

describe("sendProspectFollowUp — idempotent retry (spec D)", () => {
  it("a retried call with the same idempotencyKey returns the existing attempt without re-sending", async () => {
    dbMocks.prospectFollowUpAttempt.findUnique.mockResolvedValue({
      id: "fu-1",
      attemptNumber: 1,
      outreachStatus: "SENT",
      idempotencyKey: baseParams.idempotencyKey,
    });

    const outcome = await sendProspectFollowUp(ctx, baseParams);

    expect(outcome).toEqual({ sent: true, outreachStatus: "SENT", attemptNumber: 1, deduplicated: true });
    expect(sendAcquisitionOutreachMock).not.toHaveBeenCalled();
    expect(dbMocks.prospectFollowUpAttempt.create).not.toHaveBeenCalled();
    expect(logAgentActionMock).not.toHaveBeenCalled();
  });

  it("a race that P2002s on create still returns the winning row rather than throwing", async () => {
    dbMocks.prospectFollowUpAttempt.create.mockRejectedValue(p2002Error());
    dbMocks.prospectFollowUpAttempt.findUniqueOrThrow.mockResolvedValue({
      id: "fu-1",
      attemptNumber: 1,
      outreachStatus: "DRY_RUN",
      idempotencyKey: baseParams.idempotencyKey,
    });

    const outcome = await sendProspectFollowUp(ctx, baseParams);

    expect(outcome.deduplicated).toBe(true);
    expect(outcome.attemptNumber).toBe(1);
  });

  it("propagates a non-P2002 database error rather than silently swallowing it", async () => {
    dbMocks.prospectFollowUpAttempt.create.mockRejectedValue(new Error("connection lost"));

    await expect(sendProspectFollowUp(ctx, baseParams)).rejects.toThrow("connection lost");
  });
});

describe("sendProspectFollowUp — outreach status passthrough", () => {
  it("reports sent:false when the shared outreach gate refuses (e.g. RATE_LIMITED) while still recording the attempt", async () => {
    sendAcquisitionOutreachMock.mockResolvedValue({ status: "RATE_LIMITED", eventId: "evt-2", deduplicated: false });

    const outcome = await sendProspectFollowUp(ctx, baseParams);

    expect(outcome.sent).toBe(false);
    expect(outcome.outreachStatus).toBe("RATE_LIMITED");
    expect(dbMocks.prospectFollowUpAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ outreachStatus: "RATE_LIMITED" }) }),
    );
  });

  it("reports sent:false when the shared outreach gate honors a do-not-contact flag", async () => {
    sendAcquisitionOutreachMock.mockResolvedValue({ status: "DO_NOT_CONTACT", eventId: "evt-3", deduplicated: false });

    const outcome = await sendProspectFollowUp(ctx, baseParams);

    expect(outcome.sent).toBe(false);
    expect(outcome.outreachStatus).toBe("DO_NOT_CONTACT");
  });
});
