// Capability collision detection (AGENTS Master Architecture spec s.26):
// "if two agents claim the same EXCLUSIVE capability, build/test must
// fail." Pure function over AgentContract[] so it can be unit-tested with
// synthetic contracts as well as run for real against AGENT_REGISTRY.
import type { AgentContract } from "@/lib/agents/types";

export interface CapabilityConflict {
  capability: string;
  owners: string[];
}

/** Scans every contract's ownsExclusiveCapabilities and reports any
 * capability string claimed by more than one agent. A contract that omits
 * the field is simply invisible here, not a violation (see types.ts's
 * doc-comment) — this only ever flags an actual double-claim. */
export function findCapabilityConflicts(contracts: AgentContract[]): CapabilityConflict[] {
  const ownersByCapability = new Map<string, string[]>();

  for (const contract of contracts) {
    for (const capability of contract.ownsExclusiveCapabilities ?? []) {
      const owners = ownersByCapability.get(capability) ?? [];
      owners.push(contract.name);
      ownersByCapability.set(capability, owners);
    }
  }

  const conflicts: CapabilityConflict[] = [];
  for (const [capability, owners] of ownersByCapability) {
    if (owners.length > 1) conflicts.push({ capability, owners });
  }
  // Code-unit order, not localeCompare: capability ids contain underscores,
  // which ICU collation treats as variable-weight punctuation, so "CARGO_A"
  // and "CARGOB" can swap between platforms. This list is rendered into a
  // build-failing error message, and an error message that reorders itself by
  // machine is the same defect that already cost one red CI run (see
  // compareStable in src/lib/management/metrics.ts). Kept inline rather than
  // imported so this module stays dependency-free apart from its own types.
  return conflicts.sort((a, b) => (a.capability < b.capability ? -1 : a.capability > b.capability ? 1 : 0));
}

export class CapabilityCollisionError extends Error {
  constructor(conflicts: CapabilityConflict[]) {
    const lines = conflicts.map((c) => `CAPABILITY_CONFLICT: ${c.capability} owners: ${c.owners.join(", ")}`);
    super(`Capability collisions found in AGENT_REGISTRY:\n${lines.join("\n")}`);
    this.name = "CapabilityCollisionError";
  }
}

/** Throws CapabilityCollisionError if any conflict exists — this is what a
 * test (or a startup check) calls to make a real collision a hard failure,
 * matching spec s.26's worked example message format exactly. */
export function assertNoCapabilityConflicts(contracts: AgentContract[]): void {
  const conflicts = findCapabilityConflicts(contracts);
  if (conflicts.length > 0) throw new CapabilityCollisionError(conflicts);
}
