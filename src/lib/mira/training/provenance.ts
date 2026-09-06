// Source registry for training/benchmark data. Every corpus entry must
// carry provenance so production training never silently mixes synthetic,
// licensed, and real-user data. This module is pure data + validation —
// see sanitize.ts for the redaction pipeline real conversations must pass
// through before they may ever reach sourceType "RT_SANITIZED".
export type ProvenanceSourceType =
  | "SYNTHETIC" // hand/LLM-authored example, no real user involved
  | "RT_SANITIZED" // derived from a real RT conversation, PII-redacted + human-approved
  | "LICENSED_REFERENCE" // third-party linguistic reference data used under license
  | "HUMAN_CORRECTION"; // produced by the Training Failure Loop's human-review step

export type PrivacyStatus = "SYNTHETIC" | "SANITIZED" | "REDACTION_PENDING";

export interface ProvenanceMetadata {
  source: string; // free-text label, e.g. "synthetic-v1", "rt-conversation-2026-09"
  sourceType: ProvenanceSourceType;
  license?: string;
  privacyStatus: PrivacyStatus;
  allowedForTraining: boolean;
  allowedForEvaluation: boolean;
}

export const SYNTHETIC_PROVENANCE: ProvenanceMetadata = {
  source: "synthetic-v1",
  sourceType: "SYNTHETIC",
  privacyStatus: "SYNTHETIC",
  allowedForTraining: true,
  allowedForEvaluation: true,
};

/** A real conversation may only be marked RT_SANITIZED (and only then
 * become allowedForTraining) once its privacyStatus is SANITIZED — never
 * REDACTION_PENDING. This is the one invariant this whole training system
 * exists to protect: no unredacted real user data ever enters training. */
export function isProvenanceTrainingSafe(meta: ProvenanceMetadata): boolean {
  if (meta.sourceType === "SYNTHETIC" || meta.sourceType === "LICENSED_REFERENCE" || meta.sourceType === "HUMAN_CORRECTION") {
    return meta.privacyStatus !== "REDACTION_PENDING";
  }
  if (meta.sourceType === "RT_SANITIZED") {
    return meta.privacyStatus === "SANITIZED";
  }
  return false;
}

export function validateProvenance(meta: ProvenanceMetadata): string[] {
  const errors: string[] = [];
  if (!meta.source.trim()) errors.push("source must not be empty");
  if (meta.allowedForTraining && !isProvenanceTrainingSafe(meta)) {
    errors.push("allowedForTraining is true but privacyStatus does not permit training use");
  }
  if (meta.sourceType === "LICENSED_REFERENCE" && !meta.license) {
    errors.push("LICENSED_REFERENCE entries must declare a license");
  }
  return errors;
}
