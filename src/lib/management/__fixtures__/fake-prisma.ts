// A tiny in-memory stand-in for the Prisma client, used only by the two
// direction-manager report tests (src/lib/akzhol/report.test.ts,
// src/lib/zholaman/report.test.ts).
//
// It lives in a __fixtures__ subdirectory rather than next to the modules it
// supports because src/lib/management/boundary.test.ts scans that directory for
// write patterns; a test fixture is not part of the managers' read surface and
// should not be scanned as if it were.
//
// WHY A REAL FILTER EVALUATOR INSTEAD OF vi.fn().mockResolvedValue(n):
// the substance of a report builder is its WHERE clauses — "critical
// complaints open at the end of the period, including ones opened earlier"
// is entirely a filter. A mock that returns a fixed number per call would
// pass no matter which filter the builder used, so it would assert nothing
// about the thing most likely to be wrong.
//
// Two deliberate strictness choices, both aimed at the same failure mode (a
// fake that silently agrees with everything):
//   - an unsupported operator throws instead of being ignored, so a filter
//     this fake cannot evaluate can never be quietly treated as "matches";
//   - an undeclared model throws instead of returning an empty table, so a
//     new read added to a report surfaces as a failing test naming the model
//     rather than as a zero that looks like real data.

export type FakeRow = Record<string, unknown>;
export type FakeTables = Record<string, FakeRow[]>;

/** How to follow a nested relation filter, e.g. ShipmentPayment.shipment.
 * `localKey` is the foreign key on the OWNING row; the related row is matched
 * on its `id`. */
export interface FakeRelation {
  table: string;
  localKey: string;
}
export type FakeRelationMap = Record<string, Record<string, FakeRelation>>;

const OPERATORS = new Set(["gte", "gt", "lte", "lt", "in", "notIn", "not", "equals"]);

function isOperatorObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !(value instanceof Date) && !Array.isArray(value) && Object.keys(value).every((k) => OPERATORS.has(k));
}

function asComparable(value: unknown): number | string | boolean | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return value;
  throw new Error(`fake prisma: cannot compare value of type ${typeof value}`);
}

function equals(a: unknown, b: unknown): boolean {
  return asComparable(a) === asComparable(b);
}

function matchesCondition(value: unknown, condition: unknown): boolean {
  if (isOperatorObject(condition)) {
    for (const [operator, operand] of Object.entries(condition)) {
      const left = asComparable(value);
      switch (operator) {
        case "equals":
          if (!equals(value, operand)) return false;
          break;
        case "not":
          if (equals(value, operand)) return false;
          break;
        case "in":
          if (!(operand as unknown[]).some((candidate) => equals(value, candidate))) return false;
          break;
        case "notIn":
          if ((operand as unknown[]).some((candidate) => equals(value, candidate))) return false;
          break;
        // A null field never satisfies a range filter — Prisma's behaviour, and
        // the one that matters here: a shipment with no completedAt is not
        // "completed before the period end".
        case "gte":
          if (left === null || left < asComparable(operand)!) return false;
          break;
        case "gt":
          if (left === null || left <= asComparable(operand)!) return false;
          break;
        case "lte":
          if (left === null || left > asComparable(operand)!) return false;
          break;
        case "lt":
          if (left === null || left >= asComparable(operand)!) return false;
          break;
        default:
          throw new Error(`fake prisma: unsupported operator "${operator}"`);
      }
    }
    return true;
  }

  if (typeof condition === "object" && condition !== null && !(condition instanceof Date)) {
    throw new Error(`fake prisma: unsupported filter shape ${JSON.stringify(condition)} — add support explicitly rather than letting it match everything`);
  }
  return equals(value, condition);
}

export function createFakeDb(tables: FakeTables, relations: FakeRelationMap = {}) {
  function rowsOf(model: string): FakeRow[] {
    const rows = tables[model];
    if (!rows) {
      throw new Error(`fake prisma: model "${model}" was read but is not declared in this test's tables. Declare it (an empty array is fine) so the read is visible in the fixture.`);
    }
    return rows;
  }

  function matchesWhere(model: string, row: FakeRow, where: FakeRow | undefined): boolean {
    if (!where) return true;
    for (const [field, condition] of Object.entries(where)) {
      const relation = relations[model]?.[field];
      if (relation) {
        const foreignId = row[relation.localKey];
        const related = rowsOf(relation.table).find((candidate) => equals(candidate.id, foreignId));
        if (!related) return false;
        if (!matchesWhere(relation.table, related, condition as FakeRow)) return false;
        continue;
      }
      if (!matchesCondition(row[field], condition)) return false;
    }
    return true;
  }

  function filtered(model: string, where: FakeRow | undefined): FakeRow[] {
    return rowsOf(model).filter((row) => matchesWhere(model, row, where));
  }

  const modelClient = (model: string) => ({
    count: async ({ where }: { where?: FakeRow } = {}) => filtered(model, where).length,
    findMany: async ({ where }: { where?: FakeRow; select?: unknown } = {}) => filtered(model, where),
    findUnique: async ({ where }: { where: FakeRow }) => filtered(model, where)[0] ?? null,
    findFirst: async ({ where }: { where?: FakeRow } = {}) => filtered(model, where)[0] ?? null,
    aggregate: async ({ where, _sum }: { where?: FakeRow; _sum?: Record<string, boolean> }) => {
      const rows = filtered(model, where);
      const sums: Record<string, number | null> = {};
      for (const field of Object.keys(_sum ?? {})) {
        // Prisma returns null, not 0, for a sum over no rows. Preserved
        // because the caller's `?? 0` only reads correctly against the real
        // behaviour.
        sums[field] = rows.length === 0 ? null : rows.reduce((total, row) => total + Number(row[field] ?? 0), 0);
      }
      return { _sum: sums };
    },
    groupBy: async ({ by, where }: { by: string[]; where?: FakeRow; _count?: unknown }) => {
      const groups = new Map<string, { key: FakeRow; count: number }>();
      for (const row of filtered(model, where)) {
        const key: FakeRow = {};
        for (const field of by) key[field] = row[field] ?? null;
        const mapKey = JSON.stringify(by.map((field) => key[field]));
        const existing = groups.get(mapKey);
        if (existing) existing.count++;
        else groups.set(mapKey, { key, count: 1 });
      }
      return [...groups.values()].map(({ key, count }) => ({ ...key, _count: { _all: count } }));
    },
  });

  return new Proxy({} as Record<string, ReturnType<typeof modelClient>>, {
    get(_target, property) {
      if (typeof property !== "string") return undefined;
      return modelClient(property);
    },
  });
}
