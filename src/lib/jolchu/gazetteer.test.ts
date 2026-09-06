import { describe, expect, it } from "vitest";
import { findKnownHubByText, KNOWN_HUBS, KNOWN_LANDMARKS } from "./gazetteer";

describe("KNOWN_HUBS / KNOWN_LANDMARKS", () => {
  it("has no duplicate hub keys", () => {
    const keys = KNOWN_HUBS.map((h) => h.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every hub has valid coordinates", () => {
    for (const hub of KNOWN_HUBS) {
      expect(hub.latitude).toBeGreaterThan(-90);
      expect(hub.latitude).toBeLessThan(90);
      expect(hub.longitude).toBeGreaterThan(-180);
      expect(hub.longitude).toBeLessThan(180);
    }
  });

  it("marks the known ambiguous landmark as ambiguous", () => {
    const alamedin = KNOWN_LANDMARKS.find((l) => l.key === "ALAMEDIN_AMBIGUOUS");
    expect(alamedin?.ambiguous).toBe(true);
  });
});

describe("findKnownHubByText", () => {
  it("finds Bishkek by substring match against a listed alias", () => {
    expect(findKnownHubByText("еду бишкектен")?.key).toBe("BISHKEK");
    expect(findKnownHubByText("еду из бишкека")?.key).toBe("BISHKEK"); // "бишкек" is a substring of "бишкека"
  });

  it("finds Karakol by its Latin alias", () => {
    expect(findKnownHubByText("going to karakol today")?.key).toBe("KARAKOL");
  });

  it("returns null when no hub alias is present", () => {
    expect(findKnownHubByText("случайный текст без городов")).toBeNull();
  });
});
