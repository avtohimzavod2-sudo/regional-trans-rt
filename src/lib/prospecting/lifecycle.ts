// Shared ProspectLifecycleStage machinery for the RT Prospecting Core (Task D
// spec D): the richer 11-state qualification/contact/follow-up/handoff
// lifecycle that DELIVERY_EXECUTOR_CONTRACTOR and CARGO_CARRIER_CONTRACTOR
// both drive on top of their own existing (unchanged) DeliveryExecutorProspect/
// CargoCarrierProspect `status` field — see docs/architecture/prospecting.md.
// `lifecycleStage` is purely additive: it never replaces or reinterprets the
// pre-existing `status` enum/transitions, which stay exactly as they were.
//
// Every transition here is a CAS (compare-and-swap) via `updateMany` + a
// stage-membership `where` clause, the same idiom as ./handoff.ts's
// transitionHandoff — concurrent callers can never race past each other, and
// a retried/replayed call resolves as a deterministic no-op rather than a
// silently duplicated side effect or a thrown error.
import type { ProspectLifecycleStage, ProspectVerificationStatus } from "@prisma/client";

/** Minimum pipeline (Task D spec A/B), identical for both Delivery Executor
 * and Cargo Carrier acquisition. REJECTED and CLOSED are terminal; every
 * other edge is a strict forward move — no silent state jumps. */
export const PROSPECT_LIFECYCLE_TRANSITIONS: Record<ProspectLifecycleStage, ProspectLifecycleStage[]> = {
  DISCOVERED: ["QUALIFICATION_PENDING"],
  QUALIFICATION_PENDING: ["QUALIFIED", "REJECTED"],
  QUALIFIED: ["CONTACT_PENDING"],
  REJECTED: ["CLOSED"],
  CONTACT_PENDING: ["CONTACTED"],
  CONTACTED: ["FOLLOW_UP_PENDING", "RESPONDED", "REJECTED"],
  FOLLOW_UP_PENDING: ["RESPONDED", "REJECTED"],
  RESPONDED: ["HANDOFF_READY"],
  HANDOFF_READY: ["HANDED_OFF"],
  HANDED_OFF: ["CLOSED"],
  CLOSED: [],
};

const REVERSE_TRANSITIONS: Record<ProspectLifecycleStage, ProspectLifecycleStage[]> = Object.keys(PROSPECT_LIFECYCLE_TRANSITIONS).reduce(
  (acc, stage) => {
    acc[stage as ProspectLifecycleStage] = [];
    return acc;
  },
  {} as Record<ProspectLifecycleStage, ProspectLifecycleStage[]>,
);
for (const [from, tos] of Object.entries(PROSPECT_LIFECYCLE_TRANSITIONS) as [ProspectLifecycleStage, ProspectLifecycleStage[]][]) {
  for (const to of tos) {
    REVERSE_TRANSITIONS[to].push(from as ProspectLifecycleStage);
  }
}

/** Pure: is this a legal ProspectLifecycleStage transition? */
export function canTransitionProspectLifecycleStage(current: ProspectLifecycleStage, next: ProspectLifecycleStage): boolean {
  return PROSPECT_LIFECYCLE_TRANSITIONS[current].includes(next);
}

export class ProspectLifecycleNotFoundError extends Error {
  constructor(prospectId: string) {
    super(`Prospect ${prospectId} not found`);
    this.name = "ProspectLifecycleNotFoundError";
  }
}

/** A genuine invariant violation (e.g. DISCOVERED -> HANDED_OFF directly) as
 * opposed to a harmless retry of the exact same transition, which resolves
 * as a deduplicated no-op instead of this. */
export class ProspectLifecycleTransitionError extends Error {
  constructor(prospectId: string, currentStage: ProspectLifecycleStage, attemptedStage: ProspectLifecycleStage) {
    super(`Prospect ${prospectId} is ${currentStage}; cannot transition lifecycleStage to ${attemptedStage}`);
    this.name = "ProspectLifecycleTransitionError";
  }
}

interface LifecycleRow {
  id: string;
  lifecycleStage: ProspectLifecycleStage;
}

interface LifecycleDelegate<Row extends LifecycleRow> {
  updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  findUnique(args: { where: { id: string } }): Promise<Row | null>;
  findUniqueOrThrow(args: { where: { id: string } }): Promise<Row>;
}

export interface LifecycleTransitionResult<Row> {
  prospect: Row;
  deduplicated: boolean;
}

/** Generic CAS transition usable by any prospect model carrying a
 * `lifecycleStage` column — one implementation shared by both Delivery
 * Executor and Cargo Carrier acquisition rather than two copies. */
