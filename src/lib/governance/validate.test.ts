import { describe, expect, it } from "vitest";

import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { RT_ACCOUNTABILITY_MATRIX } from "./capabilities";
import { MANAGERIAL_CLASSIFICATIONS, RT_ORG_NODES, type RtOrgNode } from "./org";
import {
  assertGovernanceValid,
  chainToRoot,
  validateAccountabilityMatrix,
  validateGovernance,
  validateOrgChart,
} from "./validate";

/** Minimal well-formed chart used as the base for negative cases, so each
 * test perturbs exactly one thing. */
function baseNodes(): RtOrgNode[] {
  return [
    { id: "FOUNDER", displayName: "Founder", classification: "HUMAN_ROLE", status: "IMPLEMENTED", reportsTo: null },
    { id: "BOSS", displayName: "Boss", classification: "MANAGER", status: "IMPLEMENTED", reportsTo: "FOUNDER" },
    { id: "WORKER", displayName: "Worker", classification: "OPERATIONAL_AGENT", status: "IMPLEMENTED", reportsTo: "BOSS" },
    { id: "SVC", displayName: "Service", classification: "DETERMINISTIC_SERVICE", status: "IMPLEMENTED", reportsTo: "BOSS" },
  ];
}

describe("validateOrgChart", () => {
  it("accepts the real RT org chart", () => {
    expect(validateOrgChart()).toEqual([]);
  });

  it("accepts a minimal well-formed chart", () => {
    expect(validateOrgChart(baseNodes())).toEqual([]);
  });

  it("rejects a reportsTo target that does not exist", () => {
    const nodes = baseNodes();
    nodes[2].reportsTo = "GHOST";

    const codes = validateOrgChart(nodes).map((v) => v.code);
    expect(codes).toContain("MISSING_REPORTS_TO_TARGET");
  });

  it("rejects a service-class entity used as a manager node", () => {
    const nodes = baseNodes();
    nodes[2].reportsTo = "SVC";

    const violation = validateOrgChart(nodes).find((v) => v.code === "NON_MANAGERIAL_REPORTS_TO_TARGET");
    expect(violation?.subject).toBe("WORKER");
    expect(violation?.detail).toContain("DETERMINISTIC_SERVICE");
  });

  it("detects a reporting cycle", () => {
    const nodes = baseNodes();
    // BOSS -> WORKER is invalid on its own, so make the cycle purely managerial.
    nodes.push({
      id: "BOSS2",
      displayName: "Boss 2",
      classification: "MANAGER",
      status: "IMPLEMENTED",
      reportsTo: "BOSS",
    });
    nodes[1].reportsTo = "BOSS2";

    const codes = validateOrgChart(nodes).map((v) => v.code);
    expect(codes).toContain("REPORTING_CYCLE");
  });

  it("terminates on a cycle instead of looping forever", () => {
    const nodes: RtOrgNode[] = [
      { id: "A", displayName: "A", classification: "MANAGER", status: "IMPLEMENTED", reportsTo: "B" },
      { id: "B", displayName: "B", classification: "MANAGER", status: "IMPLEMENTED", reportsTo: "A" },
    ];

    const codes = validateOrgChart(nodes).map((v) => v.code);
    expect(codes).toContain("REPORTING_CYCLE");
    expect(codes).toContain("NO_ROOT");
  });

  it("rejects more than one root", () => {
    const nodes = baseNodes();
    nodes[1].reportsTo = null;

    const codes = validateOrgChart(nodes).map((v) => v.code);
    expect(codes).toContain("MULTIPLE_ROOTS");
  });

  it("rejects a duplicate node id", () => {
    const nodes = baseNodes();
    nodes.push({ ...nodes[2] });

    const codes = validateOrgChart(nodes).map((v) => v.code);
    expect(codes).toContain("DUPLICATE_NODE_ID");
  });

  it("gives every real node a path terminating at FOUNDER", () => {
    for (const node of RT_ORG_NODES) {
      const chain = chainToRoot(node.id);
      expect(chain[0]).toBe(node.id);
      expect(chain.at(-1)).toBe("FOUNDER");
    }
  });

  it("only ever assigns managerial classifications as managers", () => {
    const managerIds = new Set(RT_ORG_NODES.map((n) => n.reportsTo).filter((id): id is string => id !== null));

    for (const id of managerIds) {
      const manager = RT_ORG_NODES.find((n) => n.id === id);
      expect(manager, `manager ${id} must exist`).toBeDefined();
      expect(MANAGERIAL_CLASSIFICATIONS).toContain(manager!.classification);
    }
  });
});

