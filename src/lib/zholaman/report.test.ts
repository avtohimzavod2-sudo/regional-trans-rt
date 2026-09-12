import { describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeTables } from "@/lib/management/__fixtures__/fake-prisma";

// Same approach as src/lib/akzhol/report.test.ts: an in-memory Prisma fake that
// really evaluates the WHERE clauses, because the clauses are the report.
//
// The table list is the complete read surface of the cargo-direction report —
// the fake throws on any model it was not given. Note what is absent:
// TreasuryTransaction, LedgerEntry and every amount column. shipmentPayment
// appears, but only ever through its coarse status (spec s.21).
const tables: FakeTables = {
  shipment: [],
  shipmentLeg: [],
  deliveryExecutor: [],
  partner: [],
  shipmentIncident: [],
  adiletCase: [],
  adiletEvidence: [],
  shipmentPayment: [],
};

vi.mock("@/lib/db", () => ({
  db: createFakeDb(tables, {
    shipmentPayment: { shipment: { table: "shipment", localKey: "shipmentId" } },
    adiletEvidence: { case: { table: "adiletCase", localKey: "caseId" } },
  }),
}));

const { buildDeliveryCargoDirectionReport } = await import("./report");

const at = (iso: string) => new Date(iso);
/** The Bishkek-local week of 2026-09-01; the builder derives the comparison
 * window as the equally long span immediately before it. */
const PERIOD = { from: at("2026-09-01T00:00:00+06:00"), to: at("2026-09-08T00:00:00+06:00") };
/** Inside the preceding comparison window. */
const PREVIOUS = at("2026-08-26T12:00:00+06:00");
/** Before both windows. */
const OLD = at("2026-08-10T12:00:00+06:00");

function loadTables(next: Partial<FakeTables>) {
  for (const key of Object.keys(tables)) tables[key] = next[key] ?? [];
}

