// What would it take to stop saying UNKNOWN?
//
// readiness.ts has ten manual pre-LIVE gates, and all ten are UNKNOWN today.
// UNKNOWN fails closed (s.29), which is correct and which is also where the
// thinking usually stops: "ten unknowns" is a number, not a plan, and a number
// invites exactly the two wrong moves —
//
//   * treating UNKNOWN as FAIL, which makes the gates useless because a FAIL
//     nobody can clear is indistinguishable from a FAIL nobody is working on;
//   * treating UNKNOWN as "probably fine", which is how a launch happens with
//     nobody accountable for safety.
//
// So this module answers, per gate: why is it UNKNOWN, what evidence would
// settle it either way, and — the part that decides what engineering does this
// week — which pieces of that evidence engineering can produce *now* without
// anyone's permission, versus which wait on a provider, a person or the Founder.
//
// What this module must never become: a way to close a gate. Nothing here
// feeds evaluateReadiness(), and a test enforces that. Producing every
// engineering artifact for a gate moves it from ENGINEERING_OUTSTANDING to
// ENGINEERING_COMPLETE and leaves the gate itself UNKNOWN, because the missing
// input was never code. The whole point of a manual gate is that a human looks
// at reality and says so; a repository cannot do that on their behalf (s.41).
import { blockersFor, type BlockerKind } from "./blockers";
import { MANUAL_PRE_LIVE_GATES, type ManualPreLiveGate } from "./readiness";

/** Who can produce a given piece of evidence. The distinction is the module's
 * whole content: these four are resolved by four different parties, and a plan
 * that blurs them is a plan to wait for the wrong thing. */
export type EvidenceKind =
  /** A file, a script, a test, a CI job. Engineering, no permission needed. */
  | "ENGINEERING_ARTIFACT"
  /** Issued by a third party RT does not control — a bank, Meta, a registry. */
  | "EXTERNAL_PROVIDER_RECORD"
  /** A named person did something in the physical world and can say so. */
  | "HUMAN_ACT"
  /** A business, money or legal choice that is the Founder's alone. */
  | "FOUNDER_DECISION";

export interface EvidenceItem {
  kind: EvidenceKind;
  /** The artifact or act itself, concretely enough to recognize when it exists. */
  description: string;
  /** Where it lives, or would live. Omitted where there is no location yet. */
  where?: string;
  /** True only where the artifact demonstrably exists in this repository today.
   * Restricted to ENGINEERING_ARTIFACT by a test: this repo can observe its own
   * files, and it cannot observe whether a person ran a drill or a bank issued a
   * key. Claiming otherwise would be fabricating an attestation. */
  present?: boolean;
}

export interface GateEvidence {
  gate: ManualPreLiveGate;
  /** The factual situation, not a restatement of the gate's name. */
  whyUnknown: string;
  evidence: EvidenceItem[];
  /** Org-node id of whoever signs the attestation once the evidence exists. */
  attestedBy: string;
}

