// Automated governance validation (hardening sprint s.27).
//
// These checks exist so that the org chart and the accountability matrix
// cannot quietly rot into documentation. They are assertions about RT's
// structure, run as tests, and they fail the build when the structure
// becomes unsound — an unowned pre-live responsibility, two owners for one
// decision, a reporting cycle, or a deterministic service being treated as
// someone's manager.
//
// Deliberately NOT checked here: whether a capability is *done*. That is
// readiness.ts. A structurally valid matrix can still be entirely unready.
import { RT_ACCOUNTABILITY_MATRIX, type RtCapability } from "./capabilities";
import {
  FOUNDER_NODE_ID,
  MANAGERIAL_CLASSIFICATIONS,
  RT_ORG_NODES,
  getOrgNode,
  type RtOrgNode,
} from "./org";

export type GovernanceViolationCode =
  | "DUPLICATE_NODE_ID"
  | "DUPLICATE_CAPABILITY"
  | "MISSING_REPORTS_TO_TARGET"
  | "REPORTING_CYCLE"
  | "NON_MANAGERIAL_REPORTS_TO_TARGET"
  | "REPORTS_TO_PLANNED_NODE"
  | "MISSING_PLANNED_REPORTS_TO_TARGET"
  | "NON_MANAGERIAL_PLANNED_REPORTS_TO_TARGET"
  | "MULTIPLE_ROOTS"
  | "NO_ROOT"
  | "UNOWNED_CAPABILITY"
  | "MISSING_EXECUTOR"
  | "MISSING_REVIEWER_TARGET"
  | "MISSING_HANDOFF_TARGET"
  | "MISSING_HUMAN_APPROVER"
  | "NON_HUMAN_APPROVER"
  | "MISSING_ESCALATION_TARGET"
  | "SELF_ESCALATION"
  | "MISSING_PLANNED_ESCALATION_TARGET"
  | "INACTIVE_OWNER_OF_PRE_LIVE_CAPABILITY";

export interface GovernanceViolation {
  code: GovernanceViolationCode;
  subject: string;
  detail: string;
}

interface ValidationInput {
  nodes?: RtOrgNode[];
  matrix?: RtCapability[];
  /** Org node ids considered inactive/legacy. Sourced by callers from
   * AGENT_REGISTRY (`active: false`) so this module stays dependency-light. */
  inactiveNodeIds?: readonly string[];
}

function lookup(nodes: RtOrgNode[]): (id: string) => RtOrgNode | undefined {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (id) => byId.get(id);
}

/** s.27: reportsTo targets exist, no cycles, only managerial classes manage. */
export function validateOrgChart(nodes: RtOrgNode[] = RT_ORG_NODES): GovernanceViolation[] {
  const violations: GovernanceViolation[] = [];
  const get = lookup(nodes);

  const seen = new Set<string>();
  for (const node of nodes) {
    if (seen.has(node.id)) {
      violations.push({ code: "DUPLICATE_NODE_ID", subject: node.id, detail: "node id declared more than once" });
    }
    seen.add(node.id);
  }

  const roots = nodes.filter((n) => n.reportsTo === null);
  if (roots.length === 0) {
    violations.push({ code: "NO_ROOT", subject: "(org chart)", detail: "no node has reportsTo === null" });
  } else if (roots.length > 1) {
    violations.push({
      code: "MULTIPLE_ROOTS",
      subject: roots.map((n) => n.id).join(", "),
      detail: "exactly one root (FOUNDER) is allowed; accountability must converge",
    });
  }

  for (const node of nodes) {
    if (node.reportsTo === null) continue;

    const manager = get(node.reportsTo);
    if (!manager) {
      violations.push({
        code: "MISSING_REPORTS_TO_TARGET",
        subject: node.id,
        detail: `reportsTo "${node.reportsTo}" is not a known org node`,
      });
      continue;
    }

    if (!MANAGERIAL_CLASSIFICATIONS.includes(manager.classification)) {
      violations.push({
        code: "NON_MANAGERIAL_REPORTS_TO_TARGET",
        subject: node.id,
        detail: `reportsTo "${manager.id}" is ${manager.classification}; service-class entities must not be treated as manager nodes`,
      });
    }

    // An implemented node managed by a node that does not exist yet is an
    // accountability hole wearing an org chart. Use plannedReportsTo to
    // record the intended future manager instead.
    if (manager.status !== "IMPLEMENTED" && node.status === "IMPLEMENTED") {
      violations.push({
        code: "REPORTS_TO_PLANNED_NODE",
        subject: node.id,
        detail: `reportsTo "${manager.id}" is PLANNED; an existing node cannot report to a manager that does not exist`,
      });
    }
  }

  for (const node of nodes) {
    if (!node.plannedReportsTo) continue;

    const planned = get(node.plannedReportsTo);
    if (!planned) {
      violations.push({
        code: "MISSING_PLANNED_REPORTS_TO_TARGET",
        subject: node.id,
        detail: `plannedReportsTo "${node.plannedReportsTo}" is not a known org node`,
      });
    } else if (!MANAGERIAL_CLASSIFICATIONS.includes(planned.classification)) {
      violations.push({
        code: "NON_MANAGERIAL_PLANNED_REPORTS_TO_TARGET",
        subject: node.id,
        detail: `plannedReportsTo "${planned.id}" is ${planned.classification}, not a managerial class`,
      });
    }
  }

  // Cycle detection: walk each node up to the root, bounded by node count.
  for (const node of nodes) {
    const path = new Set<string>([node.id]);
    let current: RtOrgNode | undefined = node;
    while (current?.reportsTo) {
      const next: RtOrgNode | undefined = get(current.reportsTo);
      if (!next) break; // already reported as a missing target
      if (path.has(next.id)) {
        violations.push({
          code: "REPORTING_CYCLE",
          subject: node.id,
          detail: `reporting chain revisits "${next.id}"`,
        });
        break;
      }
      path.add(next.id);
      current = next;
    }
  }

  return violations;
}

