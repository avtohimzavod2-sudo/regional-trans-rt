// SideEffectGateway core (hardening sprint s.3/s.4): a structural — not
// merely developer-discipline — guarantee that a scenario/simulation run
// can never trigger a real external side effect (WhatsApp/Telegram send,
// etc.), no matter how the surrounding code or env vars are configured.
//
// Every scenario is required to run inside runInScenario(). While active,
// the lowest-level send functions (src/lib/messaging/telegram.ts,
// src/lib/messaging/whatsapp.ts) consult isScenarioContext() and refuse to
// touch a real provider — this holds even if an operational mode env var
// (MIRA_OUTBOUND_MODE, ACQUISITION_OUTREACH_MODE, ...) is misconfigured to
// LIVE during a scenario run. Those env-var gates remain the normal
// dev/ops-facing on/off switch; this module is the last-resort net beneath
// them that a scenario can't be talked out of by misconfiguration alone.
//
// Built on AsyncLocalStorage rather than a global boolean so concurrently
// running scenarios (e.g. Promise.all of a batch) never see each other's
// context, and so context is never accidentally left "on" after a scenario
// ends — storage.run() restores the outer (undefined) context automatically
// once the callback settles, including on throw.
import { AsyncLocalStorage } from "node:async_hooks";

export interface ScenarioContext {
  testRunId: string;
  scenarioId: string;
}

const storage = new AsyncLocalStorage<ScenarioContext>();

export function isScenarioContext(): boolean {
  return storage.getStore() !== undefined;
}

export function currentScenarioContext(): ScenarioContext | undefined {
  return storage.getStore();
}

export function runInScenario<T>(context: ScenarioContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn);
}

/** Thrown by a real send function instead of silently faking success when a
 * scenario is (mis)configured to attempt a LIVE send. Callers that already
 * treat a thrown send as "not delivered" (e.g. acquisition's outreach gate)
 * therefore stay honest automatically — never fabricating a SENT/delivered
 * outcome for a message that never left the process. */
export class ScenarioSuppressedSendError extends Error {
  constructor(channel: string) {
    super(`Real ${channel} send suppressed: active scenario context — see src/lib/testing/scenario-context.ts`);
    this.name = "ScenarioSuppressedSendError";
  }
}