export async function transitionProspectLifecycleStage<Row extends LifecycleRow>(
  delegate: LifecycleDelegate<Row>,
  prospectId: string,
  toStage: ProspectLifecycleStage,
  extraData: Record<string, unknown> = {},
): Promise<LifecycleTransitionResult<Row>> {
  const fromStages = REVERSE_TRANSITIONS[toStage];
  const result = await delegate.updateMany({
    where: { id: prospectId, lifecycleStage: { in: fromStages } },
    data: { lifecycleStage: toStage, ...extraData },
  });

  if (result.count === 1) {
    const prospect = await delegate.findUniqueOrThrow({ where: { id: prospectId } });
    return { prospect, deduplicated: false };
  }

  const current = await delegate.findUnique({ where: { id: prospectId } });
  if (!current) throw new ProspectLifecycleNotFoundError(prospectId);
  if (current.lifecycleStage === toStage) {
    // Genuine retry/replay of the same logical transition — deterministic no-op.
    return { prospect: current, deduplicated: true };
  }
  throw new ProspectLifecycleTransitionError(prospectId, current.lifecycleStage, toStage);
}

interface QualificationRow {
  id: string;
  [field: string]: unknown;
}

interface QualificationDelegate<Row extends QualificationRow> {
  findUnique(args: { where: { id: string } }): Promise<Row | null>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<Row>;
}

/** First-write-wins qualification-fact capture (Task D spec D: "no
 * destructive overwrite of provenance/evidence"). A field already carrying a
 * non-null value is never replaced by a later, possibly less-certain
 * re-submission of the same lead. Passing `undefined`/`null` for a fact
 * simply means "still unknown" and never clears an existing known value —
 * spec A/B's "do NOT fabricate unknown information" applies just as much to
 * silently blanking out a fact nobody actually retracted. */
export async function captureQualificationFacts<Row extends QualificationRow>(
  delegate: QualificationDelegate<Row>,
  prospectId: string,
  facts: Record<string, string | null | undefined>,
): Promise<Row> {
  const current = await delegate.findUnique({ where: { id: prospectId } });
  if (!current) throw new ProspectLifecycleNotFoundError(prospectId);

  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(facts)) {
    if (value == null) continue;
    if (current[key] == null) {
      data[key] = value;
    }
  }

  if (Object.keys(data).length === 0) return current;
  return delegate.update({ where: { id: prospectId }, data });
}

const VERIFICATION_RANK: Record<ProspectVerificationStatus, number> = {
  UNVERIFIED: 0,
  SELF_REPORTED: 1,
  VERIFIED: 2,
};

/** Verification status only ever moves forward (Task D spec D: no
 * destructive overwrite) — a later re-submission can never un-verify a
 * previously verified fact. Passing an equal or lower status is a no-op. */
export async function upgradeVerificationStatus<Row extends QualificationRow & { verificationStatus: ProspectVerificationStatus }>(
  delegate: QualificationDelegate<Row>,
  prospectId: string,
  next: ProspectVerificationStatus,
): Promise<Row> {
  const current = await delegate.findUnique({ where: { id: prospectId } });
  if (!current) throw new ProspectLifecycleNotFoundError(prospectId);
  if (VERIFICATION_RANK[next] <= VERIFICATION_RANK[current.verificationStatus]) return current;
  return delegate.update({ where: { id: prospectId }, data: { verificationStatus: next } });
}

interface DuplicateFlagRow extends QualificationRow {
  possibleDuplicateOfId: string | null;
}

interface DuplicateFlagDelegate<Row extends DuplicateFlagRow> {
  updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  findUniqueOrThrow(args: { where: { id: string } }): Promise<Row>;
}

/** Flags a possible duplicate WITHOUT merging the two records (Task D spec
 * E: "never merge two entities solely because names look similar... when
 * uncertain, keep them separate and flag potential duplicate"). Idempotent:
 * a prospect already flagged keeps its original flag rather than being
 * silently repointed at a different candidate on a later, weaker match. */
export async function flagPossibleDuplicate<Row extends DuplicateFlagRow>(
  delegate: DuplicateFlagDelegate<Row>,
  prospectId: string,
  duplicateOfId: string,
): Promise<Row> {
  await delegate.updateMany({
    where: { id: prospectId, possibleDuplicateOfId: null },
    data: { possibleDuplicateOfId: duplicateOfId },
  });
  return delegate.findUniqueOrThrow({ where: { id: prospectId } });
}
