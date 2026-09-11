import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { renderAccountabilityMatrixDoc, renderPreLiveReadinessDoc } from "./render-docs";

function readDoc(name: string): string {
  return readFileSync(join(process.cwd(), "docs", name), "utf8").replace(/\r\n/g, "\n");
}

describe("generated governance docs", () => {
  // A governance doc that disagrees with the code it describes is worse than
  // no doc, because people trust it. These fail the build on drift.
  it("keeps RT_ACCOUNTABILITY_MATRIX.md in sync with the code", () => {
    expect(readDoc("RT_ACCOUNTABILITY_MATRIX.md")).toBe(renderAccountabilityMatrixDoc());
  });

  it("keeps RT_PRE_LIVE_READINESS.md in sync with the code", () => {
    expect(readDoc("RT_PRE_LIVE_READINESS.md")).toBe(renderPreLiveReadinessDoc());
  });

  it("never publishes a LIVE READY verdict off the back of passing tests", () => {
    const doc = renderPreLiveReadinessDoc();

    expect(doc).toContain("A passing test suite is not a launch decision.");
    expect(doc).toContain("| LIVE | **NOT_READY** |");
  });

  it("marks planned owners visibly so a named owner is not mistaken for a staffed one", () => {
    const doc = renderAccountabilityMatrixDoc();

    expect(doc).toContain("TARIFF_ENGINE *(planned)*");
    expect(doc).toContain("PASSENGER_CASHIER *(planned)*");
  });

  it("states the reviewer/approver distinction in the doc itself", () => {
    expect(renderAccountabilityMatrixDoc()).toContain("A reviewer is *not* an approver.");
  });
});
