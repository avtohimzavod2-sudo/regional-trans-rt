// Deterministic, provider-independent reply text Mira falls back to when no
// AI provider call is made (mock provider default) or when a live provider
// call fails. This is the guaranteed floor — Mira must always be able to
// answer, per AGENTS.md ("text must always remain a fallback"). Phrased as
// Mira herself speaking; never mentions an internal agent by name.
import type { Language } from "@prisma/client";
import type { CommandResult } from "@/lib/agents/command";

type Templates = Record<Language, string>;

const TRIP_REQUEST_CREATED: Templates = {
  KY: "Кабыл алдым, сапарды издеп жатам. Ылайыктуу айдоочу табылганда дароо жазам.",
  RU: "Приняла заявку, ищу подходящего водителя. Как только найду — сразу напишу.",
  EN: "Got your request — I'm looking for a suitable driver and will message you as soon as I find one.",
};

const DRIVER_OFFER_CREATED: Templates = {
  KY: "Сапарыңызды жаздым, ылайыктуу жүргүнчү издеп жатам.",
  RU: "Записала вашу поездку, ищу подходящего пассажира.",
  EN: "Got your trip — I'm looking for a matching passenger now.",
};

const CANCELLATION_CASE_OPENED: Templates = {
  KY: "Кабыл алдым, сапарды жокко чыгардым. Дагы бир нерсе керек болсо — жазыңыз.",
  RU: "Хорошо, отменила поездку. Если понадобится что-то ещё — напишите.",
  EN: "Understood, I've cancelled the trip. Let me know if you need anything else.",
};

const UNRECOGNIZED_NEEDS_ROUTE: Templates = {
  KY: "Толук түшүнө элекмин. Сураныч, кайдан, кайда, качан жана канча орун керек экенин жазыңыз.",
  RU: "Не совсем поняла заявку. Уточните, пожалуйста: откуда, куда, когда и сколько мест нужно.",
  EN: "I didn't quite catch that. Could you tell me the origin, destination, date, and how many seats you need?",
};

const GROUP_MESSAGE_RECORDED: Templates = {
  KY: "Топто көрдүм, азыр жеке жазам.",
  RU: "Увидела в группе, сейчас напишу вам лично.",
  EN: "Saw your message in the group, I'll message you privately now.",
};

const GENERIC_ACK: Templates = {
  KY: "Кабыл алдым.",
  RU: "Приняла.",
  EN: "Got it.",
};

// Mira Pass 1 spec s.18/s.20 — Mira is not a cashier: she may acknowledge a
// finance/payment question but never takes a payment action herself.
const FINANCE_ACK: Templates = {
  KY: "Каржы маселеси боюнча сурооңузду жаздым, аны жооптуу адис карайт.",
  RU: "Записала ваш вопрос по оплате — им займётся ответственный специалист.",
  EN: "I've noted your payment question — a specialist will follow up on it.",
};

// Mira Pass 1 spec s.7 — a partner/business inquiry is acknowledged, not
// routed into any new "RT OFFICE" logic that doesn't exist yet.
const PARTNER_ACK: Templates = {
  KY: "Кызматташуу боюнча кайрылганыңыз үчүн рахмат, сурооңузду жаздым, сиз менен байланышышат.",
  RU: "Спасибо за обращение по сотрудничеству — записала ваш вопрос, с вами свяжутся.",
  EN: "Thanks for reaching out about a partnership — I've noted this and someone will contact you.",
};

// Mira Pass 1 spec s.12 — closes the ask-once decline-reason exchange once a
// category has been captured; never re-opens the question.
const DECLINE_REASON_ACK: Templates = {
  KY: "Түшүндүм, рахмат! Сизге дагы бир ылайыктуу айдоочу издеп берем.",
  RU: "Поняла, спасибо! Поищу для вас другого подходящего водителя.",
  EN: "Got it, thank you! I'll look for another suitable driver for you.",
};

