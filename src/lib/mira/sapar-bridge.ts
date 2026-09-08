// The Mira-side half of the Mira <-> Sapar bridge. Unlike jolchu-bridge.ts
// (which maps Mira's structured entities into Jolchu's call inputs), Sapar
// runs its own extractShipmentFields() directly against the raw message
// (AGENTS spec s.40 — Sapar never trusts a second-hand extraction it can't
// verify itself), so this module's only job is composing Sapar's outward
// reply from a SaparResult without ever inventing a fact SaparResult didn't
// actually contain — mirrors reply-templates.ts's role for RT Command.
import type { Language, ShipmentStatus } from "@prisma/client";
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

// Price-label phrasing shared by the "here's an option" and "it's booked"
// replies — mock/sandbox prices must never read as a firm, official quote
// to the client (AGENTS hardening spec s.7/s.15).
function priceLine(result: SaparResult, language: Language): string | null {
  const price = result.recommendedQuote?.priceSom != null ? `${result.recommendedQuote.priceSom} сом` : null;
  if (!price) return null;
  const isMock = result.recommendedQuote?.isMockPricing === true;
  const isEstimate = result.recommendedQuote?.priceSource === "ESTIMATE";
  const label: Record<Language, string> = isMock
    ? { KY: "болжолдуу баасы (тест режими)", RU: "предварительная цена (тестовый расчёт)", EN: "estimated price (sandbox)" }
    : isEstimate
      ? { KY: "болжолдуу баасы", RU: "ориентировочная цена", EN: "estimated price" }
      : { KY: "баасы", RU: "цена", EN: "price" };
  return `${label[language] ?? label.RU}: ~${price}.`;
}

/** The "found a matching option, awaiting your confirmation" reply — this is
 * a recommendation, not a booking (spec s.3/s.32). Must always carry the
 * explicit confirm/reject actions so the client (and Mira) never treats
 * ranking as finalization. */
function offeredReply(result: SaparResult, language: Language): string {
  const pickupLabel: Record<Language, string> = { KY: "алуу убактысы", RU: "время забора", EN: "pickup time" };

  const introTemplates: Record<Language, string> = {
    KY: `Жүк №${result.publicId} үчүн вариант таптык.`,
    RU: `Нашли вариант доставки для заявки №${result.publicId}.`,
    EN: `Found a delivery option for shipment #${result.publicId}.`,
  };
  const parts: string[] = [introTemplates[language] ?? introTemplates.RU];

  const price = priceLine(result, language);
  if (price) parts.push(price);
  if (result.recommendedQuote?.estimatedPickupAt) {
    const label = pickupLabel[language] ?? pickupLabel.RU;
    parts.push(`${label}: ${result.recommendedQuote.estimatedPickupAt.toLocaleString("ru-RU")}.`);
  }

  const askTemplates: Record<Language, string> = {
    KY: "Ушул вариантты бекитебизби? [Ооба, макул] же [Башка вариант]",
    RU: "Подтверждаете этот вариант? [Подтвердить] или [Найти другой вариант]",
    EN: "Confirm this option? [Confirm] or [Find another option]",
  };
  parts.push(askTemplates[language] ?? askTemplates.RU);

  return parts.join(" ");
}

/** No compatible/available executor was found for this route (spec s.24) —
 * a structured outcome, not an invented promise of continued autonomous
 * search. */
function noExecutorReply(language: Language): string {
  const templates: Record<Language, string> = {
    KY: "Азырынча бул багыт үчүн ылайыктуу аткаруучу таппадык. Диспетчерге өткөрдүк, өзүнчө байланышабыз.",
    RU: "Пока не нашли подходящего исполнителя для этого маршрута. Передали диспетчеру — свяжемся отдельно.",
    EN: "We couldn't find a suitable courier for this route right now. We've flagged it to a dispatcher and will follow up.",
  };
  return templates[language] ?? templates.RU;
}

/** Cancelled because the customer rejected every offered option (spec s.4's
 * rejection path), as opposed to a risk-gate cancellation. */
function rejectedAllCancelledReply(language: Language): string {
  const templates: Record<Language, string> = {
    KY: "Жарайт, бул арызды жокко чыгарабыз. Кайра керек болсо, жазыңыз.",
    RU: "Хорошо, отменяем эту заявку. Если понадобится снова — напишите нам.",
    EN: "Understood, cancelling this request. Feel free to reach out again if you need it.",
  };
  return templates[language] ?? templates.RU;
}

/** The reply right after a customer confirms a priced quote — the shipment
 * is CONFIRMED but the Payment Gate is not yet open (AGENTS Sapargul spec
 * s.9/s.24). Never claims money arrived, never invents requisites: if
 * paymentInstructions is null (no destination configured yet, or pricing
 * still pending), the reply says so honestly instead of fabricating a QR. */