/** s.1/s.27: one responsibility -> exactly one accountable owner, and every
 * referenced counterparty actually exists. */
export function validateAccountabilityMatrix(input: ValidationInput = {}): GovernanceViolation[] {
  const nodes = input.nodes ?? RT_ORG_NODES;
  const matrix = input.matrix ?? RT_ACCOUNTABILITY_MATRIX;
  const inactive = new Set(input.inactiveNodeIds ?? []);
  const violations: GovernanceViolation[] = [];
  const get = lookup(nodes);

  const seen = new Set<string>();
  for (const cap of matrix) {
    if (seen.has(cap.capability)) {
      // Two rows for one capability name IS the two-accountable-owners
      // failure, whether or not the owners differ.
      violations.push({
        code: "DUPLICATE_CAPABILITY",
        subject: cap.capability,
        detail: "capability declared more than once; a responsibility must have exactly one accountable owner",
      });
    }
    seen.add(cap.capability);

    const owner = get(cap.accountableOwner);
    if (!owner) {
      violations.push({
        code: "UNOWNED_CAPABILITY",
        subject: cap.capability,
        detail: `accountableOwner "${cap.accountableOwner}" is not a known org node`,
      });
    } else if (cap.preLiveRequired && inactive.has(owner.id)) {
      violations.push({
        code: "INACTIVE_OWNER_OF_PRE_LIVE_CAPABILITY",
        subject: cap.capability,
        detail: `sole owner "${owner.id}" is inactive/legacy but the capability is required before LIVE`,
      });
    }

    if (!cap.executor.trim()) {
      violations.push({ code: "MISSING_EXECUTOR", subject: cap.capability, detail: "executor is empty" });
    }

    if (cap.reviewer && !get(cap.reviewer)) {
      violations.push({
        code: "MISSING_REVIEWER_TARGET",
        subject: cap.capability,
        detail: `reviewer "${cap.reviewer}" is not a known org node`,
      });
    }

    if (cap.humanApprovalRequired) {
      // Structural rule: a human-approval capability must name a person.
      // Whether that person exists yet is readiness.ts's question.
      if (!cap.humanApprover) {
        violations.push({
          code: "MISSING_HUMAN_APPROVER",
          subject: cap.capability,
          detail: "humanApprovalRequired is true but no humanApprover is named",
        });
      } else {
        const approver = get(cap.humanApprover);
        if (!approver) {
          violations.push({
            code: "MISSING_HUMAN_APPROVER",
            subject: cap.capability,
            detail: `humanApprover "${cap.humanApprover}" is not a known org node`,
          });
        } else if (approver.classification !== "HUMAN_ROLE") {
          violations.push({
            code: "NON_HUMAN_APPROVER",
            subject: cap.capability,
            detail: `humanApprover "${approver.id}" is ${approver.classification}; only a HUMAN_ROLE can approve`,
          });
        }
      }
    }

    if (cap.handoffTarget && !get(cap.handoffTarget)) {
      violations.push({
        code: "MISSING_HANDOFF_TARGET",
        subject: cap.capability,
        detail: `handoffTarget "${cap.handoffTarget}" is not a known org node`,
      });
    }

    if (!get(cap.escalationTarget)) {
      violations.push({
        code: "MISSING_ESCALATION_TARGET",
        subject: cap.capability,
        detail: `escalationTarget "${cap.escalationTarget}" is not a known org node`,
      });
    } else if (cap.escalationTarget === cap.accountableOwner && cap.accountableOwner !== FOUNDER_NODE_ID) {
      // Escalating to yourself is not an escalation path. Only the root may
      // be its own terminus.
      violations.push({
        code: "SELF_ESCALATION",
        subject: cap.capability,
        detail: `escalationTarget equals accountableOwner "${cap.accountableOwner}"`,
      });
    }

    if (cap.plannedEscalationTarget && !get(cap.plannedEscalationTarget)) {
      violations.push({
        code: "MISSING_PLANNED_ESCALATION_TARGET",
        subject: cap.capability,
        detail: `plannedEscalationTarget "${cap.plannedEscalationTarget}" is not a known org node`,
      });
    }
  }

  return violations;
}

export function validateGovernance(input: ValidationInput = {}): GovernanceViolation[] {
  return [...validateOrgChart(input.nodes ?? RT_ORG_NODES), ...validateAccountabilityMatrix(input)];
}

export function assertGovernanceValid(input: ValidationInput = {}): void {
  const violations = validateGovernance(input);
  if (violations.length > 0) {
    const lines = violations.map((v) => `  [${v.code}] ${v.subject}: ${v.detail}`).join("\n");
    throw new Error(`RT governance validation failed:\n${lines}`);
  }
}

/** Convenience for docs/dispatcher: the accountability chain to the root. */
export function chainToRoot(nodeId: string, nodes: RtOrgNode[] = RT_ORG_NODES): string[] {
  const get = lookup(nodes);
  const chain: string[] = [];
  const seen = new Set<string>();
  let current = get(nodeId);
  while (current && !seen.has(current.id)) {
    chain.push(current.id);
    seen.add(current.id);
    current = current.reportsTo ? get(current.reportsTo) : undefined;
  }
  return chain;
}

export { getOrgNode };