export const GATE_EVIDENCE: GateEvidence[] = [
  {
    gate: "founder_approved_pricing_policy",
    whyUnknown:
      "No price rules have been stated. RT never invents a price (s.15), so every quote today is UNKNOWN / REQUIRES_QUOTE — which is the safe answer and also means RT cannot quote at all. There is nothing to attest because there is nothing to approve.",
    evidence: [
      {
        kind: "FOUNDER_DECISION",
        description:
          "Written price rules: per corridor, per seat, per cargo class, plus the commission RT takes. Enough to compute a fare without judgement.",
      },
      {
        kind: "ENGINEERING_ARTIFACT",
        description:
          "TARIFF_ENGINE turning those rules into deterministic quotes, each stamped with its provenance, returning UNKNOWN where no rule applies.",
        where: "not built — blocked on the rules above, since there is nothing to encode",
        present: false,
      },
      {
        kind: "ENGINEERING_ARTIFACT",
        description:
          "Tests proving no code path can produce a price that did not come from a rule, including the LLM paths.",
        where: "not built",
        present: false,
      },
    ],
    attestedBy: "FOUNDER",
  },
  {
    gate: "founder_approved_passenger_cashier_identity",
    whyUnknown:
      "The org node is deliberately named PASSENGER_CASHIER with DISPLAY_NAME_PENDING_FOUNDER_DECISION. No personal name has been invented for it (s.10), so the identity the gate refers to does not exist yet.",
    evidence: [
      {
        kind: "FOUNDER_DECISION",
        description:
          "Whether the passenger cashier is a person, a role held by an existing post, or a module — and, if a display name is wanted, what it is.",
      },
      {
        kind: "FOUNDER_DECISION",
        description:
          "Confirmation that the cashier has intake only and no outgoing-money path, matching Sapargul's boundary on the cargo side.",
      },
    ],
    attestedBy: "FOUNDER",
  },
  {
    gate: "legal_entity_and_regulatory_position_confirmed",
    whyUnknown:
      "Which legal entity operates RT, in which jurisdiction, under what licence for passenger and cargo transport, is unsettled. Nothing in the repository can determine it, and every provider relationship depends on it being settled first.",
    evidence: [
      {
        kind: "FOUNDER_DECISION",
        description: "The operating entity and its jurisdiction, on the record.",
      },
      {
        kind: "EXTERNAL_PROVIDER_RECORD",
        description:
          "Registration and any transport licence or permit the jurisdiction requires, as issued documents rather than as an intention.",
      },
      {
        kind: "HUMAN_ACT",
        description:
          "HUMAN_LEGAL_COMPLIANCE reviews the licensing position for both passenger and cargo transport and states in writing whether RT may operate.",
      },
    ],
    attestedBy: "FOUNDER",
  },
  {
    gate: "named_human_on_call_for_reliability",
    whyUnknown:
      "The HUMAN_RELIABILITY_OWNER post is vacant. There is no channel to page and no response-time commitment, so 'who answers when RT is down' has no answer — SIDE_EFFECT_GATEWAY reports straight to the Founder precisely because of this.",
    evidence: [
      {
        kind: "HUMAN_ACT",
        description:
          "The Founder appoints a named person to HUMAN_RELIABILITY_OWNER and that person accepts the on-call commitment.",
      },
      {
        kind: "HUMAN_ACT",
        description: "A published reachable channel, stated hours, and a response-time commitment.",
      },
      {
        kind: "ENGINEERING_ARTIFACT",
        description:
          "Something that can actually page them: an alert path from a failing health check to that channel. RT has /api/health and CI, and no alerting at all.",
        where: "not built",
        present: false,
      },
    ],
    attestedBy: "FOUNDER",
  },
  {
    gate: "named_human_responder_for_safety_incidents",
    whyUnknown:
      "The HUMAN_SAFETY_RESPONDER post is vacant. s.12 forbids an agent handling a physical-world emergency alone, and RT honours that by refusing to act — but a refusal with nobody behind it means a real incident reaches nobody.",
    evidence: [
      {
        kind: "HUMAN_ACT",
        description:
          "The Founder names a reachable person with a phone number and defined hours, and that person accepts.",
      },
      {
        kind: "HUMAN_ACT",
        description:
          "One rehearsal of the escalation script on a scenario incident, including the point at which emergency services are called.",
      },
      {
        kind: "ENGINEERING_ARTIFACT",
        description:
          "A per-incident access path to trip, driver and passenger contact details that logs every read, so the data-minimisation rule is enforced rather than promised.",
        where: "not built",
        present: false,
      },
    ],
    attestedBy: "FOUNDER",
  },
  {
    gate: "named_human_owner_for_security_and_secrets",
    whyUnknown:
      "The HUMAN_SECURITY_OWNER post is vacant. Security ownership is implicit in code review: nobody holds the secret inventory, nobody owns rotation, nobody is accountable for a leak.",
    evidence: [
      {
        kind: "HUMAN_ACT",
        description: "The Founder appoints a named person to HUMAN_SECURITY_OWNER.",
      },
      {
        kind: "ENGINEERING_ARTIFACT",
        description:
          "A mechanical inventory of every environment variable the code reads, what each is for, and whether it is a secret. Engineering can produce this from the source today; it is the raw material the security owner needs, not a substitute for them.",
        where: "not built",
        present: false,
      },
      {
        kind: "HUMAN_ACT",
        description:
          "The security owner turns that inventory into the authoritative one: blast radius per key, rotation owner per key, and the compromise procedure.",
      },
    ],
    attestedBy: "FOUNDER",
  },
  {
    gate: "named_human_owner_for_privacy_and_retention",
    whyUnknown:
      "The HUMAN_PRIVACY_OWNER post is vacant. RT stores passenger and driver personal data with no retention period, no deletion process and no owner for a deletion request (s.17). 'Forever' is the current behaviour and nobody chose it.",
    evidence: [
      {
        kind: "HUMAN_ACT",
        description: "The Founder appoints a named person to HUMAN_PRIVACY_OWNER.",
      },
      {
        kind: "ENGINEERING_ARTIFACT",
        description:
          "An inventory of every personal-data field in the Prisma schema, derived from the schema rather than hand-listed so it cannot go stale.",
        where: "not built",
        present: false,
      },
      {
        kind: "HUMAN_ACT",
        description:
          "A retention period set per data category, and a deletion-request path with a response time. Anything left without a period is a defect, not a default.",
      },
      {
        kind: "ENGINEERING_ARTIFACT",
        description:
          "An executable deletion path honouring those periods and legal holds, running through a reviewed and audited route rather than direct production DML (s.31).",
        where: "not built — needs the periods above to exist first",
        present: false,
      },
    ],
    attestedBy: "FOUNDER",
  },
  {
    gate: "backup_restore_drill_performed",
    whyUnknown:
      "No backup has ever been taken by RT's own tooling and no restore has ever been attempted, so there is no elapsed time to record and no evidence either way. Note what the database work of this sprint does and does not prove: `prisma migrate deploy` against an empty container proves the *schema* bootstraps from zero, which is not a restore of data.",
    evidence: [
      {
        kind: "ENGINEERING_ARTIFACT",
        description: "A backup script that runs unattended and states where the backup lands.",
        where: "not built",
        present: false,
      },
      {
        kind: "ENGINEERING_ARTIFACT",
        description:
          "A restore script that restores into a scratch environment — forward into a new database, never an in-place wipe (s.31).",
        where: "not built",
        present: false,
      },
      {
        kind: "ENGINEERING_ARTIFACT",
        description:
          "Proof the restored database is usable rather than merely present: migration status clean, no schema drift, a smoke query.",
        where:
          "partly available — the drift check `prisma migrate diff --exit-code` already runs in CI's integration job and can be reused against a restored database",
        present: false,
      },
      {
        kind: "HUMAN_ACT",
        description:
          "HUMAN_RELIABILITY_OWNER runs the drill once against real backed-up data and records the elapsed time. A script that has only ever run in CI has not been drilled.",
      },
    ],
    attestedBy: "FOUNDER",
  },
  {
    gate: "rollback_procedure_written_and_rehearsed",
    whyUnknown:
      "There is no deployment procedure and therefore nothing to roll back. CI verifies every push and deliberately does not deploy, so the question 'how do we take a release back' has never had to be answered.",
    evidence: [
      {
        kind: "FOUNDER_DECISION",
        description:
          "Where RT deploys and who may trigger it. Deployment is an act with an owner, not a consequence of merging.",
      },
      {
        kind: "ENGINEERING_ARTIFACT",
        description:
          "The written procedure: how a release goes out, how it comes back, and what happens to a migration that has already applied when the code rolls back.",
        where: "not written",
        present: false,
      },
      {
        kind: "HUMAN_ACT",
        description:
          "HUMAN_RELIABILITY_OWNER rehearses the rollback once. A written procedure that has never been executed is a draft.",
      },
    ],
    attestedBy: "FOUNDER",
  },
  {
    gate: "real_provider_credentials_reviewed_and_scoped",
    whyUnknown:
      "There are no real provider credentials to review. Every provider defaults to a mock — MIRA_AI_PROVIDER, JOLCHU_ROUTE_PROVIDER, ARTUR_AI_PROVIDER — and there is no payment provider and no approved messaging business account at all. The gate is UNKNOWN rather than PASS because 'no credentials exist' is not the same as 'credentials were reviewed and found correctly scoped'.",
    evidence: [
      {
        kind: "ENGINEERING_ARTIFACT",
        description:
          "The environment-variable inventory: every provider variable the code reads, what happens when it is unset, and whether the unset behaviour fails closed. Engineering can produce and test this now, and it is the checklist the review is performed against.",
        where: "not built",
        present: false,
      },
      {
        kind: "FOUNDER_DECISION",
        description:
          "Which providers RT will actually use for payment intake and for messaging. Depends on the legal entity being confirmed first.",
      },
      {
        kind: "EXTERNAL_PROVIDER_RECORD",
        description:
          "Issued credentials under the confirmed entity, plus the provider-side scope: an intake-only payment key with no payout capability, approved messaging templates, and stated rate limits.",
      },
      {
        kind: "HUMAN_ACT",
        description:
          "HUMAN_SECURITY_OWNER reviews each issued credential against the inventory and confirms its scope is the least that works — in particular that no key can move money outward (s.10).",
      },
    ],
    attestedBy: "FOUNDER",
  },
];

