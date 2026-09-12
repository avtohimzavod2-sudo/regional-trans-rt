import { describe, expect, it, vi, beforeEach } from "vitest";

// Mirrors the in-memory @/lib/db fake pattern established in
// src/lib/artur/notification-gateway.test.ts — the only precedent in this
// codebase for unit-testing Prisma-touching logic without a live database.
// Scoped to this file only; changes no production code.
interface FakeIntentRow {
  id: string;
  idempotencyKey: string;
  amountSom: number;
  conversationId: string;
  customerRef: string;
  tripId: string | null;
  bookingId: string | null;
  financialProcessor: string | null;
}

interface FakeAuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  details: unknown;
}

let intents: FakeIntentRow[] = [];
let entries: FakeAuditLogEntry[] = [];
let nextId = 1;
/** Set to make the next create throw something that is NOT a unique
 * violation, so we can prove real failures are not swallowed. */
let createFailure: Error | null = null;

/** Prisma's shape for a unique-constraint violation. */
function uniqueViolation(): Error & { code: string } {
  return Object.assign(new Error("Unique constraint failed on the fields: (`idempotencyKey`)"), { code: "P2002" });
}

vi.mock("@/lib/db", () => ({
  db: {
    passengerFinancialIntent: {
      // The check and the insert happen in the same synchronous block, with no
      // await between them. That is the point: it models what a UNIQUE index
      // actually guarantees. A fake that awaited in the middle would be
      // modelling a database that does not exist.
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (createFailure) {
          const err = createFailure;
          createFailure = null;
          throw err;
        }
        const key = String(data.idempotencyKey);
        if (intents.some((i) => i.idempotencyKey === key)) throw uniqueViolation();
        const row: FakeIntentRow = {
          id: `pfi_${nextId++}`,
          idempotencyKey: key,
          amountSom: Number(data.amountSom),
          conversationId: String(data.conversationId),
          customerRef: String(data.customerRef),
          tripId: (data.tripId as string | null) ?? null,
          bookingId: (data.bookingId as string | null) ?? null,
          financialProcessor: (data.financialProcessor as string | null) ?? null,
        };
        intents.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { idempotencyKey: string } }) => {
        return intents.find((i) => i.idempotencyKey === where.idempotencyKey) ?? null;
      }),
      // Present but must never be used by the record path: a read-then-write
      // dedupe is exactly the bug this module was fixed for.
      findFirst: vi.fn(async () => null),
    },
    auditLogEntry: {
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
const { db } = await import("@/lib/db");
const { rootContext } = await import("@/lib/agents/trace");

function intent(eventKey: string, overrides: Partial<{ conversationId: string; amountSom: number }> = {}) {
  return buildSignificantExcessBaggageFinancialIntent({
    conversationId: overrides.conversationId ?? "conv_1",
    customerRef: "cust_1",
    amountSom: overrides.amountSom ?? 100,
    eventKey,
  });
}

beforeEach(() => {
  intents = [];
  entries = [];
  nextId = 1;
  createFailure = null;
  vi.clearAllMocks();
});

describe("buildSignificantExcessBaggageFinancialIntent (spec s.19)", () => {
  it("carries full structured provenance and no financial processor yet", () => {
    const built = buildSignificantExcessBaggageFinancialIntent({
      conversationId: "conv_1",
      customerRef: "cust_1",
      amountSom: 100,
      tripId: "trip_1",
      eventKey: "msg_1",
    });

    expect(built).toMatchObject({
      paymentType: "PASSENGER_EXTRA_BAGGAGE_FEE",
      amountSom: 100,
      currency: "KGS",
      sourceDepartment: "PASSENGER_TRANSPORT",
      reason: "SIGNIFICANT_EXCESS_BAGGAGE",
      tripId: "trip_1",
      customerRef: "cust_1",
      conversationId: "conv_1",
      originatingContext: "MIRA_PASSENGER_WORKFLOW",
      financialProcessor: null,
    });
    expect(built.idempotencyKey).toBe("MIRA_PASSENGER_FINANCIAL_INTENT:conv_1:msg_1");
  });
});

describe("recordPassengerFinancialIntent — duplicate processing creates no duplicate charge (spec s.19/s.24-F)", () => {
  it("records exactly one intent for repeated sequential calls with the same key", async () => {
    const ctx = rootContext();
    const i = intent("msg_1");

    const first = await recordPassengerFinancialIntent(ctx, i);
    const second = await recordPassengerFinancialIntent(ctx, i);
    const third = await recordPassengerFinancialIntent(ctx, i);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(third.created).toBe(false);
    expect(intents).toHaveLength(1);
  });

  it("records independent intents for different events", async () => {
    const ctx = rootContext();

    await recordPassengerFinancialIntent(ctx, intent("msg_1"));
    await recordPassengerFinancialIntent(ctx, intent("msg_2"));

    expect(intents).toHaveLength(2);
  });

  // COLD AUDIT B4. The previous implementation read with findFirst and then
  // created. Under Promise.all both reads resolve "absent" before either
  // write runs, so both write — a double charge. This test fails against that
  // implementation and passes against a unique constraint.
  it("records exactly one intent when the same message is delivered concurrently", async () => {
    const ctx = rootContext();
    const i = intent("msg_1");

    const results = await Promise.all([
      recordPassengerFinancialIntent(ctx, i),
      recordPassengerFinancialIntent(ctx, i),
      recordPassengerFinancialIntent(ctx, i),
    ]);

    expect(intents).toHaveLength(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(results.filter((r) => !r.created)).toHaveLength(2);
    // Every caller gets the real row back, including the ones that lost.
    expect(results.every((r) => r.record?.idempotencyKey === i.idempotencyKey)).toBe(true);
  });

  it("never dedupes by reading first — the constraint is the guard", async () => {
    await recordPassengerFinancialIntent(rootContext(), intent("msg_1"));

    expect(db.passengerFinancialIntent.findFirst).not.toHaveBeenCalled();
  });

  it("writes the audit trace only for the call that actually recorded the intent", async () => {
    const ctx = rootContext();
    const i = intent("msg_1");

    await recordPassengerFinancialIntent(ctx, i);
    await recordPassengerFinancialIntent(ctx, i);

    // Two calls, one charge, one trace entry — never a trace for a charge
    // that was not recorded.
    expect(entries.filter((e) => e.entityId === i.idempotencyKey)).toHaveLength(1);
  });

  it("propagates a genuine database failure instead of reporting a silent duplicate", async () => {
    createFailure = Object.assign(new Error("connection terminated"), { code: "P1001" });

    await expect(recordPassengerFinancialIntent(rootContext(), intent("msg_1"))).rejects.toThrow("connection terminated");
    // Nothing recorded, and no trace claiming otherwise.
    expect(intents).toHaveLength(0);
    expect(entries).toHaveLength(0);
  });
});