function paymentRequiredReply(result: SaparResult, language: Language): string {
  const acceptedTemplates: Record<Language, string> = {
    KY: `Жүк №${result.publicId} боюнча жеткирүү варианты бекитилди.`,
    RU: `Вариант доставки по заявке №${result.publicId} подтверждён.`,
    EN: `The delivery option for shipment #${result.publicId} is confirmed.`,
  };
  const parts: string[] = [acceptedTemplates[language] ?? acceptedTemplates.RU];

  const p = result.paymentInstructions;
  if (p) {
    const dueTemplates: Record<Language, string> = {
      KY: `Төлөө үчүн: ${p.amountSom} ${p.currency}.`,
      RU: `К оплате: ${p.amountSom} ${p.currency}.`,
      EN: `Amount due: ${p.amountSom} ${p.currency}.`,
    };
    parts.push(dueTemplates[language] ?? dueTemplates.RU);
    if (p.isSandbox) {
      const sandboxTemplates: Record<Language, string> = {
        KY: "(тест режими)",
        RU: "(тестовый режим)",
        EN: "(sandbox mode)",
      };
      parts.push(sandboxTemplates[language] ?? sandboxTemplates.RU);
    }
    if (p.instructionsText) parts.push(p.instructionsText);
    const afterPayTemplates: Record<Language, string> = {
      KY: "Төлөгөндөн кийин түбөртүктү жибере аласыз — келип түшкөнүн текшеребиз.",
      RU: "После оплаты можете отправить квитанцию — мы сверим поступление.",
      EN: "After paying, you can send the receipt — we'll verify the payment arrived.",
    };
    parts.push(afterPayTemplates[language] ?? afterPayTemplates.RU);
  } else {
    const preparingTemplates: Record<Language, string> = {
      KY: "Төлөм үчүн реквизиттерди даярдап жатабыз, жакында жиберебиз.",
      RU: "Готовим реквизиты для оплаты, скоро отправим.",
      EN: "We're preparing payment details and will send them shortly.",
    };
    parts.push(preparingTemplates[language] ?? preparingTemplates.RU);
  }

  return parts.join(" ");
}

function bookedReply(result: SaparResult, language: Language): string {
  const parts: string[] = [];
  const acceptedTemplates: Record<Language, string> = {
    KY: `Жүк №${result.publicId} бекитилди.`,
    RU: `Заявка №${result.publicId} подтверждена.`,
    EN: `Shipment #${result.publicId} confirmed.`,
  };
  parts.push(acceptedTemplates[language] ?? acceptedTemplates.RU);

  const price = priceLine(result, language);
  if (price) parts.push(price);
  if (result.recommendedQuote?.estimatedPickupAt) {
    const pickupLabel: Record<Language, string> = { KY: "алуу убактысы", RU: "время забора", EN: "pickup time" };
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

// Statuses where Sapar is still actively working the order with the
// customer inside the same chat — the ones after this (execution/terminal
// phase, e.g. AWAITING_PICKUP onward, or CANCELLED/FAILED) hand the turn
// back to Mira (Mira Pass 1 spec s.3's active_specialist concept, built
// directly on Sapar's own existing ShipmentStatus rather than a second,
// duplicate state machine).
const SAPAR_OWNED_STATUSES: ReadonlySet<ShipmentStatus> = new Set([
  "NEEDS_INFO",
  "READY_FOR_MATCHING",
  "SEARCHING",
  "QUOTED",
  "AWAITING_CONFIRMATION",
  "CONFIRMED",
]);

/** Whether Sapar still owns this conversation's next turn, derived from the
 * shipment's own status — see SAPAR_OWNED_STATUSES above. */
export function saparStillOwnsConversation(status: ShipmentStatus): boolean {
  return SAPAR_OWNED_STATUSES.has(status);
}

const INTRODUCE_SAPAR_LINE: Record<Language, string> = {
  KY: "Жүк маселеси боюнча RT'нин жүк адиси Сапарды ушул эле сүйлөшүүгө чакырдым, ал андан ары жардам берет.",
  RU: "По вопросу доставки подключаю к этому же чату Сапара — нашего специалиста по грузам, он поможет дальше.",
  EN: "For the delivery, I'm bringing Sapar — RT's cargo specialist — into this same chat; he'll take it from here.",
};

/** The one-time, visible "I'm inviting a specialist into this chat" line
 * (spec s.3/s.24-D: "Mira introduces Sapar visibly"). Callers prepend this
 * to composeSaparReply's output only on the turn where activeSpecialist
 * actually transitions MIRA -> SAPAR — never on every subsequent turn, so
 * the customer is never re-introduced to someone already in the
 * conversation. */
export function introduceSaparLine(language: Language): string {
  return INTRODUCE_SAPAR_LINE[language] ?? INTRODUCE_SAPAR_LINE.RU;
}

/** Deterministic Sapar reply text — never empty, never invents a fact
 * SaparResult doesn't actually carry (AGENTS spec s.40). This is what gets
 * sent when no AI paraphrase is layered on top, or as the safety fallback
 * if one is added later. */
export function composeSaparReply(result: SaparResult, language: Language): string {
  if (result.status === "CANCELLED") {
    // A risk-gate cancellation always carries a reason; a customer rejecting
    // every offered option does not (confirmation.ts's buildResult always
    // reports risk.reason: null) — that distinction picks the right template
    // without needing a separate field on SaparResult.
    return result.risk.reason ? cancelledReply(result.risk.reason, language) : rejectedAllCancelledReply(language);
  }
  if (result.status === "FAILED") return noExecutorReply(language);
  if (result.status === "NEEDS_INFO") return askMissingFields(result.missingFields, language);
  if (result.risk.action === "ESCALATE") return needsManualReviewReply(language);
  if (result.status === "AWAITING_CONFIRMATION") return offeredReply(result, language);
  // Confirmed but the Payment Gate hasn't opened yet — never say "booked"
  // here, that would imply money and execution already happened (AGENTS
  // Sapargul spec s.24/s.25). Everything from AWAITING_PICKUP onward has
  // passed the gate (spec s.16/s.43) and keeps the existing booked phrasing.
  if (result.status === "CONFIRMED") return paymentRequiredReply(result, language);
  return bookedReply(result, language);
}
