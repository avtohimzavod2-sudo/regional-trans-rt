import { describe, expect, it } from "vitest";

import {
  RT_PRE_LIVE_BLOCKERS,
  blockersFor,
  blockersOfKind,
  classifySubject,
  vacantPosts,
  type PreLiveBlocker,
} from "./blockers";
import { RT_ACCOUNTABILITY_MATRIX } from "./capabilities";
import { getOrgNode } from "./org";
import { MANUAL_PRE_LIVE_GATES, evaluateReadiness } from "./readiness";

const report = evaluateReadiness();
const blockedCapabilities = report.capabilities.filter((c) => c.status !== "READY").map((c) => c.capability);
const unknownGates = report.manualGates.filter((g) => g.status !== "READY").map((g) => g.gate);

describe("blocker taxonomy covers everything readiness reports", () => {
  // If readiness says a pre-LIVE capability is blocked but this file has no
  // entry for it, RT has a blocker nobody has classified — which is how an
  // unowned responsibility gets quietly dropped from a launch plan.
  it("classifies every blocked pre-LIVE capability", () => {
    const uncovered = blockedCapabilities.filter((c) => blockersFor(c).length === 0);
    expect(uncovered).toEqual([]);
  });

  it("classifies every manual gate that is not attested", () => {
    const uncovered = unknownGates.filter((g) => blockersFor(g).length === 0);
    expect(uncovered).toEqual([]);
  });

  it("names only real capabilities and real gates", () => {
    const unknownSubjects = RT_PRE_LIVE_BLOCKERS.flatMap((b) =>
      b.blocks.filter((s) => classifySubject(s) === "UNKNOWN").map((s) => `${b.id} → ${s}`),
    );
    expect(unknownSubjects).toEqual([]);
  });

  it("has a unique id per blocker", () => {
    const ids = RT_PRE_LIVE_BLOCKERS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses all four kinds — a taxonomy with an empty branch is a taxonomy nobody applied", () => {
    for (const kind of [
      "SOFTWARE_BLOCKER",
      "HUMAN_STAFFING_BLOCKER",
      "EXTERNAL_PROVIDER_BLOCKER",
      "FOUNDER_DECISION_BLOCKER",
    ] as const) {
      expect(blockersOfKind(kind).length).toBeGreaterThan(0);
    }
  });
});

describe("a human vacancy never masquerades as missing code", () => {
  // The whole point of decision D. A capability whose only problem is that
  // nobody holds the post must not also be filed as a software gap, because a
  // software gap gets closed by writing a module — and then RT ships with an
  // unaccountable one.
  const purelyHumanCapabilities = [
    "financial_exception_resolution",
    "serious_safety_incident_response",
    "privacy_and_data_governance",
    "legal_and_regulatory_compliance",
    "platform_reliability_and_incident_response",
    "passenger_operations_performance_management",
    "delivery_cargo_performance_management",
  ];

  it.each(purelyHumanCapabilities)("files %s as a staffing blocker only", (capability) => {
    const kinds = blockersFor(capability).map((b) => b.kind);

    expect(kinds).toContain("HUMAN_STAFFING_BLOCKER");
    expect(kinds).not.toContain("SOFTWARE_BLOCKER");
  });

  // The converse: where a capability genuinely needs both a person and code,
  // both must be recorded. Backup needs tooling AND someone who ran the drill.
  it("records backup and rollback as needing both code and a person", () => {
    for (const capability of ["backup_and_disaster_recovery", "deployment_and_rollback_policy"]) {
      const kinds = blockersFor(capability).map((b) => b.kind);
      expect(kinds).toContain("SOFTWARE_BLOCKER");
      expect(kinds).toContain("HUMAN_STAFFING_BLOCKER");
    }
  });

  it("never resolves a staffing blocker by writing software", () => {
    for (const blocker of blockersOfKind("HUMAN_STAFFING_BLOCKER")) {
      expect(blocker.resolution).toMatch(/appoint|names a/i);
    }
  });
});

