// Why is a capability required before RT may serve real customers?
//
// The cold audit's B2 finding: 33 of 51 capabilities are marked
// preLiveRequired, that line was drawn by one engineer, and it has business and
// legal consequences it has never been reviewed for. "Ask the Founder to review
// 33 booleans" is not a reviewable request. This module makes the line
// reviewable instead, by separating two different things that were tangled:
//
//   - flags that follow from a stated rule (money moves, physical safety,
//     personal data, legal exposure, the core service loop) — reviewable as a
//     rule, once, rather than one capability at a time;
//   - flags that rest on nothing but the author's judgment — which is the
//     actual content of B2, and which this module surfaces by name.
//
// It also checks the inverse, which B2 did not ask about and which matters
// more: a capability that a rule says must be pre-LIVE but which is marked
// false. A missing requirement is more dangerous than a surplus one.
//
// This module decides nothing. It cannot: whether RT may launch with a given
// capability unfinished is a business decision. It only makes sure the question
// put to the Founder is a short, specific list instead of a number.
import { RT_ACCOUNTABILITY_MATRIX, type RtCapability } from "./capabilities";

export type PreLiveBasis =
  | "MONEY_MOVES"
  | "PHYSICAL_SAFETY"
  | "PERSONAL_DATA"
  | "LEGAL_EXPOSURE"
  | "ABUSE_AND_FRAUD"
  | "CUSTOMER_RECOURSE"
  | "OPERATIONAL_CONTINUITY"
  | "CORE_SERVICE_LOOP"
  | "LAUNCH_AUTHORITY";

/** A capability whose pre-LIVE status rests on no rule at all. Not a basis —
 * the absence of one. */
export const JUDGMENT_ONLY = "JUDGMENT_ONLY" as const;

export interface BasisRule {
  basis: PreLiveBasis;
  /** Stated once, reviewed once, rather than per capability. */
  reason: string;
  /** Domains this rule covers wholesale. */
  domains?: string[];
  /** Individual capabilities, where the domain is not the right unit. */
  capabilities?: string[];
  /** Whether the rule, on its own, means "must be ready before real
   * customers". Only the bases where the answer is unarguable set this: a
   * capability that touches customer money, physical safety, personal data or
   * legal exposure cannot be deferred past LIVE by an engineering decision. */
  impliesPreLive: boolean;
}

export const PRE_LIVE_BASIS_RULES: BasisRule[] = [
  {
    basis: "MONEY_MOVES",
    reason: "Real customer money is involved. An error here is not recoverable by an apology.",
    domains: ["FINANCE", "PRICING"],
    impliesPreLive: true,
  },
  {
    basis: "PHYSICAL_SAFETY",
    reason:
      "A person gets into a stranger's vehicle. Unverified drivers and unhandled safety incidents cause physical harm, which no refund undoes.",
    domains: ["TRUST_SAFETY", "VERIFICATION"],
    impliesPreLive: true,
  },
  {
    basis: "PERSONAL_DATA",
    reason: "RT holds identifiable data about passengers and drivers, and holding it is itself a duty.",
    domains: ["SECURITY", "PRIVACY"],
    impliesPreLive: true,
  },
  {
    basis: "LEGAL_EXPOSURE",
    reason: "Operating unlawfully is not a degraded mode of operating.",
    domains: ["LEGAL"],
    impliesPreLive: true,
  },
  {
    basis: "ABUSE_AND_FRAUD",
    reason:
      "Without detection, a fake driver or a collusive pattern is indistinguishable from normal business until the loss is realized.",
    domains: ["RISK"],
    // partner_verification sits in PARTNERS, not VERIFICATION: an unvetted
    // cargo executor is a loss and fraud exposure rather than a passenger
    // safety one, and the distinction is worth keeping — it is the difference
    // between money at risk and a person at risk.
    capabilities: ["partner_verification"],
    // Deliberately false: the necessary level of fraud detection depends on
    // scale and on the Founder's risk appetite. A tightly controlled pilot with
    // hand-picked drivers and hand-picked partners is a different exposure from
    // an open market.
    impliesPreLive: false,
  },
  {
    basis: "CUSTOMER_RECOURSE",
    reason: "A customer who has been wronged needs somewhere to go, or RT's only answer is silence.",
    domains: ["DISPUTES"],
    capabilities: ["service_recovery"],
    impliesPreLive: false,
  },
  {
    basis: "OPERATIONAL_CONTINUITY",
    reason: "A platform that cannot be restored, rolled back or watched is one incident from data loss.",
    domains: ["RELIABILITY"],
    impliesPreLive: false,
  },
  {
    basis: "CORE_SERVICE_LOOP",
    reason:
      "On the path a passenger actually travels: ask, match, book, ride. Without these there is no product to launch, so the flag is a tautology rather than a judgment.",
    capabilities: [
      "public_customer_communication",
      "inbound_message_routing",
      "outbound_send_boundary",
      "passenger_request_intake",
      "driver_offer_intake",
      "matching_decision",
      "seat_reservation_and_booking_lifecycle",
      "passenger_driver_operational_loop",
      "real_world_geography_eta_traffic",
      "internal_corridor_topology",
    ],
    impliesPreLive: false,
  },
  {
    basis: "LAUNCH_AUTHORITY",
    reason: "Someone must decide to launch. Structural, not a judgment about scope.",
    capabilities: ["launch_readiness_decision"],
    impliesPreLive: false,
  },
];

