"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { rootContext } from "@/lib/agents/trace";
import { logAction } from "@/lib/audit";
import { generateDailyFounderBrief } from "@/lib/artur/daily-brief";
import { generateWeeklyDirectorReport } from "@/lib/artur/weekly-report";
import { recordFounderInitiativeDecision } from "@/lib/artur/initiatives";
import { raiseEmergencyIncident, acknowledgeEmergencyIncident, resolveEmergencyIncident } from "@/lib/artur/emergency";
import type { FounderDecision } from "@/lib/artur/types";

async function currentDispatcher() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);
  if (!session) throw new Error("Not authenticated");
  return session;
}

// Manual "generate now" — same idempotent generator the 08:00 cron calls, so
// clicking this twice for the same Bishkek date returns the existing brief
// rather than creating a second one (spec s.22).
export async function generateDailyBriefNowAction() {
  const dispatcher = await currentDispatcher();
  const brief = await generateDailyFounderBrief(rootContext(), dispatcher.role, dispatcher.username);

  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.artur_daily_brief_generated",
    entityType: "FounderBrief",
    entityId: brief.id,
    details: { reportDate: brief.reportDate },
  });
  revalidatePath("/dispatcher/artur");
}

export async function generateWeeklyReportNowAction() {
  const dispatcher = await currentDispatcher();
  const report = await generateWeeklyDirectorReport(rootContext(), dispatcher.role, dispatcher.username);

  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.artur_weekly_report_generated",
    entityType: "WeeklyDirectorReport",
    entityId: report.id,
    details: { weekStartDate: report.weekStartDate },
  });
  revalidatePath("/dispatcher/artur");
}

// Founder Approval Workflow (spec s.16) — recordFounderInitiativeDecision
// re-checks the Founder role and the state-machine transition itself; this
// action never interprets anything beyond an explicit form submission as a
// decision.
export async function decideInitiativeAction(initiativeId: string, formData: FormData) {
  const dispatcher = await currentDispatcher();
  const status = String(formData.get("status") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (status !== "APPROVED" && status !== "REJECTED" && status !== "DEFERRED" && status !== "NEEDS_REVISION") {
    throw new Error("status must be one of APPROVED, REJECTED, DEFERRED, NEEDS_REVISION");
  }
  const decision: FounderDecision = { initiativeId, status: status as FounderDecision["status"], note };

  const updated = await recordFounderInitiativeDecision(rootContext(), dispatcher.role, dispatcher.username, initiativeId, decision);

  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.artur_initiative_decision",
    entityType: "DirectorInitiative",
    entityId: initiativeId,
    details: { status: updated.status, note },
  });
  revalidatePath("/dispatcher/artur");
}

// Open to any authenticated dispatcher, not just the Founder role — a
// genuine 24/7 force-majeure escalation (spec s.17/s.18) must not be
// blocked on whoever happens to be logged in with the Founder account.
// raiseEmergencyIncident itself rejects anything below HIGH/CRITICAL.
export async function reportEmergencyAction(formData: FormData) {
  const dispatcher = await currentDispatcher();
  const whatHappened = String(formData.get("whatHappened") ?? "").trim();
  const currentStatus = String(formData.get("currentStatus") ?? "").trim();
  const severityRaw = String(formData.get("severity") ?? "").trim();
  const peopleOrdersMoneyAffected = String(formData.get("peopleOrdersMoneyAffected") ?? "").trim();
  const actionsTaken = String(formData.get("actionsTaken") ?? "").trim();
  const immediateRisks = String(formData.get("immediateRisks") ?? "").trim();
  const availableOptions = String(formData.get("availableOptions") ?? "").trim();
  const recommendation = String(formData.get("recommendation") ?? "").trim();
  const decisionRequired = String(formData.get("decisionRequired") ?? "").trim();

  if (!whatHappened || !currentStatus || (severityRaw !== "HIGH" && severityRaw !== "CRITICAL")) {
    throw new Error("whatHappened, currentStatus, and a HIGH/CRITICAL severity are required");
  }
  const severity = severityRaw as "HIGH" | "CRITICAL";

  const incident = await raiseEmergencyIncident(rootContext(), {
    source: null,
    escalation: {
      whatHappened,
      currentStatus,
      severity,
      peopleOrdersMoneyAffected,
      actionsTaken,
      immediateRisks,
      availableOptions,
      recommendation,
      decisionRequired,
      decisionDeadline: null,
    },
  });

  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.artur_emergency_reported",
    entityType: "EmergencyIncident",
    entityId: incident.id,
    details: { severity: severityRaw },
  });
  revalidatePath("/dispatcher/artur");
}

export async function acknowledgeEmergencyAction(incidentId: string) {
  const dispatcher = await currentDispatcher();
  await acknowledgeEmergencyIncident(rootContext(), dispatcher.role, dispatcher.username, incidentId);

  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.artur_emergency_acknowledged",
    entityType: "EmergencyIncident",
    entityId: incidentId,
  });
  revalidatePath("/dispatcher/artur");
}

export async function resolveEmergencyAction(incidentId: string, formData: FormData) {
  const dispatcher = await currentDispatcher();
  const founderResponse = String(formData.get("founderResponse") ?? "").trim();
  if (!founderResponse) throw new Error("founderResponse is required");

  await resolveEmergencyIncident(rootContext(), dispatcher.role, dispatcher.username, incidentId, founderResponse);

  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.artur_emergency_resolved",
    entityType: "EmergencyIncident",
    entityId: incidentId,
  });
  revalidatePath("/dispatcher/artur");
}
