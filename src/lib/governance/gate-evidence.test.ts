import { describe, expect, it } from "vitest";
import { RT_ORG_NODES } from "./org";
import {
  awaitedParties,
  engineeringPosture,
  evidenceForGate,
  outstandingEngineeringWork,
  validateGateEvidence,
  GATE_EVIDENCE,
} from "./gate-evidence";
import { evaluateReadiness, MANUAL_PRE_LIVE_GATES } from "./readiness";

describe("validateGateEvidence", () => {
  it("finds no inconsistency between the evidence model and the blocker model", () => {
    expect(validateGateEvidence()).toEqual([]);
  });

  it("covers every manual gate exactly once", () => {
    const gates = GATE_EVIDENCE.map((e) => e.gate);
    expect(new Set(gates).size).toBe(gates.length);
    expect(gates.sort()).toEqual([...MANUAL_PRE_LIVE_GATES].sort());
  });

  it("names an attester who exists, is a person, and is in post today", () => {
    // An attestation signed by a vacant post is not an attestation.
    for (const entry of GATE_EVIDENCE) {
      const node = RT_ORG_NODES.find((n) => n.id === entry.attestedBy);
      expect(node, `${entry.gate} attested by unknown node ${entry.attestedBy}`).toBeDefined();
      expect(node?.classification).toBe("HUMAN_ROLE");
      expect(node?.status).toBe("IMPLEMENTED");
    }
  });

  it("says why each gate is UNKNOWN rather than restating its name", () => {
    for (const entry of GATE_EVIDENCE) {
      expect(entry.whyUnknown.length, entry.gate).toBeGreaterThan(80);
      // "founder_approved_pricing_policy is not approved" would be circular.
      expect(entry.whyUnknown).not.toContain(entry.gate);
    }
  });
});

describe("the evidence model cannot close a gate", () => {
  // This is the property the module exists to preserve. If a future change
  // wires evidence into readiness, gates start passing because someone wrote
  // code, which is exactly what s.41 forbids.
  it("leaves every gate UNKNOWN no matter what the evidence says", () => {
    const report = evaluateReadiness();
    for (const gate of MANUAL_PRE_LIVE_GATES) {
      const status = report.manualGates.find((g) => g.gate === gate)?.status;
      expect(status, gate).toBe("UNKNOWN");
    }
  });

  it("keeps LIVE not-ready even for a gate whose engineering is finished", () => {
    // Simulate the best case engineering can reach on its own and confirm it
    // buys nothing: an attestation is still missing, so the gate still fails
    // closed.
    const posture = engineeringPosture("founder_approved_passenger_cashier_identity");
    expect(posture).toBe("NOTHING_FOR_ENGINEERING_TO_DO");
    expect(evaluateReadiness().liveStatus).toBe("NOT_READY");
  });
});

describe("engineeringPosture", () => {
  it("reports work outstanding where artifacts are missing", () => {
    expect(engineeringPosture("backup_restore_drill_performed")).toBe("ENGINEERING_OUTSTANDING");
  });

  it("reports nothing to do where the gate is purely a Founder decision", () => {
    expect(engineeringPosture("founder_approved_passenger_cashier_identity")).toBe("NOTHING_FOR_ENGINEERING_TO_DO");
  });
});

describe("outstandingEngineeringWork", () => {
  it("is a concrete list, not a count of unknowns", () => {
    const work = outstandingEngineeringWork();
    expect(work.length).toBeGreaterThan(0);
    for (const { gate, items } of work) {
      expect(items.length, gate).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.kind).toBe("ENGINEERING_ARTIFACT");
        expect(item.present).not.toBe(true);
      }
    }
  });

  it("excludes the gates where engineering is not the constraint", () => {
    const gates = outstandingEngineeringWork().map((w) => w.gate);
    expect(gates).not.toContain("founder_approved_passenger_cashier_identity");
  });
});

describe("awaitedParties", () => {
  it("names the provider and the human for the credentials gate", () => {
    const parties = awaitedParties("real_provider_credentials_reviewed_and_scoped");
    expect(parties).toContain("EXTERNAL_PROVIDER_RECORD");
    expect(parties).toContain("HUMAN_ACT");
    expect(parties).toContain("FOUNDER_DECISION");
  });

  it("does not name engineering for a gate with no code in it", () => {
    expect(awaitedParties("founder_approved_passenger_cashier_identity")).toEqual(["FOUNDER_DECISION"]);
  });

  it("returns nothing for a gate that has no evidence entry", () => {
    // Fail quiet, not fail wrong: validateGateEvidence is what reports the gap.
    expect(awaitedParties("not_a_gate" as never)).toEqual([]);
    expect(evidenceForGate("not_a_gate" as never)).toBeUndefined();
  });
});
