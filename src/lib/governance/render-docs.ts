// Markdown renderers for the governance docs (s.37).
//
// Kept in src/ rather than scripts/ so a test can assert that the checked-in
// docs match what the code says. A governance doc that disagrees with the
// enforced model is worse than no doc.
import { RT_ACCOUNTABILITY_MATRIX, type RtCapability } from "./capabilities";
import { RT_ORG_NODES, type RtOrgNode } from "./org";
import { evaluateReadiness, MANUAL_PRE_LIVE_GATES } from "./readiness";
import { validateGovernance } from "./validate";

const GENERATED_NOTE =
  "<!-- GENERATED FILE - do not edit by hand. Run `npm run docs:governance` after changing src/lib/governance. -->";

function displayName(id: string): string {
  return RT_ORG_NODES.find((n) => n.id === id)?.displayName ?? id;
}

function statusTag(id: string): string {
  const node = RT_ORG_NODES.find((n) => n.id === id);
  if (!node) return `${id} **(UNKNOWN NODE)**`;
  return node.status === "IMPLEMENTED" ? id : `${id} *(planned)*`;
}

function groupByDomain(matrix: RtCapability[]): Map<string, RtCapability[]> {
  const grouped = new Map<string, RtCapability[]>();
  for (const cap of matrix) {
    const list = grouped.get(cap.domain) ?? [];
    list.push(cap);
    grouped.set(cap.domain, list);
  }
  return grouped;
}

