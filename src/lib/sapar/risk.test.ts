import { describe, expect, it } from "vitest";
import { evaluateShipmentRisk } from "./risk";

const NO_EXTRACTION_FLAGS = { perishable: false, temperatureControlled: false, declaredValueSom: null };

describe("evaluateShipmentRisk — ALLOW", () => {
  it("allows ordinary cargo with no risk signals", () => {
    const r = evaluateShipmentRisk("Из Бишкека в Ош, коробка 5 кг, нужно забрать завтра", NO_EXTRACTION_FLAGS);
    expect(r.level).toBe("LOW");
    expect(r.action).toBe("ALLOW");
    expect(r.flags).toEqual([]);
    expect(r.reason).toBeNull();
  });
});

describe("evaluateShipmentRisk — BLOCK", () => {
  it("blocks weapons", () => {
    const r = evaluateShipmentRisk("хочу отправить оружие", NO_EXTRACTION_FLAGS);
    expect(r.level).toBe("BLOCKED");
    expect(r.action).toBe("BLOCK");
    expect(r.flags).toContain("weapons");
    expect(r.reason).not.toBeNull();
  });

  it("blocks narcotics", () => {
    const r = evaluateShipmentRisk("там наркотики внутри", NO_EXTRACTION_FLAGS);
    expect(r.action).toBe("BLOCK");
    expect(r.flags).toContain("narcotics");
  });

  it("blocks explosives", () => {
    const r = evaluateShipmentRisk("взрывчатые материалы для стройки", NO_EXTRACTION_FLAGS);
    expect(r.action).toBe("BLOCK");
    expect(r.flags).toContain("explosives");
  });

  it("never invents a specific legal citation in the reason text", () => {
    const r = evaluateShipmentRisk("хочу отправить оружие", NO_EXTRACTION_FLAGS);
    expect(r.reason).not.toMatch(/§|статья|article/i);
  });
});

describe("evaluateShipmentRisk — ESCALATE", () => {
  it("escalates lithium batteries / powerbanks (the mandated elevated-risk fixture)", () => {
    const r = evaluateShipmentRisk("Отправьте powerbank и аккумуляторы из Бишкека в Ош, 1 коробка", NO_EXTRACTION_FLAGS);
    expect(r.level).toBe("ELEVATED");
    expect(r.action).toBe("ESCALATE");
    expect(r.flags).toContain("lithium_battery");
    expect(r.reason).not.toBeNull();
  });

  it("escalates unverified cargo contents", () => {
    const r = evaluateShipmentRisk("не знаю что внутри, коробку отдали соседи", NO_EXTRACTION_FLAGS);
    expect(r.action).toBe("ESCALATE");
    expect(r.flags).toContain("unknown_contents");
  });

  it("escalates on perishable/temperature-controlled extraction flags even with neutral text", () => {
    const r = evaluateShipmentRisk("посылка", { perishable: true, temperatureControlled: false, declaredValueSom: null });
    expect(r.action).toBe("ESCALATE");
    expect(r.flags).toContain("temperature_or_perishable");
  });

  it("escalates on a high declared value", () => {
    const r = evaluateShipmentRisk("посылка", { perishable: false, temperatureControlled: false, declaredValueSom: 100_000 });
    expect(r.action).toBe("ESCALATE");
    expect(r.flags).toContain("high_declared_value");
  });

  it("does not escalate on a declared value below the threshold", () => {
    const r = evaluateShipmentRisk("посылка", { perishable: false, temperatureControlled: false, declaredValueSom: 1_000 });
    expect(r.action).toBe("ALLOW");
  });
});

describe("evaluateShipmentRisk — precedence", () => {
  it("prefers BLOCK over ESCALATE when both kinds of signals are present", () => {
    const r = evaluateShipmentRisk("оружие и аккумуляторы в одной коробке", NO_EXTRACTION_FLAGS);
    expect(r.action).toBe("BLOCK");
  });

  it("never throws on empty input", () => {
    expect(() => evaluateShipmentRisk("", NO_EXTRACTION_FLAGS)).not.toThrow();
    expect(evaluateShipmentRisk("", NO_EXTRACTION_FLAGS).action).toBe("ALLOW");
  });
});
