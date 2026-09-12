// The one decision every real send makes before touching a provider.
//
// Previously this was two independent checks written out at each of the four
// send functions, in an order that mattered and was easy to get wrong. Now
// there is a single ordered gate, so a fifth send function added later gets
// the whole policy by calling one function rather than by remembering two.
//
// The order is the policy:
//
//   1. Inside a scenario with a registered dry-run sink, a SYNTHETIC recipient
//      is recorded and the caller told the message was accepted. Only
//      synthetic — a real recipient never reaches this branch, which is what
//      makes "accepted" a true statement rather than a fabricated delivery.
//   2. Inside a scenario otherwise: refused. Unchanged from before the sink
//      existed, and still the default, because a scenario that has not
//      declared a dry-run provider has not declared where its messages go.
//   3. Outside a scenario, a synthetic recipient is refused. This is the case
//      no scenario context can help with: a synthetic driver persisted by an
//      earlier run, picked up later by the expiry sweep or a dispatcher click.
//   4. Otherwise: proceed to the real provider, subject to the ordinary
//      credential and mode gates.
import { currentScenarioContext, ScenarioSuppressedSendError } from "@/lib/testing/scenario-context";
import { assertRealRecipient, isSyntheticIdentifier } from "@/lib/testing/synthetic";

export type SendScreening = "PROCEED" | "RECORDED_DRY_RUN";

/** Whether this recipient would take the dry-run branch below. Exists for
 * sendTelegramDirectMessage, whose contract is a boolean rather than a throw
 * and which therefore has to know the answer before asking for it. */
export function isDryRunRecipient(recipient: string): boolean {
  const scenario = currentScenarioContext();
  return scenario?.outboundSink !== undefined && isSyntheticIdentifier(recipient);
}

export function screenOutboundSend(
  channel: "WhatsApp" | "Telegram",
  recipient: string,
  text: string,
  matchId?: string,
): SendScreening {
  const scenario = currentScenarioContext();
  if (scenario) {
    if (scenario.outboundSink && isSyntheticIdentifier(recipient)) {
      scenario.outboundSink.record({
        channel,
        recipient,
        text,
        matchId,
        scenarioId: scenario.scenarioId,
        at: new Date(),
      });
      return "RECORDED_DRY_RUN";
    }
    throw new ScenarioSuppressedSendError(channel);
  }

  assertRealRecipient(channel, recipient);
  return "PROCEED";
}
