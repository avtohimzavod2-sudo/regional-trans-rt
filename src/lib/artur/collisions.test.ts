import { describe, expect, it } from "vitest";
import type { AgentName } from "@prisma/client";
import type { AgentContract } from "@/lib/agents/types";
import { findCapabilityConflicts, assertNoCapabilityConflicts, CapabilityCollisionError } from "./collisions";
import { AGENT_REGISTRY } from "@/lib/agents/registry";

function contract(name: AgentName, ownsExclusiveCapabilities: string[]): AgentContract {
  return {
    name,
    mission: "test",
    inputs: [],
    outputs: [],
    permissions: [],
    prohibitedActions: [],
    kpi: [],
    escalationRules: [],
    ownsExclusiveCapabilities,
  };
}

describe("findCapabilityConflicts", () => {
  it("reports no conflicts when every capability has exactly one owner", () => {
    const contracts = [contract("SAPARGUL", ["confirm_cargo_payment"]), contract("TYYIN", ["central_treasury_transaction_record"])];
    expect(findCapabilityConflicts(contracts)).toEqual([]);
  });

  it("flags a capability claimed by two agents, matching the spec s.26 worked example exactly", () => {
    const contracts = [contract("SAPARGUL", ["confirm_cargo_payment"]), contract("ARTUR", ["confirm_cargo_payment"])];
    const conflicts = findCapabilityConflicts(contracts);
    expect(conflicts).toEqual([{ capability: "confirm_cargo_payment", owners: ["SAPARGUL", "ARTUR"] }]);
  });

  it("ignores contracts that omit ownsExclusiveCapabilities entirely", () => {
    const bare: AgentContract = { name: "MIRA", mission: "test", inputs: [], outputs: [], permissions: [], prohibitedActions: [], kpi: [], escalationRules: [] };
    expect(findCapabilityConflicts([bare, contract("TYYIN", ["central_treasury_transaction_record"])])).toEqual([]);
  });

  it("sorts multiple conflicts by capability name", () => {
    const contracts = [
      contract("SAPARGUL", ["z_capability", "a_capability"]),
      contract("ARTUR", ["z_capability", "a_capability"]),
    ];
    const conflicts = findCapabilityConflicts(contracts);
    expect(conflicts.map((c) => c.capability)).toEqual(["a_capability", "z_capability"]);
  });
});

describe("assertNoCapabilityConflicts", () => {
  it("does not throw when there are no conflicts", () => {
    expect(() => assertNoCapabilityConflicts([contract("SAPARGUL", ["confirm_cargo_payment"])])).not.toThrow();
  });

  it("throws CapabilityCollisionError with the exact spec s.26 message format when a conflict exists", () => {
    const contracts = [contract("SAPARGUL", ["confirm_cargo_payment"]), contract("ARTUR", ["confirm_cargo_payment"])];
    expect(() => assertNoCapabilityConflicts(contracts)).toThrow(CapabilityCollisionError);
    try {
      assertNoCapabilityConflicts(contracts);
      expect.fail("expected assertNoCapabilityConflicts to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(CapabilityCollisionError);
      expect((err as Error).message).toContain("CAPABILITY_CONFLICT: confirm_cargo_payment owners: SAPARGUL, ARTUR");
    }
  });
});

describe("AGENT_REGISTRY (real contracts)", () => {
  it("has no capability collisions across the live agent registry (spec s.26)", () => {
    expect(() => assertNoCapabilityConflicts(AGENT_REGISTRY)).not.toThrow();
  });
});
