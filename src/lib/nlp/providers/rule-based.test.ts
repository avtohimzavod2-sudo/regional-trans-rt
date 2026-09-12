import { describe, expect, it } from "vitest";
import { RuleBasedTripExtractionProvider } from "./rule-based";
import type { StopContext } from "./types";

const STOPS: StopContext[] = [
  {
    key: "bishkek-karakol:bishkek",
    nameRu: "Бишкек",
    nameKy: "Бишкек",
    nameEn: "Bishkek",
    aliases: ["фрунзе"],
  },
  {
    key: "bishkek-karakol:cholpon-ata",
    nameRu: "Чолпон-Ата",
    nameKy: "Чолпон-Ата",
    nameEn: "Cholpon-Ata",
    aliases: [],
  },
  {
    key: "bishkek-karakol:karakol",
    nameRu: "Каракол",
    nameKy: "Каракол",
    nameEn: "Karakol",
    aliases: ["пржевальск"],
  },
];

const TODAY = new Date("2026-09-12T00:00:00.000Z");
const provider = new RuleBasedTripExtractionProvider();

function extract(text: string, hint: "PASSENGER_LIKELY" | "DRIVER_LIKELY" | "UNKNOWN" = "UNKNOWN") {
  return provider.extract({ text, stops: STOPS, hint, today: TODAY });
}

describe("rule-based extraction", () => {
  it("reads a complete Russian passenger request", async () => {
    const result = await extract("Ищу машину Бишкек - Каракол завтра, 2 места");

    expect(result.kind).toBe("PASSENGER_REQUEST");
    expect(result.language).toBe("RU");
    expect(result.originStopKey).toBe("bishkek-karakol:bishkek");
    expect(result.destinationStopKey).toBe("bishkek-karakol:karakol");
    expect(result.travelDate).toBe("2026-09-13");
    expect(result.seats).toBe(2);
  });

  it("takes direction from the order the stops are mentioned", async () => {
    const result = await extract("Каракол Бишкек завтра 1 место, ищу машину");
    expect(result.originStopKey).toBe("bishkek-karakol:karakol");
    expect(result.destinationStopKey).toBe("bishkek-karakol:bishkek");
  });

  it("reads an English request", async () => {
    const result = await extract("Looking for a ride from Bishkek to Karakol tomorrow, 3 seats");
    expect(result.kind).toBe("PASSENGER_REQUEST");
    expect(result.language).toBe("EN");
    expect(result.seats).toBe(3);
    expect(result.travelDate).toBe("2026-09-13");
  });

  it("reads a Kyrgyz request typed without ө/ү/ң", async () => {
    // The folding quick-classify.ts established: a phone keyboard without the
    // Kyrgyz letters must not make a message unparseable.
    const result = await extract("Бишкек Каракол эртен 2 орун керек");
    expect(result.language).toBe("KY");
    expect(result.originStopKey).toBe("bishkek-karakol:bishkek");
    expect(result.seats).toBe(2);
  });

  it("recognizes a driver offer and its plate", async () => {
    const result = await extract("Еду Бишкек - Каракол завтра, 4 места, 01KG123ABC", "DRIVER_LIKELY");
    expect(result.kind).toBe("DRIVER_OFFER");
    expect(result.carInfo).toBe("01KG123ABC");
  });

  it("does not put a plate on a passenger request", async () => {
    const result = await extract("Ищу машину Бишкек - Каракол завтра, 2 места, видел 01KG123ABC");
    expect(result.kind).toBe("PASSENGER_REQUEST");
    expect(result.carInfo).toBeNull();
  });

  it("matches an alias", async () => {
    const result = await extract("Ищу машину Фрунзе - Пржевальск завтра 1 место");
    expect(result.originStopKey).toBe("bishkek-karakol:bishkek");
    expect(result.destinationStopKey).toBe("bishkek-karakol:karakol");
  });

  it("prefers the longer stop label when one name contains another", async () => {
    // "Ата" is a substring of "Чолпон-Ата"; a shortest-first match would
    // resolve the wrong stop, and a wrong stop is a passenger driven to the
    // wrong town.
    const result = await extract("Ищу машину Бишкек - Чолпон-Ата завтра 1 место");
    expect(result.destinationStopKey).toBe("bishkek-karakol:cholpon-ata");
  });

  describe("refuses rather than guesses", () => {
    it("returns UNRECOGNIZED for chatter", async () => {
      const result = await extract("Здравствуйте, как дела?");
      expect(result.kind).toBe("UNRECOGNIZED");
      expect(result.originStopKey).toBeNull();
    });

    it("returns UNRECOGNIZED when only one endpoint is named", async () => {
      const result = await extract("Ищу машину до Каракола завтра, 2 места");
      expect(result.kind).toBe("UNRECOGNIZED");
    });

    it("returns UNRECOGNIZED when the same stop is named twice", async () => {
      const result = await extract("Ищу машину Бишкек Бишкек завтра");
      expect(result.kind).toBe("UNRECOGNIZED");
    });

    it("never invents a travel date from silence", async () => {
      // A request with no date is incomplete demand. Defaulting it to today
      // would put a passenger in a car they did not ask to be in.
      const result = await extract("Ищу машину Бишкек - Каракол, 2 места");
      expect(result.kind).toBe("PASSENGER_REQUEST");
      expect(result.travelDate).toBeNull();
      expect(result.confidence).toBeLessThan(0.9);
    });

    it("never invents a pickup point", async () => {
      // Free-text geography is Жолчу's to resolve. A substring lifted from the
      // message would be an unverified address flowing into matching.
      const result = await extract("Ищу машину Бишкек - Каракол завтра 1 место, заберите у Ошского рынка");
      expect(result.pickupPoint).toBeNull();
    });

    it("does not read a seat count as a time", async () => {
      const result = await extract("Ищу машину Бишкек - Каракол завтра, 2 места");
      expect(result.timeWindowStart).toBeNull();
    });
  });

  describe("dates", () => {
    it.each([
      ["сегодня", "2026-09-12"],
      ["завтра", "2026-09-13"],
      ["послезавтра", "2026-09-14"],
      ["2026-10-05", "2026-10-05"],
      ["05.10", "2026-10-05"],
      ["05.10.2026", "2026-10-05"],
    ])("resolves %s", async (phrase, expected) => {
      const result = await extract(`Ищу машину Бишкек - Каракол ${phrase} 1 место`);
      expect(result.travelDate).toBe(expected);
    });
  });

  describe("times", () => {
    it("reads an explicit HH:mm", async () => {
      const result = await extract("Ищу машину Бишкек - Каракол завтра в 08:30, 1 место");
      expect(result.timeWindowStart).toBe("08:30");
    });

    it("reads a bare hour after a time preposition", async () => {
      const result = await extract("Ищу машину Бишкек - Каракол завтра в 8, 1 место");
      expect(result.timeWindowStart).toBe("08:00");
    });
  });

  it("is deterministic across repeated calls", async () => {
    // The property the whole provider exists for: a scenario engine replaying
    // the same message must get the same demand every time.
    const text = "Ищу машину Бишкек - Каракол завтра, 2 места";
    const a = await extract(text);
    const b = await extract(text);
    expect(a).toEqual(b);
  });
});
