import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// Founder decision C: the direction managers "не получают бесконтрольный
// write-access" — they get no write access at all.
//
// This is a static scan of the actual source, not a runtime mock, because the
// property being defended is a property of the code rather than of one call
// path: a manager module that can mutate the records it is measured on
// destroys the audit trail that makes its own reports worth reading. A comment
// saying "read-only" cannot fail a build. This can.
//
// Note what is deliberately also forbidden: logAgentAction, which writes
// AuditLogEntry. Auditing WHO read a management report is worth doing, but it
// belongs to the route/session layer that knows the actor — not inside a pure
// aggregation function, and not at the cost of making "this module performs no
// writes" untrue.
const MANAGER_DIRS = [
  join(__dirname, "..", "akzhol"),
  join(__dirname, "..", "zholaman"),
  __dirname,
];

/** Any Prisma mutation, raw-SQL escape hatch, or interactive transaction. */
const WRITE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Prisma create/update/delete/upsert", pattern: /\bdb\.[A-Za-z]+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/ },
  { label: "raw SQL", pattern: /\$(executeRaw|executeRawUnsafe|queryRaw|queryRawUnsafe)\b/ },
  { label: "interactive transaction", pattern: /\$transaction\b/ },
];

/** Mutation entry points that would let a manager act through another module
 * instead of writing directly — the same evasion src/lib/artur/boundary.test.ts
 * guards against for Artur. */
const FORBIDDEN_IMPORTS: Record<string, string[]> = {
  "@/lib/agents/trace": ["logAgentAction"],
  "@/lib/matching/orchestrate": ["handlePassengerResponse", "handleDriverResponse"],
  "@/lib/sapar/orchestrator": ["handleSaparInbound"],
  "@/lib/sapargul/treasury": ["confirmActualPaymentReceipt", "rejectPayment", "markPaymentMismatch"],
  "@/lib/sapargul/payment-lifecycle": ["transitionShipmentPayment"],
  "@/lib/adilet/case": ["openCase", "attachEvidence", "moveCaseToUnderReview", "closeCase"],
  "@/lib/adilet/decision": ["recordDecision", "escalateToDirector"],
  "@/lib/adilet/enforcement": ["applySanction", "reverseSanction", "expireDueSanctions"],
  "@/lib/tyyin/accountant": ["openAccountantCase", "recordAccountantResolution", "closeAccountantCase"],
};

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(dir, f));
}

describe("direction managers are read-only over existing data (Founder decision C)", () => {
  const files = MANAGER_DIRS.flatMap(sourceFiles);

  // Without this, deleting or renaming the manager folders would make every
  // assertion below pass by vacuum.
  it("scans both manager modules and the shared metrics module", () => {
    expect(files.length).toBeGreaterThanOrEqual(7);
    expect(files.some((f) => f.includes("akzhol"))).toBe(true);
    expect(files.some((f) => f.includes("zholaman"))).toBe(true);
  });

  for (const dir of MANAGER_DIRS) {
    for (const file of sourceFiles(dir)) {
      const relative = file.slice(file.lastIndexOf("lib") + 4);

      it(`${relative} contains no database write`, () => {
        const source = readFileSync(file, "utf8");
        for (const { label, pattern } of WRITE_PATTERNS) {
          const match = source.match(pattern);
          expect(match?.[0], `${relative} performs a write (${label}): ${match?.[0]}`).toBeUndefined();
        }
      });

      it(`${relative} imports no mutation entry point from another module`, () => {
        const source = readFileSync(file, "utf8");
        const importStatements = source.match(/import\s+\{[^}]*\}\s+from\s+["'][^"']+["']/g) ?? [];

        for (const statement of importStatements) {
          const sourceModule = statement.match(/from\s+["']([^"']+)["']/)?.[1];
          if (!sourceModule || !(sourceModule in FORBIDDEN_IMPORTS)) continue;

          const named = (statement.match(/\{([^}]*)\}/)?.[1] ?? "").split(",").map((s) => s.trim().split(/\s+as\s+/)[0].trim());
          for (const forbidden of FORBIDDEN_IMPORTS[sourceModule]) {
            expect(named, `${relative} imports mutation "${forbidden}" from "${sourceModule}"`).not.toContain(forbidden);
          }
        }
      });
    }
  }
});

describe("direction managers never read money amounts (docs/FINANCIAL_BOUNDARIES.md)", () => {
  // Akzhol and Zholaman are not cashiers and not transaction owners. The money
  // columns are not filtered out downstream — they are never selected, so
  // there is no view in which a manager sees an amount. Zholaman's only
  // permitted payment view is the coarse PAID/PENDING/PROBLEM collapse in
  // src/lib/sapargul/zholaman.ts (spec s.21), which carries no amount.
  const FORBIDDEN_MONEY_READS = [
    "totalFareSom",
    "commissionSom",
    "amountSom",
    "declaredValueSom",
    "treasuryTransaction",
    "shipmentPayment.aggregate",
    "ledgerEntry",
    "rtBalance",
  ];

  for (const dir of MANAGER_DIRS) {
    for (const file of sourceFiles(dir)) {
      const relative = file.slice(file.lastIndexOf("lib") + 4);
      it(`${relative} selects no money field`, () => {
        const source = readFileSync(file, "utf8");
        // Comments are where this boundary gets explained, so they are
        // stripped before the scan — otherwise documenting the rule would
        // break it.
        const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        for (const field of FORBIDDEN_MONEY_READS) {
          expect(code, `${relative} reads money field "${field}"`).not.toContain(field);
        }
      });
    }
  }
});
