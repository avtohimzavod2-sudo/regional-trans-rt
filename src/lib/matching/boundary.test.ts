import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Spec s.11/s.16 — static regression guard (mirrors src/lib/rt-office/boundary.test.ts's
// pattern). MATCH (matching/orchestrate.ts) MUST NOT own a separate public
// persona: it must never call the raw WhatsApp/Telegram provider adapters
// directly for a driver/passenger notification. Every such send routes
// through Mira's outbound boundary (src/lib/mira/outbound.ts) instead, so
// Mira remains the sole architectural owner of external_customer_communication.
// No database involved — this is a source-text import scan, not a runtime check.
const FORBIDDEN_IMPORTS: Record<string, string[]> = {
  "@/lib/messaging/whatsapp": ["sendWhatsAppText", "sendWhatsAppConfirmButtons"],
  "@/lib/messaging/telegram": ["sendTelegramMessage"],
};

const MATCHING_DIR = join(__dirname);

function matchingSourceFiles(): string[] {
  return readdirSync(MATCHING_DIR, { recursive: true })
    .map((f) => f.toString())
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(MATCHING_DIR, f));
}

describe("MATCH never messages a driver/passenger directly, bypassing Mira's outbound boundary (spec s.11/s.16)", () => {
  const files = matchingSourceFiles();

  it("finds at least one matching source file to scan (sanity check on the scan itself)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const label = file.replace(MATCHING_DIR, "").replace(/^[/\\]/, "");

    it(`${label} does not import a raw messaging send function directly`, () => {
      const source = readFileSync(file, "utf8");
      const importStatements = source.match(/import\s+\{[^}]*\}\s+from\s+["'][^"']+["']/g) ?? [];

      for (const statement of importStatements) {
        const moduleMatch = statement.match(/from\s+["']([^"']+)["']/);
        const sourceModule = moduleMatch?.[1];
        if (!sourceModule || !(sourceModule in FORBIDDEN_IMPORTS)) continue;

        const namedImportsMatch = statement.match(/\{([^}]*)\}/);
        const namedImports = (namedImportsMatch?.[1] ?? "").split(",").map((s) => s.trim().split(/\s+as\s+/)[0].trim());

        for (const forbidden of FORBIDDEN_IMPORTS[sourceModule]) {
          expect(namedImports, `${file} imports forbidden function "${forbidden}" from "${sourceModule}" — route through @/lib/mira/outbound instead`).not.toContain(forbidden);
        }
      }
    });
  }
});