export type BasisReview =
  | "NONE"
  /** Marked pre-LIVE on judgment alone. The Founder should confirm or drop it. */
  | "REQUIRED_ON_JUDGMENT_ALONE"
  /** A rule says this cannot wait, and the flag says it can. Harder to defend. */
  | "RULE_REQUIRES_IT_BUT_FLAG_SAYS_NO";

export interface BasisFinding {
  capability: string;
  domain: string;
  preLiveRequired: boolean;
  basis: PreLiveBasis | typeof JUDGMENT_ONLY;
  reason: string;
  review: BasisReview;
}

function ruleFor(cap: RtCapability): BasisRule | undefined {
  // Capability-level rules win over domain-level ones: they are the more
  // specific statement, and they exist precisely where a domain is too coarse.
  return (
    PRE_LIVE_BASIS_RULES.find((r) => r.capabilities?.includes(cap.capability)) ??
    PRE_LIVE_BASIS_RULES.find((r) => r.domains?.includes(cap.domain))
  );
}

export function classifyPreLiveBasis(matrix: RtCapability[] = RT_ACCOUNTABILITY_MATRIX): BasisFinding[] {
  return matrix.map((cap) => {
    const rule = ruleFor(cap);

    if (!rule) {
      return {
        capability: cap.capability,
        domain: cap.domain,
        preLiveRequired: cap.preLiveRequired,
        basis: JUDGMENT_ONLY,
        reason: "No stated rule covers this capability.",
        review: cap.preLiveRequired ? "REQUIRED_ON_JUDGMENT_ALONE" : "NONE",
      };
    }

    const review: BasisReview =
      rule.impliesPreLive && !cap.preLiveRequired ? "RULE_REQUIRES_IT_BUT_FLAG_SAYS_NO" : "NONE";

    return {
      capability: cap.capability,
      domain: cap.domain,
      preLiveRequired: cap.preLiveRequired,
      basis: rule.basis,
      reason: rule.reason,
      review,
    };
  });
}

/** The short list the Founder should actually look at. Everything else follows
 * from a rule and needs no per-capability decision. */
export function preLiveFlagsNeedingFounderReview(matrix: RtCapability[] = RT_ACCOUNTABILITY_MATRIX): BasisFinding[] {
  return classifyPreLiveBasis(matrix).filter((f) => f.review !== "NONE");
}

export function countByBasis(matrix: RtCapability[] = RT_ACCOUNTABILITY_MATRIX): Map<string, number> {
  const counts = new Map<string, number>();
  for (const finding of classifyPreLiveBasis(matrix)) {
    if (!finding.preLiveRequired) continue;
    counts.set(finding.basis, (counts.get(finding.basis) ?? 0) + 1);
  }
  return counts;
}
