// Marking test entities so they cannot be mistaken for, or reach, real people.
//
// Proving RT's operational loop needs passengers, drivers, vehicles, trips and
// payments that behave like the real thing — and the only way to prove the real
// business logic is to run the real business logic, on ordinary rows in the
// ordinary tables. A parallel "test mode" that bypasses matching, the CRM and
// the send boundary would prove that the test mode works.
//
// Which puts a synthetic row one background job away from a real WhatsApp
// message. runInScenario() already suppresses sends made *during* a scenario
// (scenario-context.ts), but a synthetic driver persisted by a scenario is
// still sitting in the database afterwards, where the expiry sweep, a
// follow-up job or a dispatcher click can pick it up outside any scenario.
// That is the leak this module closes.
//
// The mechanism is deliberately boring: the marker lives inside the natural
// key — Passenger.whatsappId, Driver.telegramUserId, a conversation id — and
// the four real send functions refuse a marked recipient unconditionally,
// scenario or not, LIVE or not. A marker in a separate boolean column can be
// forgotten by a query; a marker in the identifier travels with the row into
// every code path that could possibly send to it, including ones written
// later by someone who has never read this file.
//
// The marker is also why a synthetic identifier can never collide with a real
// one: WhatsApp ids are phone numbers and Telegram user ids are integers, so
// neither can begin with a letter.
import { isResettableContour } from "../db-contour";

/** Prefix carried by every synthetic identifier. Verbose on purpose: this
 * string shows up in logs, in the database and in a dispatcher's UI, and in
 * all three places it should be impossible to read as a real customer. */
export const SYNTHETIC_MARKER = "SYNTHETIC-TEST-";

/** Builds a synthetic identifier, e.g. `SYNTHETIC-TEST-passenger-7`.
 *
 * `kind` and `discriminator` are joined rather than hashed so a row found in
 * the database says what it was for without a lookup. */
export function syntheticId(kind: string, discriminator: string | number): string {
  const clean = String(discriminator).trim();
  if (!kind.trim() || !clean) {
    throw new Error("syntheticId needs a non-empty kind and discriminator to stay recognizable");
  }
  return `${SYNTHETIC_MARKER}${kind}-${clean}`;
}

/** True for anything carrying the marker. Checks `includes`, not `startsWith`:
 * identifiers get wrapped, prefixed with a channel name or embedded in a
 * composite key on their way through the system, and a recipient that contains
 * the marker anywhere is not a real person. */
export function isSyntheticIdentifier(value: string | null | undefined): boolean {
  return typeof value === "string" && value.includes(SYNTHETIC_MARKER);
}

/** Thrown when a synthetic recipient reaches a real send path. Deliberately
 * not a returned false: this is a defect in RT, not a delivery outcome, and it
 * should stop the job rather than be recorded as "not delivered" and forgotten.
 * Nothing about it is recoverable at runtime. */
export class SyntheticRecipientError extends Error {
  constructor(
    readonly channel: string,
    readonly recipient: string,
  ) {
    super(
      `Refusing to send a real ${channel} message to synthetic recipient "${recipient}". ` +
        "A test entity reached a real send path — see src/lib/testing/synthetic.ts.",
    );
    this.name = "SyntheticRecipientError";
  }
}

/** Guard for the real send functions. Unconditional by design: not gated on
 * NODE_ENV, on an env var or on scenario context, because every one of those
 * is a thing that can be misconfigured, and the cost of being wrong is a
 * message to a real phone number or a fabricated conversation with a person
 * who does not exist. */
export function assertRealRecipient(channel: string, recipient: string): void {
  if (isSyntheticIdentifier(recipient)) throw new SyntheticRecipientError(channel, recipient);
}

/** Thrown when synthetic data would be written somewhere it must never exist. */
export class SyntheticContourError extends Error {
  constructor(reason: string) {
    super(
      `Refusing to create synthetic test data: ${reason}. ` +
        "Synthetic entities may only exist in a resettable local contour — see src/lib/db-contour.ts.",
    );
    this.name = "SyntheticContourError";
  }
}

/** The answer to "can test data pollute production KPI?".
 *
 * Not "the reports filter it out" — that is a promise about 25 queries and
 * every query written after them. It cannot exist there in the first place:
 * the only functions that create synthetic rows call this first, and it
 * refuses any database the contour classifier will not let us reset. UNKNOWN
 * fails closed (s.29), and there is no override. */
export function assertSyntheticContour(url: string | undefined = process.env.DATABASE_URL): void {
  if (!url) throw new SyntheticContourError("DATABASE_URL is not set, so the target cannot be classified");
  if (!isResettableContour(url)) throw new SyntheticContourError("the target database is not a resettable contour");
}
