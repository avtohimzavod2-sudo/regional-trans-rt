// Markdown renderers for the governance docs (s.37).
//
// Kept in src/ rather than scripts/ so a test can assert that the checked-in
// docs match what the code says. A governance doc that disagrees with the
// enforced model is worse than no doc.
import {
  RT_PRE_LIVE_BLOCKERS,
  blockersOfKind,
  classifySubject,
  type BlockerKind,
  type PostSpecification,
} from "./blockers";
import { RT_ACCOUNTABILITY_MATRIX, type RtCapability } from "./capabilities";
import {
  awaitedParties,
  engineeringPosture,
  outstandingEngineeringWork,
  GATE_EVIDENCE,
  type EngineeringPosture,
  type EvidenceKind,
} from "./gate-evidence";
import { RT_ORG_NODES, type RtOrgNode } from "./org";
import { countByBasis, preLiveFlagsNeedingFounderReview, PRE_LIVE_BASIS_RULES } from "./pre-live-basis";
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

const AWAITED_PARTY_LABEL: Record<EvidenceKind, string> = {
  ENGINEERING_ARTIFACT: "engineering",
  EXTERNAL_PROVIDER_RECORD: "a provider",
  HUMAN_ACT: "a person",
  FOUNDER_DECISION: "the Founder",
};

const ENGINEERING_POSTURE_LABEL: Record<EngineeringPosture, string> = {
  ENGINEERING_OUTSTANDING: "work outstanding",
  ENGINEERING_COMPLETE: "done — waiting on others",
  NOTHING_FOR_ENGINEERING_TO_DO: "not a code problem",
};

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
  lines.push("| Gate | Status | Waiting on | Engineering |");
  lines.push("| --- | --- | --- | --- |");
  for (const gate of report.manualGates) {
    const parties = awaitedParties(gate.gate).map((k) => AWAITED_PARTY_LABEL[k]);
    lines.push(
      `| \`${gate.gate}\` | ${gate.status} | ${parties.join(", ") || "—"} | ${ENGINEERING_POSTURE_LABEL[engineeringPosture(gate.gate)]} |`,
    );
  }
  lines.push("");
  lines.push(`Total manual gates: ${MANUAL_PRE_LIVE_GATES.length}.`);
  lines.push("");
  lines.push(
    "**UNKNOWN is not FAIL.** A gate is UNKNOWN because nobody has looked, and each one has a specific way to be looked at. It is also not readiness: a gate stays closed until someone attests, and no artifact in this repository can attest on a person's behalf.",
  );
  lines.push("");

  lines.push("### What would settle each gate");
  lines.push("");
  for (const entry of GATE_EVIDENCE) {
    lines.push(`#### \`${entry.gate}\``);
    lines.push("");
    lines.push(entry.whyUnknown);
    lines.push("");
    lines.push(`Attested by **${displayName(entry.attestedBy)}** once the evidence exists:`);
    lines.push("");
    for (const item of entry.evidence) {
      // A checkbox only where this repository can honestly tick it. Everything
      // else happens outside, and a box RT cannot check must not look checkable.
      const mark = item.kind === "ENGINEERING_ARTIFACT" ? (item.present ? "[x] " : "[ ] ") : "";
      const where = item.where ? ` *(${item.where})*` : "";
      lines.push(`- ${mark}**${AWAITED_PARTY_LABEL[item.kind]}** — ${item.description}${where}`);
    }
    lines.push("");
  }

  const outstanding = outstandingEngineeringWork();
  lines.push("### What engineering can build now");
  lines.push("");
  if (outstanding.length === 0) {
    lines.push("Nothing. Every remaining piece of evidence is a person, a provider or a Founder decision.");
  } else {
    lines.push(
      "The honest engineering backlog behind the unknowns. None of these close a gate on their own — they are the material the attester needs in order to have something to look at.",
    );
    lines.push("");
    for (const { gate, items } of outstanding) {
      for (const item of items) {
        lines.push(`- \`${gate}\` — ${item.description}`);
      }
    }
  }
  lines.push("");

  lines.push("## Why each capability is required before LIVE");
  lines.push("");
  lines.push(
    "The pre-LIVE line was drawn by one engineer and has business and legal consequences. Rather than asking for 33 booleans to be reviewed, each flag is traced to a stated rule, so the rules can be reviewed once and only the residue needs a per-capability decision.",
  );
  lines.push("");
  lines.push("| Basis | Pre-LIVE capabilities | Cannot be deferred | Why |");
  lines.push("| --- | --- | --- | --- |");
  const counts = countByBasis();
  for (const rule of PRE_LIVE_BASIS_RULES) {
    lines.push(
      `| \`${rule.basis}\` | ${counts.get(rule.basis) ?? 0} | ${rule.impliesPreLive ? "yes" : "depends on scale"} | ${rule.reason} |`,
    );
  }
  lines.push("");
  lines.push(
    "\"Cannot be deferred\" marks the bases where no engineering decision may postpone the requirement: customer money, physical safety, personal data, legality. The rest scale with exposure — a hand-picked pilot is not an open market — so their flags are genuinely the Founder's to set.",
  );
  lines.push("");

  const review = preLiveFlagsNeedingFounderReview();
  lines.push("### Flags that need a Founder decision");
  lines.push("");
  if (review.length === 0) {
    lines.push("None: every flag follows from a rule above.");
  } else {
    lines.push(`${review.length}, out of ${RT_ACCOUNTABILITY_MATRIX.length} capabilities:`);
    lines.push("");
    for (const f of review) {
      const verdict =
        f.review === "REQUIRED_ON_JUDGMENT_ALONE"
          ? "marked pre-LIVE on judgment alone — confirm it or drop it"
          : `**a rule says this cannot wait and the flag says it can** (${f.basis})`;
      lines.push(`- \`${f.capability}\` (${f.domain}) — ${verdict}.`);
    }
  }
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
  lines.push("Each blocker is classified by kind in RT_PRE_LIVE_BLOCKERS.md — the four kinds are resolved by different people.");
  lines.push("");

  return lines.join("\n") + "\n";
}

