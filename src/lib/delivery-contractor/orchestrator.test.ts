import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findExistingBusinessProspectMock,
  createBusinessProspectMock,
  transitionBusinessProspectStatusMock,
  linkBusinessProspectToPartnerMock,
  getBusinessProspectByIdMock,
  logAgentActionMock,
  classifyMarketRoleMock,
  sendAcquisitionOutreachMock,
  recordDeliveryCrmEventMock,
  createProspectHandoffMock,
} = vi.hoisted(() => ({
  findExistingBusinessProspectMock: vi.fn(),
  createBusinessProspectMock: vi.fn(),
  transitionBusinessProspectStatusMock: vi.fn(),
  linkBusinessProspectToPartnerMock: vi.fn(),
  getBusinessProspectByIdMock: vi.fn(),
  logAgentActionMock: vi.fn().mockResolvedValue(undefined),
  classifyMarketRoleMock: vi.fn(),
  sendAcquisitionOutreachMock: vi.fn(),
  recordDeliveryCrmEventMock: vi.fn().mockResolvedValue({ eventId: "evt-1", deduplicated: false }),
  createProspectHandoffMock: vi.fn(),
}));

vi.mock("./prospect", async () => {
  const actual = await vi.importActual<typeof import("./prospect")>("./prospect");
  return {
    ...actual,
    findExistingBusinessProspect: findExistingBusinessProspectMock,
    createBusinessProspect: createBusinessProspectMock,
    transitionBusinessProspectStatus: transitionBusinessProspectStatusMock,
    linkBusinessProspectToPartner: linkBusinessProspectToPartnerMock,
    getBusinessProspectById: getBusinessProspectByIdMock,
  };
});
vi.mock("./crm", () => ({ recordDeliveryCrmEvent: recordDeliveryCrmEventMock }));
vi.mock("@/lib/agents/trace", () => ({ logAgentAction: logAgentActionMock }));
vi.mock("@/lib/acquisition/role-classifier", async () => {
  const actual = await vi.importActual<typeof import("@/lib/acquisition/role-classifier")>("@/lib/acquisition/role-classifier");
  return { ...actual, classifyMarketRole: classifyMarketRoleMock };
});
vi.mock("@/lib/acquisition/outreach-log", () => ({ sendAcquisitionOutreach: sendAcquisitionOutreachMock }));
vi.mock("@/lib/prospecting/handoff", async () => {
  const actual = await vi.importActual<typeof import("@/lib/prospecting/handoff")>("@/lib/prospecting/handoff");
  return { ...actual, createProspectHandoff: createProspectHandoffMock };
});

import { agreeBusinessPartnership, handoffBusinessToOperations, processBusinessMarketSighting, qualifyBusinessProspect } from "./orchestrator";

const CTX = { traceId: "trace-1", hop: 0 };

function businessClassification(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    role: "BUSINESS_ADVERTISEMENT",
    language: "RU",
    confidence: 0.9,
    originText: null,
    destinationText: null,
    departureTimeText: null,
    passengerCount: null,
    seatsAvailable: null,
    vehicleText: null,
    cargoDescription: null,
    businessCategoryGuess: "продукты",
    ...overrides,
  };
}

describe("processBusinessMarketSighting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findExistingBusinessProspectMock.mockResolvedValue(null);
    createBusinessProspectMock.mockResolvedValue({ id: "biz-1", status: "PROSPECT", category: "GROCERY" });
    transitionBusinessProspectStatusMock.mockResolvedValue({ id: "biz-1", status: "CONTACTED" });
  });

  it("skips a non-business sighting without creating a prospect", async () => {
    classifyMarketRoleMock.mockResolvedValue({ role: "PASSENGER", language: "RU", confidence: 0.9, originText: null, destinationText: null, departureTimeText: null, passengerCount: 1, seatsAvailable: null, vehicleText: null, cargoDescription: null, businessCategoryGuess: null });

    const outcome = await processBusinessMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "попутчик керек" });

    expect(outcome.outcome).toBe("SKIPPED_NOT_A_BUSINESS_SIGHTING");
    expect(createBusinessProspectMock).not.toHaveBeenCalled();
  });

  it("never creates a duplicate prospect for a contact signal already on file", async () => {
    classifyMarketRoleMock.mockResolvedValue(businessClassification());
    findExistingBusinessProspectMock.mockResolvedValue({ id: "biz-existing", status: "QUALIFIED" });

    const outcome = await processBusinessMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "дүкөн", contactPhone: "0700123456" });

    expect(outcome).toEqual({ outcome: "ALREADY_KNOWN", prospect: { id: "biz-existing", status: "QUALIFIED" } });
    expect(createBusinessProspectMock).not.toHaveBeenCalled();
  });

  it("creates a new prospect, logs it, and never sends outreach with no contact channel", async () => {
    classifyMarketRoleMock.mockResolvedValue(businessClassification());

    const outcome = await processBusinessMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "дүкөн" });

    expect(outcome.outcome).toBe("PROSPECT_CREATED");
    if (outcome.outcome === "PROSPECT_CREATED") expect(outcome.outreach).toBeNull();
    expect(createBusinessProspectMock).toHaveBeenCalledTimes(1);
    expect(sendAcquisitionOutreachMock).not.toHaveBeenCalled();
    expect(logAgentActionMock).toHaveBeenCalledWith(expect.objectContaining({ agent: "DELIVERY_CONTRACTOR", entityId: "biz-1" }));
  });

  it("sends outreach and appends an OUTREACH_SENT Delivery CRM event when a real phone is present", async () => {
    classifyMarketRoleMock.mockResolvedValue(businessClassification());
    sendAcquisitionOutreachMock.mockResolvedValue({ status: "DRY_RUN", eventId: "outreach-evt", deduplicated: false });

    const outcome = await processBusinessMarketSighting(CTX, { sourceType: "TELEGRAM_GROUP", sourceText: "дүкөн", contactPhone: "0700123456" });

    expect(outcome.outcome).toBe("PROSPECT_CREATED");
    if (outcome.outcome === "PROSPECT_CREATED") expect(outcome.outreach).toEqual({ status: "DRY_RUN", eventId: "outreach-evt", deduplicated: false });
    expect(sendAcquisitionOutreachMock).toHaveBeenCalledWith(expect.objectContaining({ contractorAgent: "DELIVERY_CONTRACTOR", prospectType: "BUSINESS", prospectRef: "biz-1", to: "996700123456" }));
    expect(transitionBusinessProspectStatusMock).toHaveBeenCalledWith("biz-1", "CONTACTED");
    expect(recordDeliveryCrmEventMock).toHaveBeenCalledWith(expect.objectContaining({ businessProspectId: "biz-1", eventType: "OUTREACH_SENT" }));
  });
});

