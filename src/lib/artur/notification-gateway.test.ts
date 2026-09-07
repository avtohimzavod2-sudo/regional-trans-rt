import { describe, expect, it, vi, beforeEach } from "vitest";

// NotificationGateway is the one Artur module whose core behavior (spec s.22
// idempotency, spec s.30 "never fake delivery without a real channel") is
// genuinely DB-shaped rather than pure math — an in-memory fake of the two
// Prisma models it touches is the narrowest way to exercise that behavior
// deterministically, without adding a live-database dependency to the test
// suite (no other test in this codebase touches @/lib/db; this mock is
// scoped to this file only and changes no production code).
interface FakeNotificationDelivery {
  id: string;
  kind: string;
  idempotencyKey: string;
  status: "PENDING" | "SENDING" | "DELIVERED" | "FAILED" | "RETRYING" | "DEAD_LETTER";
  attempts: number;
  lastError: string | null;
  founderBriefId?: string | null;
}

let deliveries: FakeNotificationDelivery[] = [];
let nextId = 1;

vi.mock("@/lib/db", () => ({
  db: {
    notificationDelivery: {
      findUnique: vi.fn(async ({ where }: { where: { idempotencyKey: string } }) => deliveries.find((d) => d.idempotencyKey === where.idempotencyKey) ?? null),
      create: vi.fn(async ({ data }: { data: Partial<FakeNotificationDelivery> }) => {
        const record: FakeNotificationDelivery = {
          id: `deliv_${nextId++}`,
          kind: data.kind ?? "",
          idempotencyKey: data.idempotencyKey ?? "",
          status: (data.status as FakeNotificationDelivery["status"]) ?? "PENDING",
          attempts: 0,
          lastError: null,
          founderBriefId: data.founderBriefId ?? null,
        };
        deliveries.push(record);
        return record;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const record = deliveries.find((d) => d.id === where.id);
        if (!record) throw new Error(`no fake delivery with id ${where.id}`);
        if (data.status) record.status = data.status as FakeNotificationDelivery["status"];
        if (data.lastError !== undefined) record.lastError = data.lastError as string | null;
        if (data.attempts && typeof data.attempts === "object" && "increment" in (data.attempts as object)) {
          record.attempts += (data.attempts as { increment: number }).increment;
        }
        return record;
      }),
      findMany: vi.fn(async () => deliveries),
    },
    auditLogEntry: {
      create: vi.fn(async () => ({})),
    },
  },
}));

const { sendFounderDailyBrief } = await import("./notification-gateway");
const { rootContext } = await import("@/lib/agents/trace");

beforeEach(() => {
  deliveries = [];
  nextId = 1;
});

describe("sendFounderDailyBrief idempotency (spec s.22/s.30)", () => {
  it("creates exactly one NotificationDelivery row for repeated calls with the same founderBriefId", async () => {
    const ctx = rootContext();
    await sendFounderDailyBrief(ctx, "brief_1");
    await sendFounderDailyBrief(ctx, "brief_1");
    await sendFounderDailyBrief(ctx, "brief_1");

    const rows = deliveries.filter((d) => d.idempotencyKey === "DAILY:brief_1");
    expect(rows).toHaveLength(1);
  });

  it("honestly marks delivery FAILED with NO_CHANNEL_CONFIGURED rather than fabricating a DELIVERED status (spec s.30)", async () => {
    const result = await sendFounderDailyBrief(rootContext(), "brief_2");
    expect(result.status).toBe("FAILED");
    expect(result.lastError).toBe("NO_CHANNEL_CONFIGURED");
  });

  it("creates independent delivery rows for different founderBriefIds", async () => {
    await sendFounderDailyBrief(rootContext(), "brief_a");
    await sendFounderDailyBrief(rootContext(), "brief_b");
    expect(deliveries).toHaveLength(2);
  });
});