const KIND_HEADINGS: Record<BlockerKind, { title: string; intro: string }> = {
  SOFTWARE_BLOCKER: {
    title: "Software blockers",
    intro: "RT can close these itself. No permission, no appointment, no third party — just work not yet done.",
  },
  HUMAN_STAFFING_BLOCKER: {
    title: "Human staffing blockers — vacant posts",
    intro:
      "These are **not** missing code, and writing code will not close them. Each is a post that nobody holds. Each is specified below — mandate, rights, what the post must never be given, onboarding, credentials, who may appoint — and each specification deliberately describes a seat rather than a person. No individual is named or invented here; appointing someone happens outside this repository.",
  },
  EXTERNAL_PROVIDER_BLOCKER: {
    title: "External provider blockers",
    intro:
      "These depend on a third party RT does not control: a bank, a messaging platform, a registry. RT can prepare the integration; it cannot grant itself the relationship.",
  },
  FOUNDER_DECISION_BLOCKER: {
    title: "Founder decision blockers",
    intro:
      "Money, law and identity. Each is paired with the engineering work it gates, so that a pending decision never becomes a reason to stop building — the buildable half is listed as a software blocker.",
  },
};

function renderPost(post: PostSpecification, lines: string[]): void {
  const node = RT_ORG_NODES.find((n) => n.id === post.post);

  lines.push(`**Post:** \`${post.post}\` — ${node?.displayName ?? post.post} *(vacant)*`);
  lines.push("");
  lines.push(`**Mandate.** ${post.mandate}`);
  lines.push("");
  lines.push(`**Appointed by:** ${post.appointedBy}`);
  lines.push("");

  const section = (heading: string, items: string[]) => {
    if (items.length === 0) return;
    lines.push(`*${heading}*`);
    lines.push("");
    for (const item of items) lines.push(`- ${item}`);
    lines.push("");
  };

  section("Rights — least privilege", post.rights);
  section("Must never be granted — segregation of duties, as prohibitions", post.deniedRights);
  section("The same individual must not also hold", post.incompatibleWith);
  section("Onboarding checklist — complete before the post counts as filled", post.onboarding);
  section("Credentials", post.credentials);

  if (post.gatesHeldOpen.length > 0) {
    lines.push("*Gates that stay UNKNOWN until this post is filled*");
    lines.push("");
    for (const gate of post.gatesHeldOpen) lines.push(`- \`${gate}\` — blocks LIVE while UNKNOWN.`);
    lines.push("");
  }
}