describe("BusinessProspect lifecycle transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transitionBusinessProspectStatusMock.mockResolvedValue({ id: "biz-1", status: "QUALIFIED" });
  });

  it("rejects qualifying a prospect that is not eligible (e.g. already DECLINED)", async () => {
    await expect(qualifyBusinessProspect(CTX, "biz-1", { status: "DECLINED" })).rejects.toThrow(/cannot move a DECLINED prospect to QUALIFIED/);
    expect(transitionBusinessProspectStatusMock).not.toHaveBeenCalled();
    expect(recordDeliveryCrmEventMock).not.toHaveBeenCalled();
  });

  it("qualifies a CONTACTED prospect and appends a QUALIFIED Delivery CRM event", async () => {
    await qualifyBusinessProspect(CTX, "biz-1", { status: "CONTACTED" }, "confirmed real delivery volume");

    expect(transitionBusinessProspectStatusMock).toHaveBeenCalledWith("biz-1", "QUALIFIED");
    expect(recordDeliveryCrmEventMock).toHaveBeenCalledWith(expect.objectContaining({ businessProspectId: "biz-1", eventType: "QUALIFIED", details: { note: "confirmed real delivery volume" } }));
  });

  it("rejects agreeing a partnership from a status that hasn't been qualified", async () => {
    await expect(agreeBusinessPartnership(CTX, "biz-1", { status: "PROSPECT" })).rejects.toThrow(/cannot move a PROSPECT prospect to PARTNERED/);
    expect(linkBusinessProspectToPartnerMock).not.toHaveBeenCalled();
  });

  it("agrees a partnership from QUALIFIED and links the real Partner id when provided", async () => {
    transitionBusinessProspectStatusMock.mockResolvedValue({ id: "biz-1", status: "PARTNERED" });
    linkBusinessProspectToPartnerMock.mockResolvedValue({ id: "biz-1", status: "PARTNERED", linkedPartnerId: "partner-1" });

    const result = await agreeBusinessPartnership(CTX, "biz-1", { status: "QUALIFIED" }, "partner-1");

    expect(transitionBusinessProspectStatusMock).toHaveBeenCalledWith("biz-1", "PARTNERED");
    expect(linkBusinessProspectToPartnerMock).toHaveBeenCalledWith("biz-1", "partner-1");
    expect(result).toEqual({ id: "biz-1", status: "PARTNERED", linkedPartnerId: "partner-1" });
    expect(recordDeliveryCrmEventMock).toHaveBeenCalledWith(expect.objectContaining({ eventType: "PARTNERSHIP_AGREED", details: { linkedPartnerId: "partner-1" } }));
  });
});

describe("handoffBusinessToOperations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createProspectHandoffMock.mockResolvedValue({ handoff: { id: "handoff-1", status: "READY" }, deduplicated: false });
  });

  it("rejects a handoff for an unknown BusinessProspect without touching the shared core", async () => {
    getBusinessProspectByIdMock.mockResolvedValue(null);

    await expect(handoffBusinessToOperations(CTX, "biz-missing", "CARGO_OPERATIONS")).rejects.toThrow(/unknown BusinessProspect/);
    expect(createProspectHandoffMock).not.toHaveBeenCalled();
  });

  it("hands a qualified business off to CARGO_OPERATIONS through the shared Prospecting Core and appends a Delivery CRM event", async () => {
    getBusinessProspectByIdMock.mockResolvedValue({ id: "biz-1", businessName: "Азык-түлүк дүкөнү", category: "GROCERY", contactPhone: "996700123456", contactHandle: null });

    const outcome = await handoffBusinessToOperations(CTX, "biz-1", "CARGO_OPERATIONS", { note: "confirmed volume" });

    expect(createProspectHandoffMock).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({
        prospectType: "BUSINESS_CUSTOMER",
        prospectRef: "biz-1",
        sourceAgent: "DELIVERY_CONTRACTOR",
        targetAgentOrDepartment: "CARGO_OPERATIONS",
        contactData: "996700123456",
        requestedService: "Азык-түлүк дүкөнү",
        contactFingerprint: "phone:996700123456",
      }),
    );
    expect(recordDeliveryCrmEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ businessProspectId: "biz-1", eventType: "HANDOFF_TO_OPERATIONS", details: expect.objectContaining({ note: "confirmed volume", targetAgentOrDepartment: "CARGO_OPERATIONS", handoffId: "handoff-1" }) }),
    );
    expect(outcome.handoff).toEqual({ id: "handoff-1", status: "READY" });
  });
});
