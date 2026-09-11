import { describe, expect, it } from "vitest";

import { RT_ACCOUNTABILITY_MATRIX } from "./capabilities";
import { RT_ORG_NODES, type RtOrgNode } from "./org";
import {
  MANUAL_PRE_LIVE_GATES,
  evaluateReadiness,
  isLiveReady,
  type ManualGateAttestations,
} from "./readiness";

/** Every manual gate attested true — used to prove that even a fully
 * attested system still fails on structural grounds, and vice versa. */
function allGatesAttested(): ManualGateAttestations {
  return Object.fromEntries(MANUAL_PRE_LIVE_GATES.map((g) => [g, true]));
}

describe("evaluateReadiness — fail-closed behaviour", () => {
  it("does NOT report LIVE ready for RT as it stands today", () => {
    expect(evaluateReadiness().liveStatus).toBe("NOT_READY");
    expect(isLiveReady()).toBe(false);
  });

  it("treats a missing attestation as UNKNOWN, not as satisfied", () => {
    const report = evaluateReadiness();

    for (const gate of report.manualGates) {
      expect(gate.status).toBe("UNKNOWN");
    }
    expect(report.blockers.some((b) => b.includes("fails closed"))).toBe(true);
  });

  it("still refuses LIVE when every manual gate is attested but owners are PLANNED", () => {
    // This is the core anti-theater assertion: attestations alone, like tests
    // alone, must never be sufficient.
    const report = evaluateReadiness({ attestations: allGatesAttested() });

    expect(report.liveStatus).toBe("NOT_READY");
    expect(report.blockers.some((b) => b.includes("is PLANNED, not implemented"))).toBe(true);
  });

  it("names the unowned pre-live capabilities explicitly", () => {
    const report = evaluateReadiness();
    const notReady = report.capabilities.filter((c) => c.status === "NOT_READY").map((c) => c.capability);

    // These are the s.4 orphan responsibilities; each must be visible.
    expect(notReady).toContain("passenger_payment_intake");
    expect(notReady).toContain("fare_and_tariff_authority");
    expect(notReady).toContain("fraud_risk_signal_detection");
    expect(notReady).toContain("driver_identity_verification");
    expect(notReady).toContain("information_security");
    expect(notReady).toContain("platform_reliability_and_incident_response");
  });

  it("reports organizational structure as sound even while LIVE is blocked", () => {
    // Structure and readiness are independent axes; passing one must never
    // be read as passing the other.
    const report = evaluateReadiness();

    expect(report.organizationalStatus).toBe("READY");
    expect(report.preLiveArchitectureStatus).toBe("NOT_READY");
    expect(report.liveStatus).toBe("NOT_READY");
  });

  it("blocks LIVE when the org structure itself is invalid", () => {
    const nodes: RtOrgNode[] = [
      { id: "FOUNDER", displayName: "F", classification: "HUMAN_ROLE", status: "IMPLEMENTED", reportsTo: null },
      { id: "X", displayName: "X", classification: "MANAGER", status: "IMPLEMENTED", reportsTo: "GHOST" },
    ];

    const report = evaluateReadiness({ nodes, matrix: [], attestations: allGatesAttested() });

    expect(report.organizationalStatus).toBe("NOT_READY");
    expect(report.liveStatus).toBe("NOT_READY");
  });

  it("blocks LIVE on a MIXED runtime mode", () => {
    const report = evaluateReadiness({ matrix: [], attestations: allGatesAttested(), runtimeModeKind: "MIXED" });

    expect(report.liveStatus).toBe("NOT_READY");
    expect(report.blockers.some((b) => b.includes("MIXED"))).toBe(true);
  });

  it("blocks LIVE on an UNKNOWN runtime mode", () => {
    const report = evaluateReadiness({ matrix: [], attestations: allGatesAttested(), runtimeModeKind: "UNKNOWN" });

    expect(report.liveStatus).toBe("NOT_READY");
  });

  it("blocks LIVE on an unrecognized runtime mode string", () => {
    const report = evaluateReadiness({ matrix: [], attestations: allGatesAttested(), runtimeModeKind: "probably_fine" });

    expect(report.liveStatus).toBe("NOT_READY");
    expect(report.blockers.some((b) => b.includes("not a recognized classification"))).toBe(true);
  });

  it("blocks LIVE when a gate is explicitly attested false", () => {
    const attestations = { ...allGatesAttested(), backup_restore_drill_performed: false };

    const report = evaluateReadiness({ matrix: [], attestations });
    expect(report.liveStatus).toBe("NOT_READY");
  });
});