export function renderPreLiveBlockersDoc(): string {
  const lines: string[] = [];
  const report = evaluateReadiness();

  lines.push("# RT Pre-LIVE Blockers");
  lines.push("");
  lines.push(GENERATED_NOTE);
  lines.push("");
  lines.push(
    "RT_PRE_LIVE_READINESS.md says RT is not ready. This file says **what kind of thing is missing**, because the four kinds are resolved by completely different people, and confusing them is how a project lies to itself about its own progress.",
  );
  lines.push("");
  lines.push("| Kind | Count | Closed by |");
  lines.push("| --- | --- | --- |");
  lines.push(`| SOFTWARE_BLOCKER | ${blockersOfKind("SOFTWARE_BLOCKER").length} | engineering |`);
  lines.push(
    `| HUMAN_STAFFING_BLOCKER | ${blockersOfKind("HUMAN_STAFFING_BLOCKER").length} | appointing a person to a vacant post |`,
  );
  lines.push(
    `| EXTERNAL_PROVIDER_BLOCKER | ${blockersOfKind("EXTERNAL_PROVIDER_BLOCKER").length} | a third party RT does not control |`,
  );
  lines.push(`| FOUNDER_DECISION_BLOCKER | ${blockersOfKind("FOUNDER_DECISION_BLOCKER").length} | the Founder, and only the Founder |`);
  lines.push("");
  lines.push(
    "> **A vacant post is not missing code.** If \"nobody is accountable for fraud\" were filed as a software gap, someone would eventually close it by writing a module, and RT would go live with an unaccountable one. So the human blockers below carry a post specification instead of a ticket.",
  );
  lines.push("");
  lines.push(
    `Blocked pre-LIVE capabilities: **${report.capabilities.filter((c) => c.status !== "READY").length}** · Manual gates still UNKNOWN: **${report.manualGates.filter((g) => g.status === "UNKNOWN").length}** · Classified blockers: **${RT_PRE_LIVE_BLOCKERS.length}**`,
  );
  lines.push("");
  lines.push(
    "Completeness is enforced: `blockers.test.ts` fails if any blocked capability or unattested gate has no entry here, and fails if a purely human vacancy is ever also filed as software.",
  );
  lines.push("");

  for (const kind of [
    "HUMAN_STAFFING_BLOCKER",
    "SOFTWARE_BLOCKER",
    "EXTERNAL_PROVIDER_BLOCKER",
    "FOUNDER_DECISION_BLOCKER",
  ] as const) {
    const blockers = blockersOfKind(kind);
    lines.push(`## ${KIND_HEADINGS[kind].title}`);
    lines.push("");
    lines.push(KIND_HEADINGS[kind].intro);
    lines.push("");

    for (const blocker of blockers) {
      lines.push(`### ${blocker.title}`);
      lines.push("");
      lines.push(`\`${blocker.id}\``);
      lines.push("");
      lines.push(`**Situation.** ${blocker.detail}`);
      lines.push("");
      lines.push(`**Clears when.** ${blocker.resolution}`);
      lines.push("");

      const caps = blocker.blocks.filter((s) => classifySubject(s) === "CAPABILITY");
      const gates = blocker.blocks.filter((s) => classifySubject(s) === "MANUAL_GATE");
      if (caps.length > 0) {
        lines.push(
          `**Holds shut.** ${caps.map((c) => `\`${c}\`${RT_ACCOUNTABILITY_MATRIX.find((m) => m.capability === c)?.preLiveRequired ? " *(pre-LIVE)*" : ""}`).join(", ")}`,
        );
        lines.push("");
      }
      if (gates.length > 0) {
        lines.push(`**Gates held UNKNOWN.** ${gates.map((g) => `\`${g}\``).join(", ")}`);
        lines.push("");
      }

      if (blocker.post) renderPost(blocker.post, lines);
    }
  }

  lines.push("## What this document is not");
  lines.push("");
  lines.push(
    "It is not a plan with dates, and it is not progress. A complete, tidy blocker list reads like readiness and is not readiness: every item below is still open. The verdict lives in RT_PRE_LIVE_READINESS.md and it is **NOT_READY**.",
  );
  lines.push("");

  return lines.join("\n") + "\n";
}