export function renderAccountabilityMatrixDoc(matrix: RtCapability[] = RT_ACCOUNTABILITY_MATRIX): string {
  const lines: string[] = [];
  const violations = validateGovernance({ matrix });

  lines.push("# RT Accountability Matrix");
  lines.push("");
  lines.push(GENERATED_NOTE);
  lines.push("");
  lines.push(
    "One responsibility has exactly one accountable owner. Not zero, not two. Others may execute, review or advise, but one node answers for the result.",
  );
  lines.push("");
  lines.push("**Reading this table**");
  lines.push("");
  lines.push("- **Accountable owner** — who answers for the outcome. Exactly one.");
  lines.push("- **Executor** — what actually runs the work. May be the owner.");
  lines.push("- **Reviewer** — checks the work. A reviewer is *not* an approver.");
  lines.push(
    "- **Human approver** — required where a machine must never decide alone. Must be a person; an agent can never fill this slot.",
  );
  lines.push("- **Escalates to** — where this goes when it cannot be resolved. Must be a node that exists today.");
  lines.push("- **Pre-LIVE** — must have a real, implemented owner before RT may serve real customers.");
  lines.push(
    "- **Code capabilities** — the `ownsExclusiveCapabilities` entries in `AGENT_REGISTRY` this responsibility covers. The two vocabularies differ by design and at different granularities, so the link is written down and checked in both directions; an unmapped code capability fails the build.",
  );
  lines.push(
    "- *(planned)* — the node is named but does not exist in code. Naming an owner does not make a responsibility solved; see RT_PRE_LIVE_READINESS.md.",
  );
  lines.push("");
  lines.push(`Capabilities: **${matrix.length}** · Pre-LIVE required: **${matrix.filter((c) => c.preLiveRequired).length}** · Structural violations: **${violations.length}**`);
  lines.push("");

  for (const [domain, caps] of [...groupByDomain(matrix)].sort()) {
    lines.push(`## ${domain.replace(/_/g, " ")}`);
    lines.push("");
    lines.push("| Capability | Type | Accountable owner | Executor | Reviewer | Human approver | System of record | Escalates to | Pre-LIVE |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const cap of caps) {
      lines.push(
        `| \`${cap.capability}\` | ${cap.type} | ${statusTag(cap.accountableOwner)} | ${cap.executor} | ${cap.reviewer ?? "—"} | ${cap.humanApprover ? statusTag(cap.humanApprover) : "—"} | ${cap.systemOfRecord} | ${statusTag(cap.escalationTarget)}${cap.plannedEscalationTarget ? ` → ${cap.plannedEscalationTarget} *(planned)*` : ""} | ${cap.preLiveRequired ? "yes" : "no"} |`,
      );
    }
    lines.push("");
    lines.push("<details><summary>Failure modes</summary>");
    lines.push("");
    for (const cap of caps) {
      lines.push(`- \`${cap.capability}\` — ${cap.failureMode}`);
    }
    lines.push("");
    lines.push("</details>");

    const mapped = caps.filter((c) => (c.implementedBy ?? []).length > 0);
    if (mapped.length > 0) {
      lines.push("");
      lines.push("<details><summary>Code capabilities (AGENT_REGISTRY)</summary>");
      lines.push("");
      for (const cap of mapped) {
        lines.push(`- \`${cap.capability}\` ← ${(cap.implementedBy ?? []).map((i) => `\`${i}\``).join(", ")}`);
      }
      lines.push("");
      lines.push("</details>");
    }
    lines.push("");
  }

  lines.push("## Organizational chart");
  lines.push("");
  lines.push(
    "Classifications describe what each node **actually is in code**, not what its name suggests. Only Artur, Jolchu and Mira invoke a reasoning provider; everything else is deterministic TypeScript, an adapter, or a human role. Describing a deterministic service as an autonomous employee is management theater and is deliberately avoided here.",
  );
  lines.push("");
  lines.push("`Reports to` is who is accountable **today**. It is never who calls the code.");
  lines.push("");
  lines.push("| Node | Classification | Status | Reports to | Intended manager | LLM |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const node of RT_ORG_NODES) {
    lines.push(
      `| ${node.id} — ${node.displayName} | ${node.classification} | ${node.status} | ${node.reportsTo ?? "*(root)*"} | ${node.plannedReportsTo ?? "—"} | ${node.usesLlmReasoning ? "yes" : "no"} |`,
    );
  }
  lines.push("");

  const awaiting = RT_ORG_NODES.filter((n: RtOrgNode) => n.plannedReportsTo);
  if (awaiting.length > 0) {
    lines.push("### Manager layer gap");
    lines.push("");
    lines.push(
      `${awaiting.length} nodes are intended to sit under a manager that does not exist yet. They report to a real manager in the meantime rather than being drawn under an empty box:`,
    );
    lines.push("");
    for (const node of awaiting) {
      lines.push(`- **${node.id}** — reports to ${node.reportsTo} today, ${node.plannedReportsTo} once built.`);
    }
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

export function renderPreLiveReadinessDoc(): string {
  const report = evaluateReadiness();
  const lines: string[] = [];

  lines.push("# RT Pre-LIVE Readiness");
  lines.push("");
  lines.push(GENERATED_NOTE);
  lines.push("");
  lines.push("> **A passing test suite is not a launch decision.**");
  lines.push(">");
  lines.push(
    "> Software tests prove that the code does what it was written to do. They cannot prove that a named human is on call, that a restore has ever been tried, that the legal position is settled, or that anyone is accountable for fraud. Those gates are listed below and they default to UNKNOWN. **UNKNOWN fails closed.**",
  );
  lines.push("");
  lines.push("## Verdict");
  lines.push("");
  lines.push("| Axis | Status |");
  lines.push("| --- | --- |");
  lines.push(`| Organizational architecture | **${report.organizationalStatus}** |`);
  lines.push(`| Pre-LIVE architecture | **${report.preLiveArchitectureStatus}** |`);
  lines.push(`| LIVE | **${report.liveStatus}** |`);
  lines.push("");
  lines.push(
    "These are independent. A structurally sound organization can be entirely unready to launch, and that is exactly the current state.",
  );
  lines.push("");

  const ready = report.capabilities.filter((c) => c.status === "READY").length;
  lines.push(
    `Pre-LIVE capabilities: **${report.capabilities.length}** · with a real owner: **${ready}** · blocked: **${report.capabilities.length - ready}**`,
  );
  lines.push("");

  lines.push("## Blocked pre-LIVE capabilities");
  lines.push("");
  const blocked = report.capabilities.filter((c) => c.status !== "READY");
  if (blocked.length === 0) {
    lines.push("None.");
  } else {
    lines.push("Each of these is a responsibility RT has named but not staffed.");
    lines.push("");
    for (const cap of blocked) {
      lines.push(`### \`${cap.capability}\``);
      lines.push("");
      lines.push(`Intended owner: **${cap.owner}** — ${displayName(cap.owner)}`);
      lines.push("");
      for (const b of cap.blockers) lines.push(`- ${b}`);
      lines.push("");
    }
  }

  lines.push("## Manual gates");
  lines.push("");
  lines.push(
    "No amount of test coverage can satisfy these. Each requires an explicit human attestation; absent one, the gate is UNKNOWN and LIVE stays blocked.",
  );
  lines.push("");
  lines.push("| Gate | Status |");
  lines.push("| --- | --- |");
  for (const gate of report.manualGates) {
    lines.push(`| \`${gate.gate}\` | ${gate.status} |`);
  }
  lines.push("");
  lines.push(`Total manual gates: ${MANUAL_PRE_LIVE_GATES.length}.`);
  lines.push("");

  lines.push("## How this is enforced");
  lines.push("");
  lines.push("- `src/lib/governance/org.ts` — who exists and who is accountable, classified by observed code behavior.");
  lines.push("- `src/lib/governance/capabilities.ts` — the accountability matrix.");
  lines.push("- `src/lib/governance/validate.ts` — structural rules (single owner, no cycles, no service acting as a manager, no escalation into a void).");
  lines.push("- `src/lib/governance/readiness.ts` — this gate. Fails closed on UNKNOWN.");
  lines.push("");
  lines.push(
    "To change a verdict, change the organization — staff the owner, name the human, run the drill — and regenerate this file. Editing the markdown alone changes nothing.",
  );
  lines.push("");

  return lines.join("\n") + "\n";
}
