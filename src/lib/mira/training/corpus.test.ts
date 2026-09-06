import { describe, expect, it } from "vitest";
import { TRAINING_CORPUS, validateCorpus, validateCorpusEntry } from "./corpus";

describe("TRAINING_CORPUS", () => {
  it("is non-empty and every entry is valid", () => {
    expect(TRAINING_CORPUS.length).toBeGreaterThan(0);
    expect(validateCorpus()).toEqual({});
  });

  it("every entry is synthetic (no real conversation data seeded yet)", () => {
    for (const entry of TRAINING_CORPUS) {
      expect(entry.provenance.sourceType).toBe("SYNTHETIC");
      expect(entry.provenance.privacyStatus).toBe("SYNTHETIC");
    }
  });

  it("covers more than one curriculum level", () => {
    const levels = new Set(TRAINING_CORPUS.map((e) => e.level));
    expect(levels.size).toBeGreaterThan(1);
  });
});

describe("validateCorpusEntry", () => {
  it("flags an out-of-range level", () => {
    const errors = validateCorpusEntry({
      level: 99,
      input: "test",
      inputType: "TEXT",
      provenance: TRAINING_CORPUS[0].provenance,
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("flags empty input", () => {
    const errors = validateCorpusEntry({
      level: 1,
      input: "   ",
      inputType: "TEXT",
      provenance: TRAINING_CORPUS[0].provenance,
    });
    expect(errors).toContain("input must not be empty");
  });
});
