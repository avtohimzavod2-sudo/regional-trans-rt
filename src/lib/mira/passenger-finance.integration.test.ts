// Cold audit B4, proven against a real Postgres.
//
// The unit test for this module mocks `@/lib/db` and therefore proves only that
// the code calls `create` and handles a P2002 it was told to throw. The claim
// in the module's own doc-comment is stronger than that — "a duplicate is
// physically impossible", "cannot be raced" — and that claim is about a UNIQUE
// index in a database, not about TypeScript. It can only be checked by racing
// real writers against the real constraint, which is what this file does.
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { rootContext } from "@/lib/agents/trace";
import {
  buildSignificantExcessBaggageFinancialIntent,
  recordPassengerFinancialIntent,
} from "./passenger-finance";

const SYNTHETIC_CONVERSATION = "SYNTHETIC-TEST-conv-baggage";
const SYNTHETIC_CUSTOMER = "SYNTHETIC-TEST-passenger-wa-1";

function intentFor(eventKey: string, amountSom = 100) {
  return buildSignificantExcessBaggageFinancialIntent({
    conversationId: SYNTHETIC_CONVERSATION,
    customerRef: SYNTHETIC_CUSTOMER,
    amountSom,
    eventKey,
  });
}

async function countFor(idempotencyKey: string): Promise<number> {
  return db.passengerFinancialIntent.count({ where: { idempotencyKey } });
}

beforeEach(async () => {
  // Scoped to this module's synthetic conversation rather than a blanket
  // deleteMany(): a test that clears the whole table would also erase evidence
  // another integration test is in the middle of asserting on.
  await db.passengerFinancialIntent.deleteMany({ where: { conversationId: SYNTHETIC_CONVERSATION } });
});

describe("passenger financial intent, against a real database", () => {
  it("records the fee once and reports it as newly created", async () => {
    const intent = intentFor("msg-single");
    const result = await recordPassengerFinancialIntent(rootContext(), intent);

    expect(result.created).toBe(true);
    expect(result.record?.amountSom).toBe(100);
    expect(result.record?.currency).toBe("KGS");
    // No cashier exists, so no processor may be named. A fabricated one here
    // would be a fabricated claim that someone is handling the money.
    expect(result.record?.financialProcessor).toBeNull();
    expect(await countFor(intent.idempotencyKey)).toBe(1);
  });

  it("treats a replayed inbound message as already handled, not as a second charge", async () => {
    const intent = intentFor("msg-replayed");

    const first = await recordPassengerFinancialIntent(rootContext(), intent);
    // A different traceId on purpose: a redelivery is a new trace carrying the
    // same event. If dedupe keyed on the trace, this is where it would fail.
    const second = await recordPassengerFinancialIntent(rootContext(), intent);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    // The replay must return the real stored row, not a synthesized echo of the
    // input — a caller reading the amount back has to see what was charged.
    expect(second.record?.id).toBe(first.record?.id);
    expect(await countFor(intent.idempotencyKey)).toBe(1);
  });

  it("writes no audit trace for the replay that recorded nothing", async () => {
    const intent = intentFor("msg-trace-once");

    const first = await recordPassengerFinancialIntent(rootContext(), intent);
    const second = await recordPassengerFinancialIntent(rootContext(), intent);

    expect(first.entry).not.toBeNull();
    // The trace says "a financial intent was recorded". The replay recorded
    // nothing, so a second entry would be the audit log asserting a charge that
    // never happened.
    expect(second.entry).toBeNull();

    const traces = await db.auditLogEntry.count({
      where: { entityType: "PassengerFinancialIntent", entityId: intent.idempotencyKey },
    });
    expect(traces).toBe(1);
  });

  it("survives ten concurrent deliveries of the same event with exactly one row", async () => {
    // This is the case the unit test structurally cannot reach. Before B4 the
    // dedupe was findFirst-then-create against a non-unique index: every one of
    // these ten would read "absent" inside the same window and every one would
    // insert. On a payment path that is ten charges.
    const intent = intentFor("msg-concurrent");

    const results = await Promise.all(
      Array.from({ length: 10 }, () => recordPassengerFinancialIntent(rootContext(), intent)),
    );

    expect(await countFor(intent.idempotencyKey)).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(results.filter((r) => !r.created)).toHaveLength(9);
    // Every loser must still hand back the winning row. Returning null would
    // push the caller into deciding what to do about a charge it cannot see.
    for (const result of results) expect(result.record).not.toBeNull();
    const ids = new Set(results.map((r) => r.record?.id));
    expect(ids.size).toBe(1);
  });

  it("keeps distinct events distinct even in the same conversation", async () => {
    // Two genuinely different overweight bags in one conversation are two fees.
    // Idempotency must not collapse them, or the second one is silently free.
    const first = await recordPassengerFinancialIntent(rootContext(), intentFor("msg-bag-1"));
    const second = await recordPassengerFinancialIntent(rootContext(), intentFor("msg-bag-2"));

    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    expect(first.record?.id).not.toBe(second.record?.id);
    expect(await db.passengerFinancialIntent.count({ where: { conversationId: SYNTHETIC_CONVERSATION } })).toBe(2);
  });

  it("refuses a second row for the key even when written straight past the module", async () => {
    // Proves the guarantee lives in the schema rather than in this module's
    // control flow: a future caller that forgets recordPassengerFinancialIntent
    // and inserts directly still cannot create the duplicate.
    const intent = intentFor("msg-direct-insert");
    await recordPassengerFinancialIntent(rootContext(), intent);

    await expect(
      db.passengerFinancialIntent.create({
        data: {
          paymentType: "PASSENGER_EXTRA_BAGGAGE_FEE",
          reason: "SIGNIFICANT_EXCESS_BAGGAGE",
          amountSom: 999,
          currency: "KGS",
          conversationId: SYNTHETIC_CONVERSATION,
          customerRef: SYNTHETIC_CUSTOMER,
          originatingContext: "MIRA_PASSENGER_WORKFLOW",
          idempotencyKey: intent.idempotencyKey,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    expect(await countFor(intent.idempotencyKey)).toBe(1);
  });

  it("carries the unique index the migration claims to create", async () => {
    // The migration file documents this index by name and the rollback note
    // depends on it existing. Read it back from the catalogue rather than
    // trusting the file.
    const rows = await db.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'PassengerFinancialIntent'
        AND indexname = 'PassengerFinancialIntent_idempotencyKey_key'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain("UNIQUE");
    expect(rows[0].indexdef).toContain("idempotencyKey");
  });
});
