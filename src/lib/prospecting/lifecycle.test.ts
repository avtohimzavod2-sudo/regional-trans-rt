import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canTransitionProspectLifecycleStage,
  captureQualificationFacts,
  flagPossibleDuplicate,
  ProspectLifecycleNotFoundError,
  ProspectLifecycleTransitionError,
  transitionProspectLifecycleStage,
  upgradeVerificationStatus,
} from "./lifecycle";

function makeDelegate() {
  return {
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  };
}

describe("canTransitionProspectLifecycleStage", () => {
  it("allows every step of the documented minimum pipeline", () => {
    expect(canTransitionProspectLifecycleStage("DISCOVERED", "QUALIFICATION_PENDING")).toBe(true);
    expect(canTransitionProspectLifecycleStage("QUALIFICATION_PENDING", "QUALIFIED")).toBe(true);
    expect(canTransitionProspectLifecycleStage("QUALIFICATION_PENDING", "REJECTED")).toBe(true);
    expect(canTransitionProspectLifecycleStage("QUALIFIED", "CONTACT_PENDING")).toBe(true);
    expect(canTransitionProspectLifecycleStage("CONTACT_PENDING", "CONTACTED")).toBe(true);
    expect(canTransitionProspectLifecycleStage("CONTACTED", "FOLLOW_UP_PENDING")).toBe(true);
    expect(canTransitionProspectLifecycleStage("FOLLOW_UP_PENDING", "RESPONDED")).toBe(true);
    expect(canTransitionProspectLifecycleStage("RESPONDED", "HANDOFF_READY")).toBe(true);
    expect(canTransitionProspectLifecycleStage("HANDOFF_READY", "HANDED_OFF")).toBe(true);
    expect(canTransitionProspectLifecycleStage("HANDED_OFF", "CLOSED")).toBe(true);
  });

  it("rejects a silent state jump (e.g. DISCOVERED straight to HANDED_OFF)", () => {
    expect(canTransitionProspectLifecycleStage("DISCOVERED", "HANDED_OFF")).toBe(false);
    expect(canTransitionProspectLifecycleStage("QUALIFICATION_PENDING", "CONTACTED")).toBe(false);
  });

  it("treats REJECTED and CLOSED as terminal (only REJECTED -> CLOSED / HANDED_OFF -> CLOSED remain)", () => {
    expect(canTransitionProspectLifecycleStage("CLOSED", "DISCOVERED")).toBe(false);
    expect(canTransitionProspectLifecycleStage("REJECTED", "QUALIFIED")).toBe(false);
    expect(canTransitionProspectLifecycleStage("REJECTED", "CLOSED")).toBe(true);
  });
});

describe("transitionProspectLifecycleStage", () => {
  let delegate: ReturnType<typeof makeDelegate>;
  beforeEach(() => {
    delegate = makeDelegate();
  });

  it("applies a legal transition and returns the fresh row", async () => {
    delegate.updateMany.mockResolvedValue({ count: 1 });
    delegate.findUniqueOrThrow.mockResolvedValue({ id: "p-1", lifecycleStage: "QUALIFICATION_PENDING" });

    const result = await transitionProspectLifecycleStage(delegate, "p-1", "QUALIFICATION_PENDING");

    expect(result).toEqual({ prospect: { id: "p-1", lifecycleStage: "QUALIFICATION_PENDING" }, deduplicated: false });
    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: { id: "p-1", lifecycleStage: { in: ["DISCOVERED"] } },
      data: { lifecycleStage: "QUALIFICATION_PENDING" },
    });
  });

  it("repeated identical transition is an idempotent no-op, not an error (spec: repeated transition idempotency)", async () => {
    delegate.updateMany.mockResolvedValue({ count: 0 });
    delegate.findUnique.mockResolvedValue({ id: "p-1", lifecycleStage: "QUALIFICATION_PENDING" });

    const result = await transitionProspectLifecycleStage(delegate, "p-1", "QUALIFICATION_PENDING");

    expect(result).toEqual({ prospect: { id: "p-1", lifecycleStage: "QUALIFICATION_PENDING" }, deduplicated: true });
  });

  it("an illegal transition attempt throws ProspectLifecycleTransitionError (spec: invalid transition rejection)", async () => {
    delegate.updateMany.mockResolvedValue({ count: 0 });
    delegate.findUnique.mockResolvedValue({ id: "p-1", lifecycleStage: "DISCOVERED" });

    await expect(transitionProspectLifecycleStage(delegate, "p-1", "HANDED_OFF")).rejects.toThrow(ProspectLifecycleTransitionError);
  });

  it("throws ProspectLifecycleNotFoundError when the prospect no longer exists", async () => {
    delegate.updateMany.mockResolvedValue({ count: 0 });
    delegate.findUnique.mockResolvedValue(null);

    await expect(transitionProspectLifecycleStage(delegate, "p-1", "QUALIFIED")).rejects.toThrow(ProspectLifecycleNotFoundError);
  });

  it("passes extraData through unconditionally on a successful transition (e.g. respondedAt / rejectionReason)", async () => {
    delegate.updateMany.mockResolvedValue({ count: 1 });
    delegate.findUniqueOrThrow.mockResolvedValue({ id: "p-1", lifecycleStage: "REJECTED" });

    await transitionProspectLifecycleStage(delegate, "p-1", "REJECTED", { rejectionReason: "no working phone number" });

    expect(delegate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lifecycleStage: "REJECTED", rejectionReason: "no working phone number" } }),
    );
  });
});