function pick(t: Templates, language: Language): string {
  return t[language] ?? t.RU;
}

// Mira Pass 1 spec s.13-s.17 — RT's own significant-excess baggage fee,
// stated plainly and never merged with the driver's own separate surcharge
// (spec s.15/s.16: two distinct concepts, never one number).
function baggageExcessNoteText(language: Language, amountSom: number): string {
  switch (language) {
    case "KY":
      return `Байкадым, жүгүңүз көбүрөөк салмакта экен. RT тараптан кошумча жүк үчүн ${amountSom} сом алынат (бул сумма айдоочунун өз төлөмүн камтыбайт).`;
    case "EN":
      return `I noticed your baggage is over the usual amount — RT's own extra-baggage fee is ${amountSom} KGS (this doesn't include any separate charge the driver may set).`;
    case "RU":
    default:
      return `Заметила, что багажа больше обычного. Со стороны RT доплата за лишний вес — ${amountSom} сом (это отдельно от возможной доплаты водителя).`;
  }
}

/** Deterministic customer-facing note for RT's own significant-excess
 * baggage fee (spec s.16) — never invents or merges in the driver's
 * separate surcharge. */
export function composeBaggageExcessNote(language: Language, amountSom: number): string {
  return baggageExcessNoteText(language, amountSom);
}

/** Deterministic reply text for a CommandResult outcome, in the given
 * language. This is what Mira sends when no provider call is made or one
 * fails — never empty, never throws. */
export function composeFallbackReply(outcome: CommandResult["outcome"], language: Language): string {
  switch (outcome) {
    case "trip_request_created":
      return pick(TRIP_REQUEST_CREATED, language);
    case "driver_offer_created":
      return pick(DRIVER_OFFER_CREATED, language);
    case "cancellation_case_opened":
      return pick(CANCELLATION_CASE_OPENED, language);
    case "group_message_recorded":
      return pick(GROUP_MESSAGE_RECORDED, language);
    case "unrecognized":
      return pick(UNRECOGNIZED_NEEDS_ROUTE, language);
    case "group_message_skipped":
      return pick(GENERIC_ACK, language);
    default:
      return pick(GENERIC_ACK, language);
  }
}

/** Deterministic acknowledgement for a finance/payment question — never a
 * payment action (spec s.18/s.20). */
export function composeFinanceAcknowledgement(language: Language): string {
  return pick(FINANCE_ACK, language);
}

/** Deterministic acknowledgement for a partner/business inquiry (spec s.7 —
 * no RT OFFICE routing exists yet, this is a neutral acknowledgement only). */
export function composePartnerAcknowledgement(language: Language): string {
  return pick(PARTNER_ACK, language);
}

/** Deterministic acknowledgement after a decline-reason category has been
 * captured (spec s.12) — closes the exchange, never re-asks. */
export function composeDeclineReasonAcknowledgement(language: Language): string {
  return pick(DECLINE_REASON_ACK, language);
}

/** Short internal situation description handed to the AI provider so it can
 * phrase a more natural version of the same fact — never invents facts
 * beyond what the outcome already tells us. */
export function situationForOutcome(outcome: CommandResult["outcome"]): string {
  switch (outcome) {
    case "trip_request_created":
      return "The user's trip request was accepted and Mira is now searching for a matching driver.";
    case "driver_offer_created":
      return "The driver's offer was accepted and Mira is now searching for a matching passenger.";
    case "cancellation_case_opened":
      return "The user's trip was cancelled at their request.";
    case "group_message_recorded":
      return "Mira saw the user's post in a group chat and is now inviting them to continue privately.";
    case "unrecognized":
      return "Mira could not extract a route/date/seat count from the message and needs to ask for the missing details.";
    case "group_message_skipped":
      return "The group message was noise and needs only a neutral acknowledgment, if anything.";
    default:
      return "Acknowledge the message neutrally.";
  }
}
