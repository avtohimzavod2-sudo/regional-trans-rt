// Sapar's Safety/Risk Gate (AGENTS spec s.10). Deterministic, explainable,
// keyword-driven — no LLM call, so a risk decision never depends on a
// model's free-text judgment (spec s.29: critical decisions must not rely
// solely on LLM output). Ordinary low-risk cargo takes the short path with
// zero extra questions; only a recognized risk flag escalates or blocks.
// This module never asserts a specific law ("§ such-and-such prohibits
// this") — it only flags a category and routes to human review, per s.10's
// explicit instruction not to invent legal rules.
import type { RiskDecision, ShipmentExtraction } from "./types";

interface RiskRule {
  flag: string;
  patterns: RegExp[];
  action: "BLOCK" | "ESCALATE";
  reason: string;
}

// Ordered rules — BLOCK rules are checked first (see evaluateShipmentRisk).
// This list is intentionally a plain, editable table, not logic buried in a
// prompt or UI component, so it can be extended without touching callers.
const RISK_RULES: RiskRule[] = [
  { flag: "weapons", patterns: [/оруж/i, /патрон/i, /боеприпас/i, /weapon/i, /ammunition/i], action: "BLOCK", reason: "Похоже на оружие/боеприпасы — RT такие отправления не организует." },
  { flag: "explosives", patterns: [/взрывчат/i, /explosive/i], action: "BLOCK", reason: "Похоже на взрывчатые вещества — RT такие отправления не организует." },
  { flag: "narcotics", patterns: [/наркотик/i, /narcotic/i, /drugs?\b/i], action: "BLOCK", reason: "Похоже на запрещённые вещества — RT такие отправления не организует." },
  { flag: "unknown_contents", patterns: [/не знаю что внутри/i, /без понятия что там/i, /unknown contents/i], action: "ESCALATE", reason: "Отправитель не может подтвердить содержимое — нужна проверка диспетчером." },
  { flag: "chemicals", patterns: [/химикат/i, /кислот/i, /щелоч/i, /chemical/i], action: "ESCALATE", reason: "Похоже на химические вещества — требуется ручная проверка." },
  { flag: "gas_pressure", patterns: [/газов[а-я]* баллон/i, /баллон с газом/i, /под давлением/i, /pressuri[sz]ed/i, /\bgas\b/i], action: "ESCALATE", reason: "Похоже на газ/ёмкость под давлением — требуется ручная проверка." },
  { flag: "fuel", patterns: [/бензин/i, /топливо/i, /дизель/i, /fuel\b/i], action: "ESCALATE", reason: "Похоже на топливо — требуется ручная проверка." },
  { flag: "dangerous_liquids", patterns: [/опасн[а-я]* жидкост/i, /dangerous liquid/i], action: "ESCALATE", reason: "Похоже на опасную жидкость — требуется ручная проверка." },
  { flag: "lithium_battery", patterns: [/аккумулятор/i, /литиев[а-я]* батаре/i, /lithium/i, /powerbank/i, /павербанк/i], action: "ESCALATE", reason: "Литиевые аккумуляторы/батареи требуют дополнительной проверки перед отправкой." },
  { flag: "medical_drugs", patterns: [/лекарств/i, /медикамент/i, /таблетк/i, /medicine/i, /medication/i], action: "ESCALATE", reason: "Похоже на медикаменты — требуется ручная проверка." },
  { flag: "biomaterial", patterns: [/биоматериал/i, /анализ[а-я]* крови/i, /biomaterial/i], action: "ESCALATE", reason: "Похоже на биоматериалы — требуется ручная проверка." },
  { flag: "live_animals", patterns: [/животн/i, /щенк/i, /котят/i, /live animal/i], action: "ESCALATE", reason: "Похоже на живое существо — требуется ручная проверка условий перевозки." },
  { flag: "restricted_plants", patterns: [/растени/i, /семена/i, /rooted plant/i], action: "ESCALATE", reason: "Похоже на растения/посадочный материал — требуется ручная проверка." },
  { flag: "cash_valuables", patterns: [/наличн[а-я]* деньги/i, /крупн[а-я]* сумм/i, /золот/i, /ювелир/i, /jewel/i, /\bcash\b/i], action: "ESCALATE", reason: "Похоже на деньги/ювелирные изделия — требуется ручная проверка и усиленное подтверждение." },
  { flag: "alcohol_tobacco", patterns: [/алкогол/i, /сигарет/i, /табак/i, /alcohol/i, /tobacco/i], action: "ESCALATE", reason: "Похоже на алкоголь/табак — требуется ручная проверка (могут действовать ограничения)." },
];

const PERISHABLE_OR_TEMPERATURE_REASON = "Скоропортящийся груз или груз с температурным режимом — требуется подтверждение условий доставки.";
const HIGH_DECLARED_VALUE_THRESHOLD_SOM = 50_000;

function matchRule(text: string, rule: RiskRule): boolean {
  return rule.patterns.some((p) => p.test(text));
}

/** Pure: evaluate risk from raw text plus whatever the extractor already
 * found (fragile/perishable/temperature flags, declared value). Never
 * touches the database — the caller decides what to do with the result and
 * is responsible for the audit trail. */
export function evaluateShipmentRisk(text: string, extraction: Pick<ShipmentExtraction, "perishable" | "temperatureControlled" | "declaredValueSom">): RiskDecision {
  const flags: string[] = [];
  let blockedReason: string | null = null;
  let escalateReason: string | null = null;

  for (const rule of RISK_RULES) {
    if (!matchRule(text, rule)) continue;
    flags.push(rule.flag);
    if (rule.action === "BLOCK" && !blockedReason) blockedReason = rule.reason;
    if (rule.action === "ESCALATE" && !escalateReason) escalateReason = rule.reason;
  }

  if (extraction.perishable || extraction.temperatureControlled) {
    flags.push("temperature_or_perishable");
    if (!escalateReason) escalateReason = PERISHABLE_OR_TEMPERATURE_REASON;
  }

  if (extraction.declaredValueSom !== null && extraction.declaredValueSom >= HIGH_DECLARED_VALUE_THRESHOLD_SOM) {
    flags.push("high_declared_value");
    if (!escalateReason) escalateReason = `Заявленная стоимость ${extraction.declaredValueSom} сом — требуется усиленное подтверждение при передаче.`;
  }

  if (blockedReason) {
    return { level: "BLOCKED", action: "BLOCK", flags, reason: blockedReason };
  }
  if (escalateReason) {
    return { level: "ELEVATED", action: "ESCALATE", flags, reason: escalateReason };
  }
  return { level: "LOW", action: "ALLOW", flags: [], reason: null };
}
