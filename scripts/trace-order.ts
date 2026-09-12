// "What happened to order X, from the first message to where it is now?"
//
// Run as `npm run trace:order -- <handle>`, where the handle is whatever the
// person asking happens to be holding: an order id, a correlation id from a
// log line, a match or trip id from a dispatcher screen, the inbound message
// id, or the passenger's own chat id.
//
// Read-only by construction — buildOrderTimeline issues selects and nothing
// else — so this is not behind the destructive-command guard. It does print
// which database contour it read, because a timeline is evidence and evidence
// without its source is worth less.
//
// Contact identifiers and message bodies are redacted unless --reveal is
// passed. The default is the one to use in a ticket.
import { classifyDatabaseUrl } from "../src/lib/db-contour";
import { buildOrderTimeline, formatOrderTimeline } from "../src/lib/observability/order-timeline";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const reveal = args.includes("--reveal");
  const handle = args.find((arg) => !arg.startsWith("--"));

  if (!handle) {
    console.error("usage: npm run trace:order -- <order|correlation|match|trip|message|chat id> [--reveal]");
    process.exit(2);
  }

  const contour = classifyDatabaseUrl(process.env.DATABASE_URL);
  console.log(`reading ${contour.contour} contour${contour.host ? ` (${contour.host})` : ""}`);
  if (reveal) console.log("--reveal: message bodies and contact identifiers are NOT redacted");
  console.log();

  const timeline = await buildOrderTimeline(handle, { reveal });
  console.log(formatOrderTimeline(timeline));

  // Not found is not an error in the operator sense — it is an answer, and
  // usually means the handle came from somewhere else. Still a non-zero exit,
  // so a script wrapping this one can tell.
  if (!timeline.found) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