describe("validateAccountabilityMatrix", () => {
  it("accepts the real RT accountability matrix", () => {
    expect(validateAccountabilityMatrix()).toEqual([]);
  });

  it("gives every capability exactly one accountable owner", () => {
    const counts = new Map<string, number>();
    for (const cap of RT_ACCOUNTABILITY_MATRIX) {
      counts.set(cap.capability, (counts.get(cap.capability) ?? 0) + 1);
    }

    const duplicates = [...counts.entries()].filter(([, n]) => n > 1);
    expect(duplicates).toEqual([]);
  });

  it("leaves no PRE_LIVE capability without an owner", () => {
    const preLive = RT_ACCOUNTABILITY_MATRIX.filter((c) => c.preLiveRequired);
    expect(preLive.length).toBeGreaterThan(0);

    for (const cap of preLive) {
      expect(cap.accountableOwner, `${cap.capability} must name an owner`).toBeTruthy();
      expect(
        RT_ORG_NODES.some((n) => n.id === cap.accountableOwner),
        `${cap.capability} owner ${cap.accountableOwner} must exist`,
      ).toBe(true);
    }
  });

  it("rejects a capability declared twice", () => {
    const matrix = [RT_ACCOUNTABILITY_MATRIX[0], { ...RT_ACCOUNTABILITY_MATRIX[0], accountableOwner: "ARTUR" }];

    const codes = validateAccountabilityMatrix({ matrix }).map((v) => v.code);
    expect(codes).toContain("DUPLICATE_CAPABILITY");
  });

  it("rejects an owner that is not a known org node", () => {
    const matrix = [{ ...RT_ACCOUNTABILITY_MATRIX[0], accountableOwner: "NOBODY" }];

    const codes = validateAccountabilityMatrix({ matrix }).map((v) => v.code);
    expect(codes).toContain("UNOWNED_CAPABILITY");
  });

  it("rejects a handoff target that does not exist", () => {
    const matrix = [{ ...RT_ACCOUNTABILITY_MATRIX[0], handoffTarget: "NOWHERE" }];

    const codes = validateAccountabilityMatrix({ matrix }).map((v) => v.code);
    expect(codes).toContain("MISSING_HANDOFF_TARGET");
  });

  it("rejects an escalation target that does not exist", () => {
    const matrix = [{ ...RT_ACCOUNTABILITY_MATRIX[0], escalationTarget: "NOWHERE" }];

    const codes = validateAccountabilityMatrix({ matrix }).map((v) => v.code);
    expect(codes).toContain("MISSING_ESCALATION_TARGET");
  });

  it("rejects a reviewer that does not exist", () => {
    const matrix = [{ ...RT_ACCOUNTABILITY_MATRIX[0], reviewer: "NOWHERE" }];

    const codes = validateAccountabilityMatrix({ matrix }).map((v) => v.code);
    expect(codes).toContain("MISSING_REVIEWER_TARGET");
  });

  it("rejects escalating to yourself", () => {
    const matrix = [{ ...RT_ACCOUNTABILITY_MATRIX[0], accountableOwner: "MIRA", escalationTarget: "MIRA" }];

    const codes = validateAccountabilityMatrix({ matrix }).map((v) => v.code);
    expect(codes).toContain("SELF_ESCALATION");
  });

  it("rejects an inactive agent as sole owner of a PRE_LIVE capability", () => {
    const cap = RT_ACCOUNTABILITY_MATRIX.find((c) => c.preLiveRequired)!;

    const codes = validateAccountabilityMatrix({
      matrix: [cap],
      inactiveNodeIds: [cap.accountableOwner],
    }).map((v) => v.code);

    expect(codes).toContain("INACTIVE_OWNER_OF_PRE_LIVE_CAPABILITY");
  });

  it("allows an inactive agent to own a non-PRE_LIVE capability", () => {
    const cap = RT_ACCOUNTABILITY_MATRIX.find((c) => !c.preLiveRequired)!;

    const codes = validateAccountabilityMatrix({
      matrix: [cap],
      inactiveNodeIds: [cap.accountableOwner],
    }).map((v) => v.code);

    expect(codes).not.toContain("INACTIVE_OWNER_OF_PRE_LIVE_CAPABILITY");
  });
});

describe("validateGovernance against live registry state", () => {
  // AUDIT FINDING (s.2/s.27): `active` is declared on AgentContract but only
  // populated on 8 of 27 contracts, and no contract has ever set it to false.
  // So an undeclared flag cannot mean "inactive" — it means "never stated".
  // "Inactive" is therefore read strictly as `active === false`. This test
  // pins the current coverage so that broadening it becomes a deliberate act
  // rather than a silent change in what the safety check is measuring.
  it("pins which registry contracts declare an active flag", () => {
    const declared = AGENT_REGISTRY.filter((a) => a.active !== undefined).map((a) => String(a.name));

    expect(declared.sort()).toEqual(
      [
        "ARTUR",
        "CARGO_CARRIER_CONTRACTOR",
        "CRM_AUTO",
        "DELIVERY_CONTRACTOR",
        "DELIVERY_EXECUTOR_CONTRACTOR",
        "DRIVER_CONTRACTOR",
        "PASSENGER_CONTRACTOR",
        "RT_OFFICE",
      ].sort(),
    );
  });

  it("has no agent currently marked inactive, so the check runs on an empty set", () => {
    expect(AGENT_REGISTRY.filter((a) => a.active === false)).toEqual([]);
  });

  it("passes with agents explicitly decommissioned in AGENT_REGISTRY", () => {
    const inactiveNodeIds = AGENT_REGISTRY.filter((a) => a.active === false).map((a) => String(a.name).toUpperCase());

    expect(validateGovernance({ inactiveNodeIds })).toEqual([]);
  });

  it("assertGovernanceValid does not throw for the real structure", () => {
    expect(() => assertGovernanceValid()).not.toThrow();
  });

  it("assertGovernanceValid throws with a readable report", () => {
    const nodes = baseNodes();
    nodes[2].reportsTo = "GHOST";

    expect(() => assertGovernanceValid({ nodes })).toThrow(/MISSING_REPORTS_TO_TARGET/);
  });
});

