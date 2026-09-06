import { describe, expect, it } from "vitest";
import { SYNTHETIC_PROVENANCE, isProvenanceTrainingSafe, validateProvenance, type ProvenanceMetadata } from "./provenance";

describe("SYNTHETIC_PROVENANCE", () => {
  it("is valid and training-safe out of the box", () => {
    expect(validateProvenance(SYNTHETIC_PROVENANCE)).toEqual([]);
    expect(isProvenanceTrainingSafe(SYNTHETIC_PROVENANCE)).toBe(true);
  });
});

describe("isProvenanceTrainingSafe", () => {
  it("rejects RT_SANITIZED data that is still REDACTION_PENDING", () => {
    const meta: ProvenanceMetadata = {
      source: "rt-conversation-2026-09",
      sourceType: "RT_SANITIZED",
      privacyStatus: "REDACTION_PENDING",
      allowedForTraining: true,
      allowedForEvaluation: false,
    };
    expect(isProvenanceTrainingSafe(meta)).toBe(false);
  });

  it("accepts RT_SANITIZED data once privacyStatus is SANITIZED", () => {
    const meta: ProvenanceMetadata = {
      source: "rt-conversation-2026-09",
      sourceType: "RT_SANITIZED",
      privacyStatus: "SANITIZED",
      allowedForTraining: true,
      allowedForEvaluation: true,
    };
    expect(isProvenanceTrainingSafe(meta)).toBe(true);
  });
});

describe("validateProvenance", () => {
  it("flags allowedForTraining=true on unsafe provenance", () => {
    const meta: ProvenanceMetadata = {
      source: "rt-conversation-2026-09",
      sourceType: "RT_SANITIZED",
      privacyStatus: "REDACTION_PENDING",
      allowedForTraining: true,
      allowedForEvaluation: false,
    };
    const errors = validateProvenance(meta);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("requires a license on LICENSED_REFERENCE entries", () => {
    const meta: ProvenanceMetadata = {
      source: "reference-corpus",
      sourceType: "LICENSED_REFERENCE",
      privacyStatus: "SANITIZED",
      allowedForTraining: false,
      allowedForEvaluation: true,
    };
    expect(validateProvenance(meta)).toContain("LICENSED_REFERENCE entries must declare a license");
  });
});
