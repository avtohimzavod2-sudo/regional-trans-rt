import { describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeTables } from "@/lib/management/__fixtures__/fake-prisma";

// The report is one big set of WHERE clauses, so it is tested against an
// in-memory Prisma fake that actually evaluates filters (see the fixture's
// header). A mock returning fixed counts would pass regardless of which
// records the builder selected, which is the only thing worth checking here.
//
// The fake throws on any model it was not handed, so the table list below is
// also an assertion: it is the complete read surface of the passenger-direction
// report. No money model appears in it, and if one were ever added to the
// builder this test would fail by name rather than silently return zeroes.
const tables: FakeTables = {
  passengerProspect: [],
  acquisitionOutreachEvent: [],
  tripRequest: [],
  stop: [],
  match: [],
  trip: [],
  passengerLoopRun: [],
  supportCase: [],
  adiletCase: [],
};

vi.mock("@/lib/db", () => ({ db: createFakeDb(tables) }));

const { buildPassengerDirectionReport } = await import("./report");
const { NO_REASON_RECORDED } = await import("./types");

/** Bishkek is UTC+6, so the offsets are written out and the period below is
 * exactly the Bishkek-local week of 2026-09-01. */
const at = (iso: string) => new Date(iso);
const PERIOD = { from: at("2026-09-01T00:00:00+06:00"), to: at("2026-09-08T00:00:00+06:00") };
const BEFORE = at("2026-08-20T12:00:00+06:00");

function loadTables(next: Partial<FakeTables>) {
  for (const key of Object.keys(tables)) tables[key] = next[key] ?? [];
}

/** A week with activity in every section, plus one deliberate data fault in
 * each place the builder is supposed to notice one. */