const BY_GATE = new Map<ManualPreLiveGate, GateEvidence>(GATE_EVIDENCE.map((e) => [e.gate, e]));

export function evidenceForGate(gate: ManualPreLiveGate): GateEvidence | undefined {
  return BY_GATE.get(gate);
}

/** How much of a gate's evidence is engineering's to produce, and whether it
 * has. Never a readiness status: see the header. A gate whose engineering is
 * complete is still UNKNOWN. */
export type EngineeringPosture =
  /** Engineering has artifacts to produce right now. This is the to-do list. */
  | "ENGINEERING_OUTSTANDING"
  /** Every engineering artifact exists; what remains is a person, a provider or
   * the Founder. Engineering cannot advance this gate further. */
  | "ENGINEERING_COMPLETE"
  /** Nothing about this gate is code. Writing more of it changes nothing. */
  | "NOTHING_FOR_ENGINEERING_TO_DO";

export function engineeringPosture(gate: ManualPreLiveGate): EngineeringPosture {
  const entry = BY_GATE.get(gate);
  if (!entry) return "NOTHING_FOR_ENGINEERING_TO_DO";
  const artifacts = entry.evidence.filter((e) => e.kind === "ENGINEERING_ARTIFACT");
  if (artifacts.length === 0) return "NOTHING_FOR_ENGINEERING_TO_DO";
  return artifacts.every((a) => a.present === true) ? "ENGINEERING_COMPLETE" : "ENGINEERING_OUTSTANDING";
}