describe("current vs intended hierarchy", () => {
  it("rejects an implemented node reporting to a manager that does not exist yet", () => {
    const nodes = baseNodes();
    nodes.push({
      id: "FUTURE_BOSS",
      displayName: "Future boss",
      classification: "MANAGER",
      status: "PLANNED",
      reportsTo: "FOUNDER",
    });
    nodes[2].reportsTo = "FUTURE_BOSS";

    const codes = validateOrgChart(nodes).map((v) => v.code);
    expect(codes).toContain("REPORTS_TO_PLANNED_NODE");
  });

  it("allows a planned node to report to another planned node", () => {
    const nodes = baseNodes();
    nodes.push(
      { id: "FUTURE_BOSS", displayName: "FB", classification: "MANAGER", status: "PLANNED", reportsTo: "FOUNDER" },
      { id: "FUTURE_WORKER", displayName: "FW", classification: "OPERATIONAL_AGENT", status: "PLANNED", reportsTo: "FUTURE_BOSS" },
    );

    expect(validateOrgChart(nodes)).toEqual([]);
  });

  it("accepts plannedReportsTo pointing at a planned manager", () => {
    const nodes = baseNodes();
    nodes.push({ id: "FUTURE_BOSS", displayName: "FB", classification: "MANAGER", status: "PLANNED", reportsTo: "FOUNDER" });
    nodes[2].plannedReportsTo = "FUTURE_BOSS";

    expect(validateOrgChart(nodes)).toEqual([]);
  });

  it("rejects a plannedReportsTo target that does not exist", () => {
    const nodes = baseNodes();
    nodes[2].plannedReportsTo = "GHOST";

    const codes = validateOrgChart(nodes).map((v) => v.code);
    expect(codes).toContain("MISSING_PLANNED_REPORTS_TO_TARGET");
  });

  it("rejects a service as a plannedReportsTo target", () => {
    const nodes = baseNodes();
    nodes[2].plannedReportsTo = "SVC";

    const codes = validateOrgChart(nodes).map((v) => v.code);
    expect(codes).toContain("NON_MANAGERIAL_PLANNED_REPORTS_TO_TARGET");
  });

  it("records the intended manager layer without pretending it exists", () => {
    // Akzhol and Zholaman are referenced across the codebase but have no
    // module. Every node drawn under them must still report to a real
    // manager today.
    const awaiting = RT_ORG_NODES.filter((n) => n.plannedReportsTo);
    expect(awaiting.length).toBeGreaterThan(0);

    for (const node of awaiting) {
      const intended = RT_ORG_NODES.find((n) => n.id === node.plannedReportsTo);
      expect(intended?.status).toBe("PLANNED");

      const current = RT_ORG_NODES.find((n) => n.id === node.reportsTo);
      expect(current?.status, `${node.id} must report to a real manager today`).toBe("IMPLEMENTED");
    }
  });
});

describe("registry / org chart consistency", () => {
  it("covers every registered agent in the org chart", () => {
    const orgIds = new Set(RT_ORG_NODES.map((n) => n.id));
    const missing = AGENT_REGISTRY.map((a) => String(a.name)).filter((n) => !orgIds.has(n));

    expect(missing).toEqual([]);
  });

  it("classifies only genuinely LLM-backed modules as reasoning agents", () => {
    // s.2: the anti-theater check. If this list grows, it must be because a
    // module really started calling a reasoning provider.
    const reasoning = RT_ORG_NODES.filter((n) => n.usesLlmReasoning).map((n) => n.id).sort();

    expect(reasoning).toEqual(["ARTUR", "JOLCHU", "MIRA"]);
  });

  it("never marks a deterministic service or adapter as using LLM reasoning", () => {
    const misclassified = RT_ORG_NODES.filter(
      (n) =>
        n.usesLlmReasoning &&
        ["DETERMINISTIC_SERVICE", "ADAPTER_WRAPPER", "READ_ONLY_ANALYTICS", "HUMAN_ROLE"].includes(n.classification),
    );

    expect(misclassified).toEqual([]);
  });
});
