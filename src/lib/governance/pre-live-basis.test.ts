import { describe, expect, it } from "vitest";

import { RT_ACCOUNTABILITY_MATRIX, type RtCapability } from "./capabilities";
import {
  JUDGMENT_ONLY,
  PRE_LIVE_BASIS_RULES,
  classifyPreLiveBasis,
  countByBasis,
  preLiveFlagsNeedingFounderReview,
} from "./pre-live-basis";

const findings = classifyPreLiveBasis();
const byCapability = new Map(findings.map((f) => [f.capability, f]));

function finding(capability: string) {
  const found = byCapability.get(capability);
  if (!found) throw new Error(`no finding for ${capability}`);
  return found;
}

describe("classification covers the matrix exactly once", () => {
  it("classifies every capability", () => {
    expect(findings.length).toBe(RT_ACCOUNTABILITY_MATRIX.length);
    expect(new Set(findings.map((f) => f.capability)).size).toBe(findings.length);
  });

  it("names only domains and capabilities that exist", () => {
    const domains = new Set(RT_ACCOUNTABILITY_MATRIX.map((c) => c.domain));
    const capabilities = new Set(RT_ACCOUNTABILITY_MATRIX.map((c) => c.capability));

    for (const rule of PRE_LIVE_BASIS_RULES) {
      for (const domain of rule.domains ?? []) expect(domains, rule.basis).toContain(domain);
      for (const capability of rule.capabilities ?? []) expect(capabilities, rule.basis).toContain(capability);
    }
  });

  it("gives every finding a reason, including the ones that have no rule", () => {
    for (const f of findings) expect(f.reason.length, f.capability).toBeGreaterThan(20);
  });

  it("lets a capability-level rule override its domain, because the domain is the coarser statement", () => {
    // service_recovery lives in PASSENGER_OPS, which no domain rule covers, and
    // is claimed by name for CUSTOMER_RECOURSE.
    expect(finding("service_recovery").basis).toBe("CUSTOMER_RECOURSE");
  });
});

describe("the bases that cannot be deferred by an engineering decision", () => {
  it("treats money, safety, personal data and legality as non-negotiable", () => {
    const implying = PRE_LIVE_BASIS_RULES.filter((r) => r.impliesPreLive).map((r) => r.basis);

    expect(implying).toEqual(["MONEY_MOVES", "PHYSICAL_SAFETY", "PERSONAL_DATA", "LEGAL_EXPOSURE"]);
  });

  // Fraud detection, recourse depth and reliability maturity genuinely scale
  // with exposure — a hand-picked pilot is not an open market. Those rules
  // explain the flag without asserting the flag must be true, and that
  // distinction is the difference between a basis and a rubber stamp.
  it("does not claim scale-dependent bases force a pre-LIVE requirement", () => {
    for (const basis of ["ABUSE_AND_FRAUD", "CUSTOMER_RECOURSE", "OPERATIONAL_CONTINUITY"]) {
      expect(PRE_LIVE_BASIS_RULES.find((r) => r.basis === basis)?.impliesPreLive, basis).toBe(false);
    }
  });
});

describe("the review list is short, specific, and honest about what is missing", () => {
  // This is the deliverable. B2 said "33 booleans, unreviewed". The answer is
  // not "trust them" and not "ask about all 33" — it is this list.
  it("flags a pre-LIVE requirement that rests on judgment alone", () => {
    const judgment = preLiveFlagsNeedingFounderReview().filter((f) => f.review === "REQUIRED_ON_JUDGMENT_ALONE");

    expect(judgment.map((f) => f.capability)).toEqual(["drive_crm_event_write"]);
    expect(judgment[0].basis).toBe(JUDGMENT_ONLY);
  });

  // The inverse, which the audit did not ask about and which is worse: a rule
  // says this cannot wait and the flag says it can. Cargo money is real money —
  // confirming a cargo payment is exempted from pre-LIVE while every passenger
  // money capability is required, and that asymmetry is a real question.
  it("flags a capability a rule requires but the flag exempts", () => {
    const understated = preLiveFlagsNeedingFounderReview().filter(
      (f) => f.review === "RULE_REQUIRES_IT_BUT_FLAG_SAYS_NO",
    );

    expect(understated.map((f) => f.capability)).toEqual(["cargo_payment_confirmation"]);
    expect(understated[0].basis).toBe("MONEY_MOVES");
  });

  it("keeps the list small enough to actually be reviewed", () => {
    // If this ever grows, the rules have stopped explaining the matrix and the
    // review has become the same unreadable ask B2 complained about.
    expect(preLiveFlagsNeedingFounderReview().length).toBeLessThanOrEqual(5);
  });

  it("leaves everything else needing no per-capability decision", () => {
    const preLive = findings.filter((f) => f.preLiveRequired);
    const explained = preLive.filter((f) => f.review === "NONE");

    expect(explained.length).toBe(preLive.length - 1);
  });
});

describe("counts by basis", () => {
  it("counts only pre-LIVE capabilities, grouped by why", () => {
    const counts = countByBasis();
    const total = [...counts.values()].reduce((sum, n) => sum + n, 0);

    expect(total).toBe(RT_ACCOUNTABILITY_MATRIX.filter((c) => c.preLiveRequired).length);
    // Six FINANCE capabilities plus the tariff authority.
    expect(counts.get("MONEY_MOVES")).toBe(7);
    expect(counts.get("CORE_SERVICE_LOOP")).toBe(10);
  });

  it("omits a basis with no pre-LIVE capability rather than reporting it as zero", () => {
    const counts = countByBasis(RT_ACCOUNTABILITY_MATRIX.filter((c) => c.domain === "FINANCE"));

    expect(counts.has("PHYSICAL_SAFETY")).toBe(false);
  });
});

describe("the module decides nothing", () => {
  it("is pure — same matrix in, same findings out, and no reliance on flags to build the rules", () => {
    const flipped: RtCapability[] = RT_ACCOUNTABILITY_MATRIX.map((c) => ({ ...c, preLiveRequired: !c.preLiveRequired }));
    const flippedFindings = classifyPreLiveBasis(flipped);

    // The basis of a capability is a property of what it does, never of whether
    // someone ticked a box. Flipping every flag must not move a single basis.
    for (const f of flippedFindings) {
      expect(f.basis, f.capability).toBe(finding(f.capability).basis);
    }
    // The review verdicts, by contrast, must move — they are about the flags.
    expect(flippedFindings.filter((f) => f.review !== "NONE").length).not.toBe(
      findings.filter((f) => f.review !== "NONE").length,
    );
  });
});