describe("evaluateReadiness — capability-level rules", () => {
  const nodes: RtOrgNode[] = [
    { id: "FOUNDER", displayName: "F", classification: "HUMAN_ROLE", status: "IMPLEMENTED", reportsTo: null },
    { id: "BOSS", displayName: "B", classification: "MANAGER", status: "IMPLEMENTED", reportsTo: "FOUNDER" },
    { id: "DONE", displayName: "D", classification: "DETERMINISTIC_SERVICE", status: "IMPLEMENTED", reportsTo: "BOSS" },
    { id: "TODO", displayName: "T", classification: "DETERMINISTIC_SERVICE", status: "PLANNED", reportsTo: "BOSS" },
    { id: "GHOST_HUMAN", displayName: "G", classification: "HUMAN_ROLE", status: "PLANNED", reportsTo: "FOUNDER" },
  ];

  function cap(overrides: Partial<(typeof RT_ACCOUNTABILITY_MATRIX)[number]>) {
    return {
      capability: "c",
      domain: "MANAGEMENT" as const,
      type: "DECISION" as const,
      accountableOwner: "DONE",
      executor: "DONE",
      systemOfRecord: "x",
      escalationTarget: "BOSS",
      humanApprovalRequired: false,
      preLiveRequired: true,
      failureMode: "x",
      ...overrides,
    };
  }

  it("marks a capability READY when its owner is implemented", () => {
    const report = evaluateReadiness({ nodes, matrix: [cap({})], attestations: allGatesAttested() });

    expect(report.capabilities[0].status).toBe("READY");
    expect(report.liveStatus).toBe("READY");
  });

  it("marks a capability NOT_READY when its owner is only PLANNED", () => {
    const report = evaluateReadiness({ nodes, matrix: [cap({ accountableOwner: "TODO" })] });

    expect(report.capabilities[0].status).toBe("NOT_READY");
    expect(report.capabilities[0].blockers[0]).toContain("PLANNED");
  });

  it("requires a real human approver when humanApprovalRequired is set", () => {
    const report = evaluateReadiness({
      nodes,
      matrix: [cap({ humanApprovalRequired: true, humanApprover: "GHOST_HUMAN" })],
      attestations: allGatesAttested(),
    });

    expect(report.capabilities[0].status).toBe("NOT_READY");
    expect(report.capabilities[0].blockers.join(" ")).toContain("not a named, active person");
  });

  it("rejects a non-human as the approver for a human-approval capability", () => {
    const report = evaluateReadiness({
      nodes,
      matrix: [cap({ humanApprovalRequired: true, humanApprover: "DONE" })],
      attestations: allGatesAttested(),
    });

    expect(report.capabilities[0].blockers.join(" ")).toContain("not a human role");
  });

  it("never lets a non-human reviewer satisfy a human-approval requirement", () => {
    // Regression guard: reviewer and approver are different roles.
    const report = evaluateReadiness({
      nodes,
      matrix: [cap({ humanApprovalRequired: true, reviewer: "DONE" })],
      attestations: allGatesAttested(),
    });

    expect(report.capabilities[0].status).toBe("NOT_READY");
    expect(report.capabilities[0].blockers.join(" ")).toContain("no humanApprover is named");
  });

  it("blocks a capability whose escalation target does not exist yet", () => {
    const report = evaluateReadiness({
      nodes,
      matrix: [cap({ escalationTarget: "TODO" })],
      attestations: allGatesAttested(),
    });

    expect(report.capabilities[0].status).toBe("NOT_READY");
    expect(report.capabilities[0].blockers.join(" ")).toContain("escalations have nowhere to go");
  });

  it("ignores capabilities that are not required before LIVE", () => {
    const report = evaluateReadiness({
      nodes,
      matrix: [cap({ accountableOwner: "TODO", preLiveRequired: false })],
      attestations: allGatesAttested(),
    });

    expect(report.capabilities).toEqual([]);
    expect(report.liveStatus).toBe("READY");
  });
});

describe("pre-live matrix coverage", () => {
  it("requires the safety-critical domains to be pre-live gated", () => {
    const preLive = new Set(RT_ACCOUNTABILITY_MATRIX.filter((c) => c.preLiveRequired).map((c) => c.capability));

    for (const required of [
      "public_customer_communication",
      "outbound_send_boundary",
      "matching_decision",
      "central_treasury_bank_truth",
      "refund_authorization",
      "fare_and_tariff_authority",
      "preventive_trust_gate",
      "dispute_arbitration_decision",
      "driver_identity_verification",
      "legal_and_regulatory_compliance",
      "launch_readiness_decision",
    ]) {
      expect(preLive.has(required), `${required} must be pre-live gated`).toBe(true);
    }
  });

  it("routes every escalation to a node that exists today", () => {
    for (const cap of RT_ACCOUNTABILITY_MATRIX) {
      const target = RT_ORG_NODES.find((n) => n.id === cap.escalationTarget);
      expect(target, `${cap.capability} escalates to unknown ${cap.escalationTarget}`).toBeDefined();
      expect(target!.status, `${cap.capability} escalates to a node that does not exist`).toBe("IMPLEMENTED");
    }
  });

  it("records the intended manager layer separately from today's escalation path", () => {
    const deferred = RT_ACCOUNTABILITY_MATRIX.filter((c) => c.plannedEscalationTarget);
    expect(deferred.length).toBeGreaterThan(0);

    for (const cap of deferred) {
      const planned = RT_ORG_NODES.find((n) => n.id === cap.plannedEscalationTarget);
      expect(planned?.status).toBe("PLANNED");
      expect(cap.escalationTarget).not.toBe(cap.plannedEscalationTarget);
    }
  });

  it("keeps every org node reachable from the matrix or explicitly structural", () => {
    // Guards against a node existing in the chart purely as decoration.
    const owners = new Set(
      RT_ACCOUNTABILITY_MATRIX.flatMap((c) => [c.accountableOwner, c.executor, c.escalationTarget]),
    );
    // The human dispatcher is a receiver of escalations across the dispatcher
    // UI rather than the accountable owner of a named capability.
    const structuralOnly = new Set(["HUMAN_DISPATCHER"]);

    const orphanNodes = RT_ORG_NODES.filter((n) => !owners.has(n.id) && !structuralOnly.has(n.id)).map((n) => n.id);

    expect(orphanNodes).toEqual([]);
  });
});
