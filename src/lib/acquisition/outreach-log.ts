// Shared, append-only outreach ledger + safety gate for all three Market
// Acquisition Contractors (master spec s.5): only public/permitted sources,
// rate limiting, dedup, do-not-contact, source traceability, idempotent
// outreach, honest NO_PROVIDER_CONFIGURED/SANDBOX/DRY_RUN exposure rather
// than a fabricated successful send. AcquisitionOutreachEvent rows are never
// updated or deleted — "opted out" is derived by reading whether any prior
// event for this prospect ever carried doNotContact:true, the same
// append-only-derived-state idiom as crm-auto/bridge.ts's
// latestOpenBreakdownForDriver.
import { Prisma } from "@prisma/client";
import type { AcquisitionProspectType } from "@prisma/client";
import { db } from "@/lib/db";
import { adapterForChannel } from "./adapters";
import type { OutreachOutcome, OutreachRequest } from "./types";

// One unsolicited outreach attempt per prospect per cooldown window — never
// repeated spam (master spec s.5).
const RATE_LIMIT_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
const MESSAGE_SUMMARY_MAX_LENGTH = 160;

function summarize(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MESSAGE_SUMMARY_MAX_LENGTH ? `${trimmed.slice(0, MESSAGE_SUMMARY_MAX_LENGTH)}…` : trimmed;
}

/** LIVE actually attempts a send; SANDBOX/DRY_RUN never call a real adapter.
 * Missing/unrecognized env is the safe default (DRY_RUN), never LIVE. */
function resolveOutreachMode(): "LIVE" | "SANDBOX" | "DRY_RUN" {
  const raw = (process.env.ACQUISITION_OUTREACH_MODE ?? "DRY_RUN").toUpperCase();
  return raw === "LIVE" || raw === "SANDBOX" ? raw : "DRY_RUN";
}

export async function isDoNotContact(prospectType: AcquisitionProspectType, prospectRef: string): Promise<boolean> {
  const flagged = await db.acquisitionOutreachEvent.findFirst({
    where: { prospectType, prospectRef, doNotContact: true },
  });
  return !!flagged;
}

async function recentlyContacted(prospectType: AcquisitionProspectType, prospectRef: string): Promise<boolean> {
  const recent = await db.acquisitionOutreachEvent.findFirst({
    where: {
      prospectType,
      prospectRef,
      status: "SENT",
      createdAt: { gte: new Date(Date.now() - RATE_LIMIT_COOLDOWN_MS) },
    },
  });
  return !!recent;
}

async function writeOutreachEvent(
  request: Pick<OutreachRequest, "contractorAgent" | "prospectType" | "prospectRef" | "channel" | "sourceType" | "sourceRef" | "idempotencyKey" | "text">,
  status: OutreachOutcome["status"],
  doNotContact = false,
): Promise<OutreachOutcome> {
  try {
    const event = await db.acquisitionOutreachEvent.create({
      data: {
        contractorAgent: request.contractorAgent,
        prospectType: request.prospectType,
        prospectRef: request.prospectRef,
        channel: request.channel,
        sourceType: request.sourceType,
        sourceRef: request.sourceRef,
        status,
        messageSummary: summarize(request.text),
        doNotContact,
        idempotencyKey: request.idempotencyKey,
      },
    });
    return { status, eventId: event.id, deduplicated: false };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await db.acquisitionOutreachEvent.findUniqueOrThrow({ where: { idempotencyKey: request.idempotencyKey } });
      return { status: existing.status, eventId: existing.id, deduplicated: true };
    }
    throw err;
  }
}

/** The one entrypoint every contractor calls to reach a prospect. Never
 * bypassable: do-not-contact and rate-limit are checked before any adapter
 * is ever touched, and outside ACQUISITION_OUTREACH_MODE=LIVE no real
 * message is ever sent regardless of adapter configuration. */
export async function sendAcquisitionOutreach(request: OutreachRequest): Promise<OutreachOutcome> {
  if (await isDoNotContact(request.prospectType, request.prospectRef)) {
    return writeOutreachEvent(request, "DO_NOT_CONTACT");
  }
  if (await recentlyContacted(request.prospectType, request.prospectRef)) {
    return writeOutreachEvent(request, "RATE_LIMITED");
  }

  const mode = resolveOutreachMode();
  if (mode !== "LIVE") {
    return writeOutreachEvent(request, mode === "SANDBOX" ? "SANDBOX" : "DRY_RUN");
  }

  const adapter = adapterForChannel(request.channel);
  if (!adapter || !adapter.isConfigured()) {
    return writeOutreachEvent(request, "NO_PROVIDER_CONFIGURED");
  }

  try {
    const result = await adapter.send(request.to, request.text);
    return writeOutreachEvent(request, result.delivered ? "SENT" : "FAILED");
  } catch {
    return writeOutreachEvent(request, "FAILED");
  }
}

/** Dispatcher-triggered (or a future verified inbound-reply trigger) marker
 * that a prospect must never be contacted again. Appends rather than
 * mutates — same append-only rule as every other RT AI Workforce log. */
export async function recordOptOut(params: {
  contractorAgent: OutreachRequest["contractorAgent"];
  prospectType: AcquisitionProspectType;
  prospectRef: string;
  channel: OutreachRequest["channel"];
  sourceType: OutreachRequest["sourceType"];
  idempotencyKey: string;
}): Promise<OutreachOutcome> {
  return writeOutreachEvent({ ...params, sourceRef: null, text: "prospect requested no further contact" }, "DO_NOT_CONTACT", true);
}

/** Read-only outreach history for one prospect (dispatcher UI / audit). */
export async function outreachHistoryForProspect(prospectType: AcquisitionProspectType, prospectRef: string) {
  return db.acquisitionOutreachEvent.findMany({
    where: { prospectType, prospectRef },
    orderBy: { createdAt: "desc" },
  });
}

/** Read-only cross-prospect outreach feed for the dispatcher screen. */
export async function recentAcquisitionOutreach(limit = 50) {
  return db.acquisitionOutreachEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
