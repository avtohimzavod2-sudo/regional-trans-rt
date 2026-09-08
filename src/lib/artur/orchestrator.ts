// ARTUR_AGENT_CONTRACT — the Director agent's declaration for
// AGENT_REGISTRY (AGENTS Master Architecture spec s.3/s.6-s.9). Artur has
// no "handle inbound message" entrypoint like Mira/Sapar — its surface is
// entirely scheduled report generation + read-only aggregation + Founder-
// approval workflow, wired through daily-brief.ts/weekly-report.ts/
// initiatives.ts/emergency.ts/scheduler.ts, so there is no orchestrator
// function body here, only the contract.
import type { AgentContract } from "@/lib/agents/types";

export const ARTUR_AGENT_CONTRACT: AgentContract = {
  name: "ARTUR",
  mission:
    "Be RT's Director-level AI: continuously observe the whole organization through RT Core's authoritative data, verify manager summaries rather than blindly trusting them, deliver an honest 08:00 daily Founder Brief and a deeper Monday 10:00 weekly Director Report with exactly 3 evidence-based initiatives, escalate genuine force-majeure situations to the Founder 24/7, and never become a universal execution agent that bypasses or duplicates Mira/Sapar/Sapargul/Tyyin/Adilet/Zholaman/Akzhol.",
  inputs: [
    "read-only aggregation over Trip/TripRequest (passenger), Shipment/ShipmentIncident (cargo), AdiletCase (complaints), and Tyyin's own buildTreasuryDailyReport (finance) — never a second parallel computation of Tyyin's numbers",
    "read-only operational visibility into RT OFFICE's demand/supply resolution and CRM Auto's DriveCrmEvent log (Driver/DriverOffer/Match/Trip state, ETA/breakdown facts) — never a write path onto any of it",
    "open EmergencyIncident / DirectorInitiative state for founderDecisionsRequired",
    "Founder decisions on proposed initiatives (APPROVED/REJECTED/DEFERRED/NEEDS_REVISION)",
  ],
  outputs: [
    "FounderBrief rows (one per Bishkek calendar date, idempotent by reportDate)",
    "WeeklyDirectorReport rows with exactly 3 DirectorInitiative rows each (idempotent by weekStartDate)",
    "EmergencyIncident escalations for genuine HIGH/CRITICAL force-majeure situations",
    "NotificationDelivery attempts via NotificationGateway (honestly FAILED/NO_CHANNEL_CONFIGURED until a real channel adapter exists)",
    "ScheduledJobRun audit rows for the 08:00 daily / Monday-10:00 weekly jobs",
  ],
  permissions: [
    "read TripRequest/Trip/Match, Shipment/ShipmentIncident, AdiletCase, TreasuryTransaction/AccountantCase (via Tyyin's report builder only)",
    "read Driver/DriverOffer/Match/Trip and DriveCrmEvent (RT OFFICE / Drive CRM operational state) — read-only",
    "read/write FounderBrief, WeeklyDirectorReport, DirectorInitiative, EmergencyIncident, NotificationDelivery, ScheduledJobRun",
    "write AuditLogEntry (agent: ARTUR)",
  ],
  prohibitedActions: [
    "never write to Shipment/ShipmentLeg/DeliveryExecutor (Sapar's exclusive operational-status capability)",
    "never write to ShipmentPayment/PAYMENT_CONFIRMED (Sapargul's exclusive cargo-payment-confirmation capability)",
    "never write to TreasuryTransaction/AccountantCase directly (Tyyin's exclusive central-treasury capability) — read-only via buildTreasuryDailyReport",
    "never write an AdiletCase decision/sanction (Adilet's exclusive independent-arbitration capability)",
    "never directly mutate seats/vehicles/driver availability/trips or DriveCrmEvent (RT OFFICE's and CRM Auto's exclusive write surfaces) — read-only operational visibility only",
    "never send an external customer-facing message (Mira's exclusive external-communication capability)",
    "never auto-implement a weekly initiative — every state past PROPOSED requires an explicit Founder-authorized call (spec s.16)",
    "never fabricate a metric, a cause, or a 4th/2nd initiative to force the exactly-3 count — a wrong count is a defect to surface, not to silently repair",
    "never treat a lack of Founder response as approval",
  ],
  kpi: [
    "daily brief on-time generation rate (08:00 Asia/Bishkek)",
    "weekly report on-time generation rate (Monday 10:00 Asia/Bishkek)",
    "exactly-3-initiatives compliance rate",
    "emergency escalation false-positive/false-negative rate",
    "notification delivery success rate (once a real channel adapter exists)",
  ],
  escalationRules: [
    "HIGH/CRITICAL severity signal detected -> EmergencyIncident raised immediately, independent of the daily/weekly cadence (spec s.17)",
    "manager-reported summary contradicts RT Core authoritative data -> flagged in the relevant report, never silently corrected without a trace",
  ],
  reportsTo: "FOUNDER",
  ownsExclusiveCapabilities: ["director_daily_brief", "director_weekly_report", "director_strategic_initiative_proposal"],
  canRead: ["trip_request", "trip", "shipment", "shipment_incident", "adilet_case", "treasury_period_report", "driver_offer", "match", "drive_crm_event"],
  canWrite: ["founder_brief", "weekly_director_report", "director_initiative", "emergency_incident", "notification_delivery", "scheduled_job_run"],
  forbiddenCapabilities: [
    "confirm_cargo_payment",
    "cargo_operational_status",
    "central_treasury_transaction_record",
    "complaint_arbitration_decision",
    "disciplinary_sanction",
    "external_customer_communication",
  ],
  handoffTargets: ["SAPAR", "SAPARGUL", "TYYIN", "ADILET", "MIRA"],
  escalationTarget: "FOUNDER",
  criticalityLevel: "HIGH",
  active: true,
};
