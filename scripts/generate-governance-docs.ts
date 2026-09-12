// Regenerates docs/RT_ACCOUNTABILITY_MATRIX.md and
// docs/RT_PRE_LIVE_READINESS.md from the governance modules.
//
// Run: npm run docs:governance
//
// The docs are generated rather than hand-written so they cannot drift from
// the code that enforces them. governance-docs.test.ts fails if the checked-in
// files differ from what this script produces.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  renderAccountabilityMatrixDoc,
  renderPreLiveBlockersDoc,
  renderPreLiveReadinessDoc,
} from "@/lib/governance/render-docs";

const docsDir = join(process.cwd(), "docs");

const generated: Array<[string, string]> = [
  ["RT_ACCOUNTABILITY_MATRIX.md", renderAccountabilityMatrixDoc()],
  ["RT_PRE_LIVE_READINESS.md", renderPreLiveReadinessDoc()],
  ["RT_PRE_LIVE_BLOCKERS.md", renderPreLiveBlockersDoc()],
];

for (const [name, contents] of generated) {
  writeFileSync(join(docsDir, name), contents, "utf8");
}

console.log(`Regenerated ${generated.map(([name]) => `docs/${name}`).join(", ")}`);