export interface OutstandingEngineeringWork {
  gate: ManualPreLiveGate;
  items: EvidenceItem[];
}

/** Everything engineering could build today that would move a gate closer,
 * across all gates. The honest answer to "what should we work on", as opposed
 * to the count of unknowns. */
export function outstandingEngineeringWork(): OutstandingEngineeringWork[] {
  return GATE_EVIDENCE.flatMap((entry) => {
    const items = entry.evidence.filter((e) => e.kind === "ENGINEERING_ARTIFACT" && e.present !== true);
    return items.length > 0 ? [{ gate: entry.gate, items }] : [];
  });
}

/** Fixed reporting order, roughly "soonest actionable first": what RT can do
 * unaided, then what the Founder can decide today, then the two that depend on
 * the outside world. Declaration order would make the generated doc reshuffle
 * whenever a bullet moves. */
const PARTY_ORDER: EvidenceKind[] = [
  "ENGINEERING_ARTIFACT",
  "FOUNDER_DECISION",
  "HUMAN_ACT",
  "EXTERNAL_PROVIDER_RECORD",
];

/** Which parties a gate is waiting on, derived from its evidence rather than
 * declared, so the two cannot disagree. */
export function awaitedParties(gate: ManualPreLiveGate): EvidenceKind[] {
  const entry = BY_GATE.get(gate);
  if (!entry) return [];
  const kinds = new Set<EvidenceKind>();
  for (const item of entry.evidence) {
    if (item.kind === "ENGINEERING_ARTIFACT" && item.present === true) continue;
    kinds.add(item.kind);
  }
  return PARTY_ORDER.filter((k) => kinds.has(k));
}