function loadPopulatedWeek() {
  loadTables({
    shipment: [
      { id: "sh1", createdAt: at("2026-09-01T08:00:00+06:00"), status: "DELIVERED", completedAt: at("2026-09-02T08:00:00+06:00"), deliveryDeadline: at("2026-09-03T08:00:00+06:00"), assignedExecutorId: "ex1" },
      // Delivered after its deadline.
      { id: "sh2", createdAt: at("2026-09-02T08:00:00+06:00"), status: "DELIVERED", completedAt: at("2026-09-02T20:00:00+06:00"), deliveryDeadline: at("2026-09-02T10:00:00+06:00"), assignedExecutorId: "ex1" },
      // Delivered, but carried no deadline: cannot be judged late or on time.
      { id: "sh3", createdAt: at("2026-09-03T08:00:00+06:00"), status: "DELIVERED", completedAt: at("2026-09-03T14:00:00+06:00"), deliveryDeadline: null, assignedExecutorId: "ex2" },
      { id: "sh4", createdAt: at("2026-09-04T08:00:00+06:00"), status: "FAILED", completedAt: null, deliveryDeadline: null, assignedExecutorId: "ex2" },
      { id: "sh5", createdAt: at("2026-09-05T08:00:00+06:00"), status: "CANCELLED", completedAt: null, deliveryDeadline: null, assignedExecutorId: null },
      { id: "sh6", createdAt: at("2026-09-06T08:00:00+06:00"), status: "DISPUTED", completedAt: null, deliveryDeadline: null, assignedExecutorId: "ex1" },
      { id: "sh7", createdAt: at("2026-09-07T08:00:00+06:00"), status: "IN_TRANSIT", completedAt: null, deliveryDeadline: null, assignedExecutorId: "ex1" },
      // Completed before it was created: a data fault, not a six-minute delivery.
      { id: "sh8", createdAt: at("2026-09-05T10:00:00+06:00"), status: "DELIVERED", completedAt: at("2026-09-05T09:00:00+06:00"), deliveryDeadline: null, assignedExecutorId: "ex3" },
      // Assigned to an executor with no registry row.
      { id: "sh12", createdAt: at("2026-09-06T09:00:00+06:00"), status: "CONFIRMED", completedAt: null, deliveryDeadline: null, assignedExecutorId: "ex_ghost" },
      // Comparison window.
      { id: "sh9", createdAt: PREVIOUS, status: "DELIVERED", completedAt: PREVIOUS, deliveryDeadline: null, assignedExecutorId: "ex1" },
      { id: "sh10", createdAt: at("2026-08-27T12:00:00+06:00"), status: "FAILED", completedAt: null, deliveryDeadline: null, assignedExecutorId: "ex1" },
      { id: "sh11", createdAt: at("2026-08-28T12:00:00+06:00"), status: "DRAFT", completedAt: null, deliveryDeadline: null, assignedExecutorId: null },
    ],
    shipmentLeg: [
      { id: "l1", createdAt: at("2026-09-01T09:00:00+06:00"), status: "COMPLETED" },
      { id: "l2", createdAt: at("2026-09-02T09:00:00+06:00"), status: "COMPLETED" },
      { id: "l3", createdAt: at("2026-09-04T09:00:00+06:00"), status: "FAILED" },
      { id: "l4", createdAt: at("2026-09-07T09:00:00+06:00"), status: "PLANNED" },
      { id: "l5", createdAt: OLD, status: "COMPLETED" },
    ],
    deliveryExecutor: [
      { id: "ex1", name: "Партнёр А", source: "DIRECT_RT_PARTNER", status: "ACTIVE", verificationStatus: "VERIFIED", reliabilityScore: 0.9, complaintsCount: 1 },
      // Active and taking work while still unverified.
      { id: "ex2", name: "Группа Б", source: "GROUP", status: "ACTIVE", verificationStatus: "UNVERIFIED", reliabilityScore: null, complaintsCount: 0 },
      { id: "ex3", name: "Курьер В", source: "RT_COURIER", status: "SUSPENDED", verificationStatus: "PROVISIONAL", reliabilityScore: 0.4, complaintsCount: 3 },
      { id: "ex4", name: "Исключённый Г", source: "OTHER", status: "BLOCKED", verificationStatus: "UNVERIFIED", reliabilityScore: null, complaintsCount: 5 },
    ],
    partner: [
      { id: "p1", isActive: true },
      { id: "p2", isActive: true },
      { id: "p3", isActive: false },
    ],
    shipmentIncident: [
      { id: "i1", createdAt: at("2026-09-01T10:00:00+06:00"), resolvedAt: at("2026-09-01T18:00:00+06:00"), severity: "LOW", status: "RESOLVED", type: "DELAY" },
      { id: "i2", createdAt: at("2026-09-02T10:00:00+06:00"), resolvedAt: null, severity: "HIGH", status: "OPEN", type: "DELAY" },
      { id: "i3", createdAt: at("2026-09-03T10:00:00+06:00"), resolvedAt: null, severity: "CRITICAL", status: "ESCALATED", type: "LOST" },
      { id: "i4", createdAt: at("2026-09-04T10:00:00+06:00"), resolvedAt: null, severity: "MEDIUM", status: "IN_PROGRESS", type: "DAMAGE" },
      // Opened before the period and still critical: counted as open now.
      { id: "i5", createdAt: OLD, resolvedAt: null, severity: "CRITICAL", status: "OPEN", type: "LOST" },
      // Opened earlier, resolved during the period.
      { id: "i6", createdAt: OLD, resolvedAt: at("2026-09-05T10:00:00+06:00"), severity: "LOW", status: "RESOLVED", type: "DELAY" },
    ],
    adiletCase: [
      { id: "ac1", openedAt: at("2026-09-02T14:00:00+06:00"), resolvedAt: null, shipmentId: "sh1", tripId: null, severity: "NORMAL", status: "OPEN" },
      { id: "ac2", openedAt: OLD, resolvedAt: null, shipmentId: "sh9", tripId: null, severity: "CRITICAL", status: "UNDER_REVIEW" },
      { id: "ac3", openedAt: OLD, resolvedAt: at("2026-09-03T14:00:00+06:00"), shipmentId: "sh2", tripId: null, severity: "NORMAL", status: "CLOSED" },
      // A passenger complaint: Akzhol's, not Zholaman's.
      { id: "ac4", openedAt: at("2026-09-04T14:00:00+06:00"), resolvedAt: null, shipmentId: null, tripId: "t1", severity: "CRITICAL", status: "OPEN" },
    ],
    adiletEvidence: [
      { id: "ev1", createdAt: at("2026-09-02T15:00:00+06:00"), type: "CUSTOMER_FEEDBACK", caseId: "ac1" },
      // Customer feedback on a passenger case: not the cargo direction's.
      { id: "ev2", createdAt: at("2026-09-04T15:00:00+06:00"), type: "CUSTOMER_FEEDBACK", caseId: "ac4" },
      { id: "ev3", createdAt: at("2026-09-02T16:00:00+06:00"), type: "MESSAGE", caseId: "ac1" },
    ],
    shipmentPayment: [
      { id: "pay1", shipmentId: "sh1", status: "PAYMENT_CONFIRMED" },
      // A refund after a confirmed payment still reads as PAID (spec s.22).
      { id: "pay2", shipmentId: "sh2", status: "REFUND_PENDING" },
      { id: "pay3", shipmentId: "sh3", status: "PAYMENT_REQUIRED" },
      { id: "pay4", shipmentId: "sh4", status: "PAYMENT_MISMATCH" },
      // Belongs to a shipment from the comparison window.
      { id: "pay5", shipmentId: "sh9", status: "PAYMENT_CONFIRMED" },
    ],
  });
}

