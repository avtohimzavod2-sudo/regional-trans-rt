// Readiness/observability endpoint (hardening sprint s.12-13): reports which
// side-effect-producing surfaces are currently gated to a safe non-LIVE mode
// vs. actually able to reach a real provider/bank adapter. Public and
// unauthenticated like a standard health check — it never returns secrets,
// only the resolved enum-like mode of each gate, so an operator or dashboard
// can see at a glance whether a given environment could send real messages
// or move real money before relying on it for anything live.
import { NextResponse } from "next/server";
import { resolveOutreachMode } from "@/lib/acquisition/outreach-log";
import { resolveOutboundMode } from "@/lib/mira/outbound";
import { currentTreasuryEnvironment } from "@/lib/tyyin/sandbox-adapter";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    modes: {
      miraOutbound: resolveOutboundMode(),
      acquisitionOutreach: resolveOutreachMode(),
      treasury: currentTreasuryEnvironment(),
    },
  });
}