/** The blocker kind a given evidence kind corresponds to. Used to check this
 * module against blockers.ts: if a blocker says a gate waits on an external
 * provider, the gate's evidence had better name something a provider issues. */
export const EVIDENCE_KIND_FOR_BLOCKER: Record<BlockerKind, EvidenceKind> = {
  SOFTWARE_BLOCKER: "ENGINEERING_ARTIFACT",
  HUMAN_STAFFING_BLOCKER: "HUMAN_ACT",
  EXTERNAL_PROVIDER_BLOCKER: "EXTERNAL_PROVIDER_RECORD",
  FOUNDER_DECISION_BLOCKER: "FOUNDER_DECISION",
};

export interface EvidenceInconsistency {
  gate: ManualPreLiveGate;
  message: string;
}

/** Cross-checks the evidence model against the blocker model. Both describe the
 * same reality from different angles, and a governance model that contradicts
 * itself is worse than one model alone. */
export function validateGateEvidence(): EvidenceInconsistency[] {
  const problems: EvidenceInconsistency[] = [];

  for (const gate of MANUAL_PRE_LIVE_GATES) {
    const entry = BY_GATE.get(gate);
    if (!entry) {
      problems.push({ gate, message: "no evidence entry: the gate would be UNKNOWN with no stated way out" });
      continue;
    }

    if (entry.evidence.length === 0) {
      problems.push({ gate, message: "no evidence items" });
    }

    // A manual gate that code alone could satisfy is not a manual gate, and
    // would eventually be closed by someone shipping a file.
    if (entry.evidence.every((e) => e.kind === "ENGINEERING_ARTIFACT")) {
      problems.push({ gate, message: "every evidence item is an engineering artifact; this is not a manual gate" });
    }

    for (const item of entry.evidence) {
      if (item.present !== undefined && item.kind !== "ENGINEERING_ARTIFACT") {
        problems.push({
          gate,
          message: `evidence "${item.description.slice(0, 40)}..." claims presence for a ${item.kind}; this repository cannot observe that`,
        });
      }
    }

    const kinds = new Set(entry.evidence.map((e) => e.kind));
    for (const blocker of blockersFor(gate)) {
      const expected = EVIDENCE_KIND_FOR_BLOCKER[blocker.kind];
      if (!kinds.has(expected)) {
        problems.push({
          gate,
          message: `blocker "${blocker.id}" is a ${blocker.kind} but the gate's evidence names no ${expected}`,
        });
      }
    }
  }

  for (const entry of GATE_EVIDENCE) {
    if (!(MANUAL_PRE_LIVE_GATES as readonly string[]).includes(entry.gate)) {
      problems.push({ gate: entry.gate, message: "evidence for a gate that does not exist" });
    }
  }

  return problems;
}
