// The explicit TEST/dry-run provider a scenario sends through.
//
// Without one, a scenario has two options at the send boundary and both lose
// information. Throwing ScenarioSuppressedSendError aborts the caller mid-flow,
// so an end-to-end run stops at the first notification. Swallowing it (as
// mira/orchestrator.ts's sendReply does, honestly reporting sent:false) lets
// the flow continue but throws away what the passenger would have been told —
// and "what did RT actually say to this passenger" is one of the things an
// operational proof has to be able to answer.
//
// So: a scenario may register a sink, and a send to a SYNTHETIC recipient is
// recorded into it and reported as accepted. The safety property is unchanged
// — no provider is contacted, the decision still happens at the lowest send
// boundary, and it is structurally impossible for a real recipient to take
// this path: screenOutboundSend() only diverts a recipient carrying the
// marker. A real number inside a sink-enabled scenario still refuses.
//
// That constraint is what keeps "accepted" honest. A recorded delivery is a
// true statement — a dry-run provider really did accept the message — and
// every recipient it can be true of is a test entity whose identifier says so
// in the row itself.
import type { ScenarioContext } from "./scenario-context";

export interface OutboundRecord {
  channel: "WhatsApp" | "Telegram";
  recipient: string;
  /** The message body, verbatim. A scenario asserting that the passenger was
   * told the driver's ETA has to be able to read it. */
  text: string;
  /** Present for the confirm/decline prompt, so a scenario can drive the reply
   * for the right match instead of guessing which one is open. */
  matchId?: string;
  scenarioId: string;
  at: Date;
}

/** Collects what a scenario would have sent. Deliberately in-memory and
 * per-scenario rather than a table: this is the transport, not a business
 * record, and a persisted one would need its own cleanup and its own answer to
 * "why is there delivery history for a passenger who does not exist". */
export class RecordingOutboundSink {
  private readonly records: OutboundRecord[] = [];

  record(entry: OutboundRecord): void {
    this.records.push(entry);
  }

  /** Everything sent, in order. */
  all(): readonly OutboundRecord[] {
    return this.records;
  }

  to(recipient: string): OutboundRecord[] {
    return this.records.filter((r) => r.recipient === recipient);
  }

  /** The most recent message carrying a confirm/decline prompt for any match,
   * which is what a scenario needs to answer as the passenger. */
  lastPrompt(): OutboundRecord | undefined {
    return [...this.records].reverse().find((r) => r.matchId !== undefined);
  }

  count(): number {
    return this.records.length;
  }

  clear(): void {
    this.records.length = 0;
  }
}

/** Builds a scenario context wired to a fresh sink. */
export function scenarioWithSink(context: Omit<ScenarioContext, "outboundSink">): {
  context: ScenarioContext;
  sink: RecordingOutboundSink;
} {
  const sink = new RecordingOutboundSink();
  return { context: { ...context, outboundSink: sink }, sink };
}
