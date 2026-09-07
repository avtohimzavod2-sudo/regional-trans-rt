// The Mira-side half of the Mira <-> Sapar bridge. Unlike jolchu-bridge.ts
// (which maps Mira's structured entities into Jolchu's call inputs), Sapar
// runs its own extractShipmentFields() directly against the raw message
// (AGENTS spec s.40 — Sapar never trusts a second-hand extraction it can't
// verify itself), so this module's only job is composing Sapar's outward
// reply from a SaparResult without ever inventing a fact SaparResult didn't
// actually contain — mirrors reply-templates.ts's role for RT Command.
import type { Language } from "@prisma/client";
import type { RequiredShipmentField, SaparResult } from "@/lib/sapar/types";

const FIELD_QUESTION: Record<RequiredShipmentField, Record<Language, string>> = {
  pickupText: {
    KY: "кайдан алабыз",
    RU: "откуда забрать",
    EN: "where to pick up from",
  },
  destinationText: {
    KY: "кайда жеткиребиз",
    RU: "куда доставить",
    EN: "where to deliver to",
  },
  cargoDescription: {
    KY: "эмне жиберет жатасыз",
    RU: "что именно отправляете",
    EN: "what you're sending",
  },
};

const JOIN_WORD: Record<Language, string> = { KY: "жана", RU: "и", EN: "and" };

function askMissingFields(missing: RequiredShipmentField[], language: Language): string {
  const parts = missing.map((f) => FIELD_QUESTION[f][language] ?? FIELD_QUESTION[f].RU);
  const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} ${JOIN_WORD[language]} ${parts[parts.length - 1]}` : parts[0];
  const prefix: Record<Language, string> = {
    KY: `Жүктү уюштуруу үчүн айтып бериңизчи: ${joined}.`,
    RU: `Чтобы организовать доставку, уточните, пожалуйста: ${joined}.`,
    EN: `To arrange the delivery, could you tell me: ${joined}?`,
  };
  return prefix[language] ?? prefix.RU;
}

function cancelledReply(reason: string | null, language: Language): string {
  const templates: Record<Language, string> = {
    KY: "Кечиресиз, бул жүктү уюштура албайбыз.",
    RU: "К сожалению, RT не может организовать эту доставку.",
    EN: "Unfortunately, RT cannot arrange this delivery.",
  };
  const base = templates[language] ?? templates.RU;
  return reason ? `${base} (${reason})` : base;
}

function needsManualReviewReply(language: Language): string {
  const templates: Record<Language, string> = {
    KY: "Кабыл алдым, бирок бул жүк үчүн диспетчердин текшерүүсү керек. Азыр текшерип, кабарлайбыз.",
    RU: "Приняла заявку, но по этой доставке нужна ручная проверка диспетчера. Скоро подтвердим детали.",
    EN: "Got your request — this delivery needs a quick manual check by our dispatcher. We'll confirm shortly.",
  };
  return templates[language] ?? templates.RU;
}

function confirmedReply(result: SaparResult, language: Language): string {
  const priceLabel: Record<Language, string> = { KY: "болжолдуу баасы", RU: "ориентировочная цена", EN: "estimated price" };
  const pickupLabel: Record<Language, string> = { KY: "алуу убактысы", RU: "время забора", EN: "pickup time" };
  const price = result.recommendedQuote?.priceSom != null ? `${result.recommendedQuote.priceSom} сом` : null;
  const isEstimate = result.recommendedQuote?.priceSource === "ESTIMATE";

  const parts: string[] = [];
  const acceptedTemplates: Record<Language, string> = {
    KY: `Жүк №${result.publicId} кабыл алынды.`,
    RU: `Заявка №${result.publicId} принята.`,
    EN: `Shipment #${result.publicId} accepted.`,
  };
  parts.push(acceptedTemplates[language] ?? acceptedTemplates.RU);

  if (price) {
    const label = priceLabel[language] ?? priceLabel.RU;
    parts.push(isEstimate ? `${label}: ~${price}.` : `${label}: ${price}.`);
  }
  if (result.recommendedQuote?.estimatedPickupAt) {
    const label = pickupLabel[language] ?? pickupLabel.RU;
    parts.push(`${label}: ${result.recommendedQuote.estimatedPickupAt.toLocaleString("ru-RU")}.`);
  }
  if (result.assignedExecutorName) {
    const executorTemplates: Record<Language, string> = {
      KY: `Аткаруучу: ${result.assignedExecutorName}.`,
      RU: `Исполнитель: ${result.assignedExecutorName}.`,
      EN: `Courier: ${result.assignedExecutorName}.`,
    };
    parts.push(executorTemplates[language] ?? executorTemplates.RU);
  } else {
    const searchingTemplates: Record<Language, string> = {
      KY: "Ылайыктуу аткаруучуну азыр таап жатабыз.",
      RU: "Сейчас подбираем исполнителя.",
      EN: "We're matching a courier now.",
    };
    parts.push(searchingTemplates[language] ?? searchingTemplates.RU);
  }

  return parts.join(" ");
}

/** Deterministic Sapar reply text — never empty, never invents a fact
 * SaparResult doesn't actually carry (AGENTS spec s.40). This is what gets
 * sent when no AI paraphrase is layered on top, or as the safety fallback
 * if one is added later. */
export function composeSaparReply(result: SaparResult, language: Language): string {
  if (result.status === "CANCELLED") return cancelledReply(result.risk.reason, language);
  if (result.status === "NEEDS_INFO") return askMissingFields(result.missingFields, language);
  if (result.risk.action === "ESCALATE") return needsManualReviewReply(language);
  return confirmedReply(result, language);
}
