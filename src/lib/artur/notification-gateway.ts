// NotificationGateway (AGENTS Master Architecture spec s.30): the
// abstraction the rest of Artur calls to deliver a brief/report/alert to
// the Founder. No real channel adapter (Telegram/WhatsApp/email/etc.)
// exists yet in this codebase — spec s.30 explicitly forbids faking
// delivery, so every send here is honestly recorded as FAILED with
// lastError "NO_CHANNEL_CONFIGURED" until a real adapter is wired in.
// The persistence/idempotency/retry-tracking shape is real and final; only
// the "actually reach a human" step is a stub, by design, not by oversight.
import { db } from "@/lib/db";
import type { NotificationDelivery } from "@prisma/client";
import type { AgentContext } from "@/lib/agents/types";
import { emitArturEvent } from "./events";

export interface NotificationChannelAdapter {
  readonly channelName: string;
  send(kind: string, payloadRefId: string): Promise<{ delivered: boolean; error?: string }>;
}

/** No channel adapters are registered — see file header. When a real one
 * (e.g. Telegram) is added, register it here; nothing else in this file
 * needs to change. */
const CHANNEL_ADAPTERS: NotificationChannelAdapter[] = [];

async function deliver(ctx: AgentContext, kind: string, idempotencyKey: string, relation: Partial<Pick<NotificationDelivery, "founderBriefId" | "weeklyReportId" | "emergencyIncidentId">>): Promise<NotificationDelivery> {
  const existing = await db.notificationDelivery.findUnique({ where: { idempotencyKey } });
  if (existing && (existing.status === "DELIVERED" || existing.status === "SENDING")) return existing;

  const delivery =
    existing ??
    (await db.notificationDelivery.create({
      data: { kind, idempotencyKey, status: "PENDING", ...relation },
    }));

  if (CHANNEL_ADAPTERS.length === 0) {
    const updated = await db.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
        lastError: "NO_CHANNEL_CONFIGURED",
      },
    });
    await emitArturEvent(ctx, "NOTIFICATION_DELIVERY_ATTEMPTED", delivery.id, "NotificationDelivery", { kind, status: "FAILED", reason: "NO_CHANNEL_CONFIGURED" });
    return updated;
  }

  let lastError: string | null = null;
  for (const adapter of CHANNEL_ADAPTERS) {
    const result = await adapter.send(kind, delivery.id);
    if (result.delivered) {
      return db.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: "DELIVERED", channel: adapter.channelName, attempts: { increment: 1 }, lastAttemptAt: new Date() },
      });
    }
    lastError = result.error ?? `${adapter.channelName} did not confirm delivery`;
  }

  return db.notificationDelivery.update({
    where: { id: delivery.id },
    data: { status: "FAILED", attempts: { increment: 1 }, lastAttemptAt: new Date(), lastError },
  });
}

export async function sendFounderDailyBrief(ctx: AgentContext, founderBriefId: string): Promise<NotificationDelivery> {
  return deliver(ctx, "FOUNDER_DAILY_BRIEF", `DAILY:${founderBriefId}`, { founderBriefId });
}

export async function sendFounderWeeklyReport(ctx: AgentContext, weeklyReportId: string): Promise<NotificationDelivery> {
  return deliver(ctx, "FOUNDER_WEEKLY_REPORT", `WEEKLY:${weeklyReportId}`, { weeklyReportId });
}

export async function sendFounderEmergencyAlert(ctx: AgentContext, emergencyIncidentId: string): Promise<NotificationDelivery> {
  return deliver(ctx, "FOUNDER_EMERGENCY_ALERT", `EMERGENCY:${emergencyIncidentId}`, { emergencyIncidentId });
}

export async function listRecentNotificationDeliveries(limit = 50): Promise<NotificationDelivery[]> {
  return db.notificationDelivery.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