function loadPopulatedWeek() {
  loadTables({
    passengerProspect: [
      { id: "pp1", createdAt: at("2026-09-01T09:00:00+06:00"), status: "CONVERTED" },
      { id: "pp2", createdAt: at("2026-09-02T09:00:00+06:00"), status: "CONTACTED" },
      { id: "pp3", createdAt: at("2026-09-03T09:00:00+06:00"), status: "NEW" },
      // Outside the period: must not inflate this week's funnel.
      { id: "pp4", createdAt: BEFORE, status: "CONVERTED" },
    ],
    acquisitionOutreachEvent: [
      { id: "oe1", createdAt: at("2026-09-01T10:00:00+06:00"), prospectType: "PASSENGER", status: "SENT" },
      // A DRY_RUN never reached a person (§32). It counts as an attempt only.
      { id: "oe2", createdAt: at("2026-09-01T10:05:00+06:00"), prospectType: "PASSENGER", status: "DRY_RUN" },
      // Another direction's outreach: not Akzhol's.
      { id: "oe3", createdAt: at("2026-09-01T10:10:00+06:00"), prospectType: "DRIVER", status: "SENT" },
    ],
    tripRequest: [
      { id: "tr1", createdAt: at("2026-09-01T08:00:00+06:00"), originStopId: "s1", destinationStopId: "s2", seats: 2 },
      { id: "tr2", createdAt: at("2026-09-02T08:00:00+06:00"), originStopId: "s1", destinationStopId: "s2", seats: 1 },
      { id: "tr3", createdAt: at("2026-09-03T08:00:00+06:00"), originStopId: "s2", destinationStopId: "s1", seats: 3 },
      // Origin stop has no Stop row — the direction must still be listed.
      { id: "tr4", createdAt: at("2026-09-04T08:00:00+06:00"), originStopId: "s_deleted", destinationStopId: "s2", seats: 1 },
      { id: "tr5", createdAt: BEFORE, originStopId: "s1", destinationStopId: "s2", seats: 9 },
    ],
    stop: [
      { id: "s1", nameRu: "Бишкек" },
      { id: "s2", nameRu: "Ош" },
    ],
    match: [
      {
        id: "m1",
        createdAt: at("2026-09-01T09:00:00+06:00"),
        status: "CONFIRMED",
        declineReason: null,
        proposedToPassengerAt: at("2026-09-01T09:00:00+06:00"),
        passengerRespondedAt: at("2026-09-01T09:10:00+06:00"),
        proposedToDriverAt: at("2026-09-01T08:50:00+06:00"),
        driverRespondedAt: at("2026-09-01T08:55:00+06:00"),
      },
      {
        id: "m2",
        createdAt: at("2026-09-02T09:00:00+06:00"),
        status: "DECLINED_BY_PASSENGER",
        declineReason: "Дорого",
        proposedToPassengerAt: at("2026-09-02T09:00:00+06:00"),
        passengerRespondedAt: at("2026-09-02T09:40:00+06:00"),
        proposedToDriverAt: null,
        driverRespondedAt: null,
      },
      {
        id: "m3",
        createdAt: at("2026-09-02T11:00:00+06:00"),
        status: "DECLINED_BY_PASSENGER",
        // No reason recorded: must not be attributed to a guessed cause.
        declineReason: "   ",
        proposedToPassengerAt: at("2026-09-02T11:00:00+06:00"),
        passengerRespondedAt: at("2026-09-02T11:20:00+06:00"),
        proposedToDriverAt: null,
        driverRespondedAt: null,
      },
      {
        id: "m4",
        createdAt: at("2026-09-03T09:00:00+06:00"),
        status: "DECLINED_BY_DRIVER",
        declineReason: "Занят",
        proposedToPassengerAt: null,
        passengerRespondedAt: null,
        proposedToDriverAt: at("2026-09-03T09:00:00+06:00"),
        driverRespondedAt: at("2026-09-03T09:15:00+06:00"),
      },
      {
        id: "m5",
        createdAt: at("2026-09-04T09:00:00+06:00"),
        status: "EXPIRED",
        declineReason: null,
        proposedToPassengerAt: at("2026-09-04T09:00:00+06:00"),
        passengerRespondedAt: null,
        proposedToDriverAt: null,
        driverRespondedAt: null,
      },
      {
        id: "m6",
        createdAt: at("2026-09-04T10:00:00+06:00"),
        status: "CANCELLED",
        declineReason: null,
        proposedToPassengerAt: null,
        passengerRespondedAt: null,
        proposedToDriverAt: null,
        driverRespondedAt: null,
      },
      {
        id: "m7",
        createdAt: at("2026-09-05T09:00:00+06:00"),
        status: "DECLINED_BY_PASSENGER",
        declineReason: "Дорого",
        proposedToPassengerAt: at("2026-09-05T09:00:00+06:00"),
        passengerRespondedAt: at("2026-09-05T09:02:00+06:00"),
        proposedToDriverAt: null,
        driverRespondedAt: null,
      },
      {
        // Responded BEFORE being asked: a data fault, not fast service.
        id: "m8",
        createdAt: at("2026-09-06T09:00:00+06:00"),
        status: "AWAITING_PASSENGER",
        declineReason: null,
        proposedToPassengerAt: at("2026-09-06T09:00:00+06:00"),
        passengerRespondedAt: at("2026-09-06T08:00:00+06:00"),
        proposedToDriverAt: null,
        driverRespondedAt: null,
      },
      {
        // Created before the period: excluded, whatever it became later.
        id: "m9",
        createdAt: BEFORE,
        status: "CONFIRMED",
        declineReason: null,
        proposedToPassengerAt: BEFORE,
        passengerRespondedAt: BEFORE,
        proposedToDriverAt: null,
        driverRespondedAt: null,
      },
    ],
    trip: [
      { id: "t1", createdAt: at("2026-09-01T12:00:00+06:00"), status: "COMPLETED" },
      { id: "t2", createdAt: at("2026-09-02T12:00:00+06:00"), status: "COMPLETED" },
      { id: "t3", createdAt: at("2026-09-03T12:00:00+06:00"), status: "CANCELLED" },
      { id: "t4", createdAt: at("2026-09-04T12:00:00+06:00"), status: "NO_SHOW" },
      { id: "t5", createdAt: BEFORE, status: "COMPLETED" },
    ],
    passengerLoopRun: [
      { id: "lr1", createdAt: at("2026-09-01T07:00:00+06:00"), status: "OFFER_SENT" },
      { id: "lr2", createdAt: at("2026-09-02T07:00:00+06:00"), status: "NO_SUPPLY" },
      { id: "lr3", createdAt: at("2026-09-03T07:00:00+06:00"), status: "NO_SUPPLY" },
      { id: "lr4", createdAt: at("2026-09-04T07:00:00+06:00"), status: "PASSENGER_ACCEPTED" },
    ],
    supportCase: [
      { id: "sc1", createdAt: at("2026-09-02T13:00:00+06:00") },
      { id: "sc2", createdAt: at("2026-09-05T13:00:00+06:00") },
      { id: "sc3", createdAt: BEFORE },
    ],
    adiletCase: [
      { id: "ac1", openedAt: at("2026-09-02T14:00:00+06:00"), tripId: "t1", shipmentId: null, severity: "NORMAL", status: "OPEN" },
      // Opened three weeks ago and still open: this period's problem too.
      { id: "ac2", openedAt: BEFORE, tripId: "t_old", shipmentId: null, severity: "CRITICAL", status: "UNDER_REVIEW" },
      // Neither trip nor shipment: cannot be attributed to either direction.
      { id: "ac3", openedAt: at("2026-09-03T14:00:00+06:00"), tripId: null, shipmentId: null, severity: "NORMAL", status: "OPEN" },
      // Cargo: Zholaman's, and must not appear in passenger counts.
      { id: "ac4", openedAt: at("2026-09-04T14:00:00+06:00"), tripId: null, shipmentId: "sh1", severity: "CRITICAL", status: "OPEN" },
    ],
  });
}