describe("captureQualificationFacts — first-write-wins (spec D)", () => {
  it("sets a fact that is currently null", async () => {
    const delegate = makeDelegate();
    delegate.findUnique.mockResolvedValue({ id: "p-1", executorType: null, serviceAreaText: null });
    delegate.update.mockResolvedValue({ id: "p-1", executorType: "courier", serviceAreaText: null });

    const result = await captureQualificationFacts(delegate, "p-1", { executorType: "courier" });

    expect(delegate.update).toHaveBeenCalledWith({ where: { id: "p-1" }, data: { executorType: "courier" } });
    expect(result.executorType).toBe("courier");
  });

  it("never overwrites a fact that is already known (spec: no destructive overwrite of provenance/evidence)", async () => {
    const delegate = makeDelegate();
    delegate.findUnique.mockResolvedValue({ id: "p-1", executorType: "courier" });

    const result = await captureQualificationFacts(delegate, "p-1", { executorType: "van driver" });

    expect(delegate.update).not.toHaveBeenCalled();
    expect(result.executorType).toBe("courier");
  });

  it("unknown facts (null/undefined) are left unknown — never fabricated (spec: unknown facts remain unknown)", async () => {
    const delegate = makeDelegate();
    delegate.findUnique.mockResolvedValue({ id: "p-1", executorType: null, serviceAreaText: null });

    const result = await captureQualificationFacts(delegate, "p-1", { executorType: undefined, serviceAreaText: null });

    expect(delegate.update).not.toHaveBeenCalled();
    expect(result).toEqual({ id: "p-1", executorType: null, serviceAreaText: null });
  });

  it("throws ProspectLifecycleNotFoundError for a missing prospect", async () => {
    const delegate = makeDelegate();
    delegate.findUnique.mockResolvedValue(null);

    await expect(captureQualificationFacts(delegate, "p-missing", { executorType: "courier" })).rejects.toThrow(ProspectLifecycleNotFoundError);
  });
});

describe("upgradeVerificationStatus — monotonic, never a downgrade", () => {
  it("upgrades UNVERIFIED -> SELF_REPORTED", async () => {
    const delegate = makeDelegate();
    delegate.findUnique.mockResolvedValue({ id: "p-1", verificationStatus: "UNVERIFIED" });
    delegate.update.mockResolvedValue({ id: "p-1", verificationStatus: "SELF_REPORTED" });

    const result = await upgradeVerificationStatus(delegate, "p-1", "SELF_REPORTED");

    expect(result.verificationStatus).toBe("SELF_REPORTED");
  });

  it("never downgrades VERIFIED back to SELF_REPORTED/UNVERIFIED", async () => {
    const delegate = makeDelegate();
    delegate.findUnique.mockResolvedValue({ id: "p-1", verificationStatus: "VERIFIED" });

    const result = await upgradeVerificationStatus(delegate, "p-1", "SELF_REPORTED");

    expect(delegate.update).not.toHaveBeenCalled();
    expect(result.verificationStatus).toBe("VERIFIED");
  });
});

describe("flagPossibleDuplicate — never an unsafe merge (spec E)", () => {
  it("sets possibleDuplicateOfId on an unflagged prospect", async () => {
    const delegate = makeDelegate();
    delegate.updateMany.mockResolvedValue({ count: 1 });
    delegate.findUniqueOrThrow.mockResolvedValue({ id: "p-2", possibleDuplicateOfId: "p-1" });

    const result = await flagPossibleDuplicate(delegate, "p-2", "p-1");

    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: { id: "p-2", possibleDuplicateOfId: null },
      data: { possibleDuplicateOfId: "p-1" },
    });
    expect(result.possibleDuplicateOfId).toBe("p-1");
  });

  it("never repoints a prospect already flagged as a possible duplicate of someone else", async () => {
    const delegate = makeDelegate();
    delegate.updateMany.mockResolvedValue({ count: 0 });
    delegate.findUniqueOrThrow.mockResolvedValue({ id: "p-2", possibleDuplicateOfId: "p-0" });

    const result = await flagPossibleDuplicate(delegate, "p-2", "p-1");

    expect(result.possibleDuplicateOfId).toBe("p-0");
  });
});