describe("post specifications describe a seat, not an occupant", () => {
  it("attaches a post specification to exactly the staffing blockers", () => {
    for (const blocker of RT_PRE_LIVE_BLOCKERS) {
      if (blocker.kind === "HUMAN_STAFFING_BLOCKER") expect(blocker.post, blocker.id).toBeDefined();
      else expect(blocker.post, blocker.id).toBeUndefined();
    }
  });

  it("points every post at a real org node that is genuinely vacant", () => {
    for (const post of vacantPosts()) {
      const node = getOrgNode(post.post);
      expect(node, post.post).toBeDefined();
      // A filled post is not a blocker. If this ever fails because someone was
      // appointed, the blocker should be deleted, not the assertion.
      expect(node?.status, post.post).toBe("PLANNED");
      expect(["HUMAN_ROLE", "MANAGER"], post.post).toContain(node?.classification);
    }
  });

  it("specifies each post completely — an incomplete spec cannot be onboarded against", () => {
    for (const post of vacantPosts()) {
      expect(post.mandate.length, post.post).toBeGreaterThan(20);
      expect(post.rights.length, post.post).toBeGreaterThanOrEqual(3);
      expect(post.deniedRights.length, post.post).toBeGreaterThanOrEqual(2);
      expect(post.incompatibleWith.length, post.post).toBeGreaterThanOrEqual(1);
      expect(post.onboarding.length, post.post).toBeGreaterThanOrEqual(3);
      expect(post.credentials.length, post.post).toBeGreaterThanOrEqual(3);
    }
  });

  it("can be appointed by someone who actually exists", () => {
    for (const post of vacantPosts()) {
      const appointer = getOrgNode(post.appointedBy);
      expect(appointer?.status, post.post).toBe("IMPLEMENTED");
      expect(appointer?.classification, post.post).toBe("HUMAN_ROLE");
    }
  });

  it("invents no person — every post is a node id, never a name", () => {
    for (const post of vacantPosts()) {
      // Node ids are SCREAMING_SNAKE_CASE identifiers. A personal name would
      // not survive this shape, and neither would a display name.
      expect(post.post, post.post).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  it("ties each gate a post holds open to a gate that blocker also blocks", () => {
    for (const blocker of blockersOfKind("HUMAN_STAFFING_BLOCKER")) {
      for (const gate of blocker.post?.gatesHeldOpen ?? []) {
        expect(MANUAL_PRE_LIVE_GATES, blocker.id).toContain(gate);
        expect(blocker.blocks, blocker.id).toContain(gate);
      }
    }
  });

  it("holds open every named-human gate through a post, not through a document", () => {
    const namedHumanGates = MANUAL_PRE_LIVE_GATES.filter((g) => g.startsWith("named_human"));
    const heldByPosts = new Set(blockersOfKind("HUMAN_STAFFING_BLOCKER").flatMap((b) => b.post?.gatesHeldOpen ?? []));

    for (const gate of namedHumanGates) expect([...heldByPosts]).toContain(gate);
  });
});

describe("segregation of duties", () => {
  // Money is the case where combining two posts is not a risk to accept but a
  // control to keep. Whoever takes money must never be the one who certifies
  // it arrived, and neither may ever be able to send money out.
  it("keeps reconciliation away from cash handling and away from payouts", () => {
    const accountant = vacantPosts().find((p) => p.post === "HUMAN_ACCOUNTANT");

    expect(accountant?.incompatibleWith.join(" ")).toMatch(/PASSENGER_CASHIER/);
    expect(accountant?.deniedRights.join(" ")).toMatch(/payout/i);
  });

  it("keeps the performance managers away from the money they are judged on", () => {
    for (const id of ["AKZHOL", "ZHOLAMAN"]) {
      const post = vacantPosts().find((p) => p.post === id);
      expect(post?.deniedRights.join(" "), id).toMatch(/write access/i);
      expect(post?.incompatibleWith.join(" "), id).toMatch(/HUMAN_ACCOUNTANT/);
    }
  });

  it("denies the reliability owner the one switch that is a Founder decision", () => {
    const reliability = vacantPosts().find((p) => p.post === "HUMAN_RELIABILITY_OWNER");

    expect(reliability?.deniedRights.join(" ")).toMatch(/LIVE outbound/);
    expect(reliability?.credentials.join(" ")).toMatch(/MIRA_OUTBOUND_MODE/);
  });

  it("requires every post to be revocable, because a vacated post must lose access", () => {
    for (const post of vacantPosts()) {
      expect(post.credentials.join(" "), post.post).toMatch(/revoke|revoked|revocation/i);
    }
  });
});

describe("founder decisions are business choices, not engineering excuses", () => {
  // s.E: a Founder Decision must never be a way to stop engineering work. Each
  // one must be a choice about money, law or identity — and each must say what
  // engineering can still do meanwhile, or be paired with a software blocker
  // that says it plainly.
  it("limits Founder decisions to pricing, cashier identity and legal position", () => {
    expect(blockersOfKind("FOUNDER_DECISION_BLOCKER").map((b) => b.id)).toEqual([
      "founder_approves_pricing_policy",
      "founder_names_passenger_cashier",
      "legal_entity_unconfirmed",
    ]);
  });

  it("pairs each Founder decision with the engineering work it gates", () => {
    for (const blocker of blockersOfKind("FOUNDER_DECISION_BLOCKER")) {
      const capabilities = blocker.blocks.filter((s) => classifySubject(s) === "CAPABILITY");
      expect(capabilities.length, blocker.id).toBeGreaterThan(0);
    }
  });
});

describe("every blocker is actionable", () => {
  const hasSubstance = (b: PreLiveBlocker) => b.detail.length > 40 && b.resolution.length > 30;

  it("states a factual situation and a concrete resolution", () => {
    expect(RT_PRE_LIVE_BLOCKERS.filter((b) => !hasSubstance(b)).map((b) => b.id)).toEqual([]);
  });

  it("covers every capability it claims to block with a capability that exists", () => {
    const ids = new Set(RT_ACCOUNTABILITY_MATRIX.map((c) => c.capability));
    for (const blocker of RT_PRE_LIVE_BLOCKERS) {
      for (const subject of blocker.blocks) {
        if (classifySubject(subject) === "CAPABILITY") expect(ids, blocker.id).toContain(subject);
      }
    }
  });

  it("never claims the taxonomy is a launch authorization", () => {
    // Guard against the failure mode of the whole exercise: a tidy, complete
    // blocker list reads like progress. It is not readiness.
    expect(report.liveStatus).toBe("NOT_READY");
    expect(blockedCapabilities.length).toBeGreaterThan(0);
  });
});