describe("buildPassengerDirectionReport", () => {
  it("aggregates the acquisition funnel and never counts a non-send as delivered", async () => {
    loadPopulatedWeek();
    const report = await buildPassengerDirectionReport(PERIOD);

    expect(report.periodFrom).toBe("2026-09-01");
    expect(report.leads).toEqual({
      newProspects: 3,
      contactedProspects: 2,
      convertedProspects: 1,
      outreachAttempts: 2,
      outreachActuallySent: 1,
      conversionRate: 1 / 3,
    });
    expect(report.missingDataNotes.some((note) => note.includes("were not real sends"))).toBe(true);
  });

  it("reports demand and the busiest directions, showing an unresolvable stop as its id", async () => {
    loadPopulatedWeek();
    const report = await buildPassengerDirectionReport(PERIOD);

    expect(report.demand).toEqual({ requests: 4, seatsRequested: 7 });
    // The two one-request rows are tied, and the tie is broken by code unit
    // (compareStable), not by locale — so "s_deleted" precedes "Ош" and does so
    // identically on a Windows workstation and on Linux CI.
    expect(report.directions).toEqual([
      { direction: "Бишкек → Ош", originStopId: "s1", destinationStopId: "s2", requests: 2 },
      { direction: "s_deleted → Ош", originStopId: "s_deleted", destinationStopId: "s2", requests: 1 },
      { direction: "Ош → Бишкек", originStopId: "s2", destinationStopId: "s1", requests: 1 },
    ]);
  });

  it("scopes matches by creation and computes both sides' decline rates", async () => {
    loadPopulatedWeek();
    const report = await buildPassengerDirectionReport(PERIOD);

    // m1,m2,m3,m5,m7,m8 were proposed to a passenger; m9 is outside the period.
    expect(report.bookings).toEqual({ matchesProposedToPassenger: 6, confirmed: 1, confirmationRate: 1 / 6 });
    expect(report.declines.byPassenger).toBe(3);
    expect(report.declines.byDriver).toBe(1);
    expect(report.declines.expired).toBe(1);
    expect(report.declines.cancelled).toBe(1);
    expect(report.declines.passengerDeclineRate).toBe(0.5);
    // Only m1 and m4 were ever proposed to a driver.
    expect(report.declines.driverDeclineRate).toBe(0.5);
  });

  it("names an unrecorded decline reason instead of guessing one", async () => {
    loadPopulatedWeek();
    const report = await buildPassengerDirectionReport(PERIOD);

    expect(report.declines.topReasons[0]).toEqual({ reason: "Дорого", count: 2 });
    expect(report.declines.topReasons).toContainEqual({ reason: NO_REASON_RECORDED, count: 1 });
    expect(report.declines.topReasons).toContainEqual({ reason: "Занят", count: 1 });
    expect(report.missingDataNotes.some((note) => note.includes("carried no declineReason"))).toBe(true);
  });

  it("excludes an impossible interval from handling statistics and says so", async () => {
    loadPopulatedWeek();
    const report = await buildPassengerDirectionReport(PERIOD);

    // 10, 40, 20 and 2 minutes; m8's negative interval is dropped, m5 never
    // answered, and m9 is outside the period.
    expect(report.handling.passengerResponsesObserved).toBe(4);
    expect(report.handling.medianPassengerResponseMinutes).toBe(15);
    expect(report.handling.p90PassengerResponseMinutes).toBe(34);
    expect(report.handling.driverResponsesObserved).toBe(2);
    expect(report.handling.medianDriverResponseMinutes).toBe(10);
    expect(report.missingDataNotes.some((note) => note.includes("recorded a response BEFORE the proposal"))).toBe(true);
  });

  it("reports execution and loop supply separately", async () => {
    loadPopulatedWeek();
    const report = await buildPassengerDirectionReport(PERIOD);

    expect(report.execution).toEqual({
      tripsCreated: 4,
      completed: 2,
      cancelled: 1,
      noShow: 1,
      completionRate: 0.5,
      loopRuns: 4,
      loopNoSupply: 2,
      noSupplyRate: 0.5,
    });
  });

  // The complaint-attribution rule: passenger complaints carry a tripId, cargo
  // complaints a shipmentId, and a complaint with neither belongs to neither
  // manager rather than to the one currently being reported on.
  it("counts only passenger complaints, keeps old critical cases current, and flags unattributable ones", async () => {
    loadPopulatedWeek();
    const report = await buildPassengerDirectionReport(PERIOD);

    expect(report.serviceQuality).toEqual({ supportCasesOpened: 2, complaintsOpened: 1, criticalComplaintsOpen: 1 });
    expect(report.missingDataNotes.some((note) => note.includes("neither tripId nor shipmentId"))).toBe(true);
  });

  it("emits exactly the anomalies the measurements support", async () => {
    loadPopulatedWeek();
    const report = await buildPassengerDirectionReport(PERIOD);

    expect(report.anomalies.map((a) => a.code)).toEqual([
      "HIGH_PASSENGER_DECLINE_RATE",
      "HIGH_DRIVER_DECLINE_RATE",
      "LOW_TRIP_COMPLETION_RATE",
      "HIGH_NO_SUPPLY_RATE",
      "OPEN_CRITICAL_COMPLAINTS",
    ]);
  });

  // An empty week is the case most likely to be reported as a catastrophe by a
  // naive implementation: every ratio divides by zero.
  it("reports an empty period as null rates with no anomalies at all", async () => {
    loadTables({});
    const report = await buildPassengerDirectionReport(PERIOD);

    expect(report.leads.conversionRate).toBeNull();
    expect(report.bookings.confirmationRate).toBeNull();
    expect(report.declines.passengerDeclineRate).toBeNull();
    expect(report.declines.driverDeclineRate).toBeNull();
    expect(report.execution.completionRate).toBeNull();
    expect(report.execution.noSupplyRate).toBeNull();
    expect(report.handling.medianPassengerResponseMinutes).toBeNull();
    expect(report.handling.p90DriverResponseMinutes).toBeNull();
    expect(report.demand).toEqual({ requests: 0, seatsRequested: 0 });
    expect(report.directions).toEqual([]);
    expect(report.declines.topReasons).toEqual([]);
    expect(report.anomalies).toEqual([]);
  });

  // Two notes are unconditional caveats about how the numbers are built, not
  // observations — they must be present even when nothing happened.
  it("always states the trip-window and stale-critical-complaint caveats", async () => {
    loadTables({});
    const report = await buildPassengerDirectionReport(PERIOD);

    expect(report.missingDataNotes.some((note) => note.includes("completionRate is therefore a floor"))).toBe(true);
    expect(report.missingDataNotes.some((note) => note.includes("including ones opened earlier"))).toBe(true);
  });
});
