// Vercel Cron target that sweeps timed-out Match proposals (README "Что
// дальше": Match.expiresAt was reserved but nothing ever expired it).
// Scheduled every 5 minutes in vercel.json — frequent enough that a 15-minute
// response window expires within a few minutes of actually elapsing. Fails
// closed like the Artur cron routes: if CRON_SECRET is not configured, every
// request is rejected rather than allowing an unauthenticated caller to
// trigger the sweep.
import { NextResponse } from "next/server";
import { expireStaleMatches } from "@/lib/matching/expiry";

function isAuthorizedCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await expireStaleMatches();
  return NextResponse.json(result);
}