describe("buildDeliveryCargoDirectionReport", () => {
  it("counts order outcomes without folding in-flight work into success or failure", async () => {
    loadPopulatedWeek();
    const report = await buildDeliveryCargoDirectionReport(PERIOD);

    expect(report.periodFrom).toBe("2026-09-01");
    expect(report.orders).toEqual({
      created: 9,
      confirmed: 6,
      delivered: 4,
      failed: 1,
      cancelled: 1,
      disputed: 1,
      inFlightAtPeriodEnd: 2,
      deliveryRate: 4 / 9,
      failureRate: 1 / 9,
    });
    expect(report.missingDataNotes.some((note) => note.includes("must not be added to the other status counts"))).toBe(true);
  });

  it("measures duration only where the timestamps are coherent, and lateness only where a deadline existed", async () => {
    loadPopulatedWeek();
    const report = await buildDeliveryCargoDirectionReport(PERIOD);

    // 24h, 12h and 6h; sh8's negative duration is excluded.
    expect(report.execution.medianHoursCreatedToDelivered).toBe(12);
    expect(report.execution.p90HoursCreatedToDelivered).toBeCloseTo(21.6, 10);
    expect(report.execution.deadlinesObserved).toBe(2);
    expect(report.execution.deliveredLate).toBe(1);
    expect(report.execution.latenessRate).toBe(0.5);
    expect(report.execution).toMatchObject({ legsPlanned: 4, legsCompleted: 2, legsFailed: 1 });
    expect(report.missingDataNotes.some((note) => note.includes("completedAt before createdAt"))).toBe(true);
    expect(report.missingDataNotes.some((note) => note.includes("carried no deliveryDeadline"))).toBe(true);
  });

  it("reports the executor roster by trust tier, not only by activity", async () => {
    loadPopulatedWeek();
    const report = await buildDeliveryCargoDirectionReport(PERIOD);

    expect(report.partners).toMatchObject({
      activeExecutors: 2,
      suspendedOrBlockedExecutors: 2,
      verifiedExecutors: 1,
      provisionalExecutors: 1,
      unverifiedExecutors: 2,
      activePartners: 2,
    });
  });

  it("shows an executor with no registry row rather than dropping its orders", async () => {
    loadPopulatedWeek();
    const report = await buildDeliveryCargoDirectionReport(PERIOD);

    expect(report.partners.topExecutors[0]).toEqual({
      executorId: "ex1",
      name: "Партнёр А",
      source: "DIRECT_RT_PARTNER",
      verificationStatus: "VERIFIED",
      status: "ACTIVE",
      ordersInPeriod: 4,
      reliabilityScore: 0.9,
      lifetimeComplaints: 1,
    });

    const ghost = report.partners.topExecutors.find((row) => row.executorId === "ex_ghost");
    expect(ghost).toMatchObject({ name: "(executor record not found)", source: "UNKNOWN", verificationStatus: "UNKNOWN", status: "UNKNOWN", ordersInPeriod: 1, reliabilityScore: null });
  });

  it("computes concentration over assigned work only, and says so", async () => {
    loadPopulatedWeek();
    const report = await buildDeliveryCargoDirectionReport(PERIOD);

    // 4 of the 8 assigned orders — sh5 had no executor at all.
    expect(report.partners.topExecutorShare).toBe(0.5);
    expect(report.missingDataNotes.some((note) => note.includes("had no assigned executor"))).toBe(true);
  });

  it("keeps an old unresolved incident current and separates opened from resolved", async () => {
    loadPopulatedWeek();
    const report = await buildDeliveryCargoDirectionReport(PERIOD);

    expect(report.incidents).toMatchObject({
      opened: 4,
      resolved: 2,
      openOrEscalatedAtPeriodEnd: 3,
      criticalOpenAtPeriodEnd: 2,
      bySeverity: { LOW: 1, MEDIUM: 1, HIGH: 1, CRITICAL: 1 },
      incidentRatePerOrder: 4 / 9,
    });
    expect(report.incidents.topTypes).toEqual([
      { type: "DELAY", count: 2 },
      { type: "DAMAGE", count: 1 },
      { type: "LOST", count: 1 },
    ]);
  });

  // RT has no review/rating model. The gap is reported under its real name
  // instead of being filled with a plausible-looking satisfaction number.
  it("counts only cargo complaints and reports the absence of a review system", async () => {
    loadPopulatedWeek();
    const report = await buildDeliveryCargoDirectionReport(PERIOD);

    expect(report.quality).toEqual({
      complaintsOpened: 1,
      complaintsResolved: 1,
      criticalComplaintsOpen: 1,
      customerFeedbackEvidenceItems: 1,
      reviewSystemAvailable: false,
    });
    expect(report.missingDataNotes.some((note) => note.includes("no customer-review, rating or NPS model"))).toBe(true);
  });

  it("compares against the immediately preceding span of equal length", async () => {
    loadPopulatedWeek();
    const report = await buildDeliveryCargoDirectionReport(PERIOD);

    expect(report.commercial.comparedToPeriodFrom).toBe("2026-08-25");
    expect(report.commercial.comparedToPeriodTo).toBe("2026-09-01");
    expect(report.commercial.ordersChange).toEqual({ currentWeek: 9, previousWeek: 3, absoluteChange: 6, percentageChange: 200, status: "GROWTH" });
    expect(report.commercial.deliveredChange).toMatchObject({ currentWeek: 4, previousWeek: 1, status: "GROWTH" });
    expect(report.commercial.failedChange).toMatchObject({ currentWeek: 1, previousWeek: 1, absoluteChange: 0, status: "STABLE" });
  });

  // Spec s.21: the coarse collapse is the whole of Zholaman's payment view, and
  // REFUND_* after a confirmed payment still counts as paid.
  it("reports payment posture as coarse counts only, over the orders that have a payment record", async () => {
    loadPopulatedWeek();
    const report = await buildDeliveryCargoDirectionReport(PERIOD);

    expect(report.commercial).toMatchObject({
      paymentPaid: 2,
      paymentPending: 1,
      paymentProblem: 1,
      paymentProblemRate: 0.25,
    });
    expect(report.missingDataNotes.some((note) => note.includes("no ShipmentPayment record at all"))).toBe(true);
    // Counts only: no money field reaches the commercial section under any key.
    expect(Object.keys(report.commercial).filter((key) => /som|amount|fare|revenue/i.test(key))).toEqual([]);
  });

  it("emits exactly the anomalies the measurements support", async () => {
    loadPopulatedWeek();
    const report = await buildDeliveryCargoDirectionReport(PERIOD);

    expect(report.anomalies.map((a) => a.code)).toEqual([
      "HIGH_CARGO_FAILURE_RATE",
      "HIGH_CARGO_LATENESS_RATE",
      "HIGH_INCIDENT_RATE",
      "OPEN_CRITICAL_INCIDENTS",
      "OPEN_CRITICAL_COMPLAINTS",
      "UNVERIFIED_EXECUTORS_ACTIVE",
      "HIGH_PAYMENT_PROBLEM_RATE",
    ]);
    // A 50% share is exactly the threshold, and the threshold is acceptable.
    expect(report.anomalies.map((a) => a.code)).not.toContain("EXECUTOR_CONCENTRATION_RISK");
  });

  it("reports an empty period as null rates with no anomalies at all", async () => {
    loadTables({});
    const report = await buildDeliveryCargoDirectionReport(PERIOD);

    expect(report.orders).toMatchObject({ created: 0, delivered: 0, deliveryRate: null, failureRate: null });
    expect(report.execution.medianHoursCreatedToDelivered).toBeNull();
    expect(report.execution.latenessRate).toBeNull();
    expect(report.partners.topExecutors).toEqual([]);
    expect(report.partners.topExecutorShare).toBeNull();
    expect(report.incidents.incidentRatePerOrder).toBeNull();
    expect(report.commercial.paymentProblemRate).toBeNull();
    expect(report.commercial.ordersChange).toEqual({ currentWeek: 0, previousWeek: 0, absoluteChange: 0, percentageChange: null, status: "STABLE" });
    expect(report.anomalies).toEqual([]);
  });
});
