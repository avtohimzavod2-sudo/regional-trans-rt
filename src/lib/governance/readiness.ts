// RT pre-live readiness gate (hardening sprint s.29).
//
// Two separate questions, deliberately never collapsed into one:
//
//   1. Is the ORGANIZATION structurally sound? (validate.ts)
//   2. Is RT allowed to go LIVE?
//
// A green test suite answers neither. This module exists specifically to make
// it impossible to conclude "tests pass, therefore LIVE_READY": software
// checks are only one of the inputs, and the manual gates below default to
// UNKNOWN, which fails closed. Nothing in this file can be flipped to ready
// by writing more tests.
import { RT_ACCOUNTABILITY_MATRIX, type RtCapability } from "./capabilities";
import { RT_ORG_NODES, getOrgNode, type RtOrgNode } from "./org";
import { validateGovernance, type GovernanceViolation } from "./validate";

export type ReadinessStatus = "READY" | "NOT_READY" | "UNKNOWN";

export interface CapabilityReadiness {
  capability: string;
  status: ReadinessStatus;
  owner: string;
  blockers: string[];
}

/** Gates no test can prove. Each needs an explicit human attestation; the
 * absence of one is UNKNOWN, and UNKNOWN fails closed (s.29). */
export const MANUAL_PRE_LIVE_GATES = [
  "founder_approved_pricing_policy",
  "founder_approved_passenger_cashier_identity",
  "legal_entity_and_regulatory_position_confirmed",
  "named_human_on_call_for_reliability",
  "named_human_responder_for_safety_incidents",
  "named_human_owner_for_security_and_secrets",
  "named_human_owner_for_privacy_and_retention",
  "backup_restore_drill_performed",
  "rollback_procedure_written_and_rehearsed",
  "real_provider_credentials_reviewed_and_scoped",
] as const;

export type ManualPreLiveGate = (typeof MANUAL_PRE_LIVE_GATES)[number];

/** Attestations supplied by a human. Anything absent stays UNKNOWN. */
export type ManualGateAttestations = Partial<Record<ManualPreLiveGate, boolean>>;

export interface ManualGateReadiness {
  gate: ManualPreLiveGate;
  status: ReadinessStatus;
}

export interface ReadinessInput {
  nodes?: RtOrgNode[];
  matrix?: RtCapability[];
  attestations?: ManualGateAttestations;
  /** Runtime outbound mode classification, if known. Anything other than a
   * confirmed TEST/LIVE verdict is treated as UNKNOWN. */
  runtimeModeKind?: string;
}

export interface ReadinessReport {
  /** Structural soundness of the organization. */
  organizationalStatus: ReadinessStatus;
  /** Whether every PRE_LIVE capability has a real, implemented owner. */
  preLiveArchitectureStatus: ReadinessStatus;
  /** The only field that may ever authorize a LIVE launch. */
  liveStatus: ReadinessStatus;
  governanceViolations: GovernanceViolation[];
  capabilities: CapabilityReadiness[];
  manualGates: ManualGateReadiness[];
  blockers: string[];
}

function evaluateCapability(cap: RtCapability, nodes: RtOrgNode[]): CapabilityReadiness {
  const blockers: string[] = [];
  const owner = nodes.find((n) => n.id === cap.accountableOwner);

  if (!owner) {
    blockers.push(`accountable owner "${cap.accountableOwner}" does not exist`);
  } else if (owner.status !== "IMPLEMENTED") {
    // Naming an owner in the matrix is not the same as having one.
    blockers.push(`accountable owner "${owner.id}" is PLANNED, not implemented`);
  }

  if (cap.humanApprovalRequired) {
    // A reviewer is never an approver. Only an explicitly named person can
    // satisfy a human-approval requirement.
    if (!cap.humanApprover) {
      blockers.push("human approval required but no humanApprover is named");
    } else {
      const approver = nodes.find((n) => n.id === cap.humanApprover);
      if (!approver) {
        blockers.push(`humanApprover "${cap.humanApprover}" does not exist`);
      } else if (approver.classification !== "HUMAN_ROLE") {
        blockers.push(`humanApprover "${approver.id}" is ${approver.classification}, not a human role`);
      } else if (approver.status !== "IMPLEMENTED") {
        blockers.push(`human approver "${approver.id}" is not a named, active person`);
      }
    }
  }

  return {
    capability: cap.capability,
    status: blockers.length === 0 ? "READY" : "NOT_READY",
    owner: cap.accountableOwner,
    blockers,
  };
}

function evaluateManualGate(gate: ManualPreLiveGate, attestations: ManualGateAttestations): ManualGateReadiness {
  const value = attestations[gate];
  if (value === true) return { gate, status: "READY" };
  if (value === false) return { gate, status: "NOT_READY" };
  // Missing attestation is not "probably fine".
  return { gate, status: "UNKNOWN" };
}

export function evaluateReadiness(input: ReadinessInput = {}): ReadinessReport {
  const nodes = input.nodes ?? RT_ORG_NODES;
  const matrix = input.matrix ?? RT_ACCOUNTABILITY_MATRIX;
  const attestations = input.attestations ?? {};

  const governanceViolations = validateGovernance({ nodes, matrix });
  const organizationalStatus: ReadinessStatus = governanceViolations.length === 0 ? "READY" : "NOT_READY";

  const preLive = matrix.filter((c) => c.preLiveRequired);
  const capabilities = preLive.map((c) => evaluateCapability(c, nodes));
  const preLiveArchitectureStatus: ReadinessStatus = capabilities.every((c) => c.status === "READY")
    ? "READY"
    : "NOT_READY";

  const manualGates = MANUAL_PRE_LIVE_GATES.map((g) => evaluateManualGate(g, attestations));

  const blockers: string[] = [];
  for (const v of governanceViolations) blockers.push(`governance: [${v.code}] ${v.subject}`);
  for (const c of capabilities) {
    for (const b of c.blockers) blockers.push(`capability ${c.capability}: ${b}`);
  }
  for (const g of manualGates) {
    if (g.status === "UNKNOWN") blockers.push(`manual gate ${g.gate}: UNKNOWN (no attestation) — fails closed`);
    if (g.status === "NOT_READY") blockers.push(`manual gate ${g.gate}: NOT_READY`);
  }

  // The runtime mode is informational for readiness, but an unrecognized
  // value must never be optimistically ignored.
  if (input.runtimeModeKind !== undefined && !["LIVE", "TEST", "MIXED", "UNKNOWN"].includes(input.runtimeModeKind)) {
    blockers.push(`runtime mode "${input.runtimeModeKind}" is not a recognized classification`);
  }
  if (input.runtimeModeKind === "MIXED" || input.runtimeModeKind === "UNKNOWN") {
    blockers.push(`runtime mode is ${input.runtimeModeKind}; configuration must be unambiguous before LIVE`);
  }

  const liveStatus: ReadinessStatus = blockers.length === 0 ? "READY" : "NOT_READY";

  return {
    organizationalStatus,
    preLiveArchitectureStatus,
    liveStatus,
    governanceViolations,
    capabilities,
    manualGates,
    blockers,
  };
}

export function isLiveReady(input: ReadinessInput = {}): boolean {
  return evaluateReadiness(input).liveStatus === "READY";
}

export { getOrgNode };
