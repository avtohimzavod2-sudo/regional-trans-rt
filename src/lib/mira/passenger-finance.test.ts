import { describe, expect, it, vi, beforeEach } from "vitest";

// Mirrors the in-memory @/lib/db fake pattern established in
// src/lib/artur/notification-gateway.test.ts — the only precedent in this
// codebase for unit-testing Prisma-touching logic without a live database.
// Scoped to this file only; changes no production code.
interface FakeAuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  details: unknown;
}

let entries: FakeAuditLogEntry[] = [];
let nextId = 1;

vi.mock("@/lib/db", () => ({
  db: {
    auditLogEntry: {
      findFirst: vi.fn(async ({ where }: { where: { entityType: string; entityId: string; action: string } }) => {
        return (
          entries.find((e) => e.entityType === where.entityType && e.entityId === where.entityId && e.action === where.action) ?? null
        );
      }),
      create: vi.fn(async ({ data }: { data: Partial<FakeAuditLogEntry> }) => {
        const record: FakeAuditLogEntry = {
          id: `audit_${nextId++}`,
          entityType: data.entityType ?? "",
          entityId: data.entityId ?? "",
          action: data.action ?? "",
          details: data.details,
        };
        entries.push(record);
        return record;
      }),
    },
  },
}));

const { buildSignificantExcessBaggageFinancialIntent, recordPassengerFinancialIntent } = await import("./passenger-finance");
const { rootContext } = await import("@/lib/agents/trace");

beforeEach(() => {
  entries = [];
  nextId = 1;
});

describe("buildSignificantExcessBaggageFinancialIntent (spec s.19)", () => {
  it("carries full structured provenance and no financial processor yet", () => {
    const intent = buildSignificantExcessBaggageFinancialIntent({
      conversationId: "conv_1",
      customerRef: "cust_1",
      amountSom: 100,
      tripId: "trip_1",
      eventKey: "msg_1",
    });

    expect(intent).toMatchObject({
      paymentType: "PASSENGER_EXTRA_BAGGAGE_FEE",
      amountSom: 100,
      currency: "KGS",
      sourceDepartment: "PASSENGER_TRANSPORT",
      reason: "SIGNIFICANT_EXCESS_BAGGAGE",
      tripId: "trip_1",
      customerRef: "cust_1",
      originatingContext: "MIRA_PASSENGER_WORKFLOW",
      financialProcessor: null,
    });
    expect(intent.idempotencyKey).toBe("MIRA_PASSENGER_FINANCIAL_INTENT:conv_1:msg_1");
  });
});

describe("recordPassengerFinancialIntent — duplicate processing creates no duplicate charge (spec s.19/s.24-F)", () => {
  it("creates exactly one AuditLogEntry for repeated calls with the same idempotency key", async () => {
    const ctx = rootContext();
    const intent = buildSignificantExcessBaggageFinancialIntent({
      conversationId: "conv_1",
      customerRef: "cust_1",
      amountSom: 100,
      eventKey: "msg_1",
    });

    const first = await recordPassengerFinancialIntent(ctx, intent);
    const second = await recordPassengerFinancialIntent(ctx, intent);
    const third = await recordPassengerFinancialIntent(ctx, intent);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(third.created).toBe(false);
    expect(entries.filter((e) => e.entityId === intent.idempotencyKey)).toHaveLength(1);
  });

  it("creates independent entries for different events", async () => {
    const ctx = rootContext();
    const a = buildSignificantExcessBaggageFinancialIntent({ conversationId: "conv_1", customerRef: "cust_1", amountSom: 100, eventKey: "msg_1" });
    const b = buildSignificantExcessBaggageFinancialIntent({ conversationId: "conv_1", customerRef: "cust_1", amountSom: 100, eventKey: "msg_2" });

    await recordPassengerFinancialIntent(ctx, a);
    await recordPassengerFinancialIntent(ctx, b);

    expect(entries).toHaveLength(2);
  });
});
