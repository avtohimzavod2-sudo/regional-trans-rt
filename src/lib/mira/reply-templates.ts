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

// Mira Professional Communication Pass s.2 — this completion wording is
// only honest because agents/support.ts's openSupportCase() sets
// Trip.status to CANCELLED synchronously, in the same call that opens the
// CANCELLATION-type SupportCase driving this outcome — by the time this
// text is composed, the cancellation is already verified backend state,
// not a pending request. If that atomic coupling ever changes (e.g. a
// review/confirmation step is introduced before Trip.status flips), this
// template must change with it to a "request received" wording instead.
const CANCELLATION_CASE_OPENED: Templates = {
  KY: "Жарайт, сапарыңызды жокко чыгардым. Дагы бир нерсе керек болсо — жазыңыз.",
  RU: "Хорошо, поездка отменена. Если понадобится что-то ещё — напишите.",
  EN: "Done — your trip is cancelled. Let me know if you need anything else.",
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

// Jolchu honesty (spec s.6/Test 8) — the route-intelligence check came back
// NEEDS_CONFIRMATION or PARTIAL: the geography named in the message is
// ambiguous or only partly resolved. Mira must ask, never guess an origin,
// destination, distance, or ETA from it.
const JOLCHU_CLARIFICATION_NEEDED: Templates = {
  KY: "Так түшүнө элекмин, кайдан жана кайда бараарыңызды бир аз тактап бере аласызбы? Мисалы, шаар/айылдын так атын жазыңыз.",
  RU: "Не совсем уверена, что правильно поняла маршрут — уточните, пожалуйста, точное название города/села отправления и назначения.",
  EN: "I'm not fully sure I understood the route — could you confirm the exact origin and destination city/village names?",
};

// Jolchu honesty (spec s.6/Test 9) — the route-intelligence check came back
// FAILED (e.g. both route providers unavailable). Mira must say so honestly
// rather than inventing distance/ETA/traffic from nothing.
const ROUTE_SERVICE_UNAVAILABLE: Templates = {
  KY: "Учурда маршрутту так текшере албай жатам (кызмат убактылуу жеткиликсиз). Бир аздан кийин кайра аракет кылыңызчы же так дарек/аталышты жазыңыз.",
  RU: "Сейчас не получается точно проверить маршрут — сервис временно недоступен. Попробуйте ещё раз чуть позже или напишите точное название населённого пункта.",
  EN: "I can't verify the route right now — the route service is temporarily unavailable. Please try again shortly, or give me the exact place names.",
};

// Honest coverage-gap (spec s.7/Test 10) — Jolchu genuinely understood the
// real-world geography (status RESOLVED), but RT Core has no structured
// corridor/stop covering it yet. This is a distinct, honest state from
// "I didn't understand your message" — never silently mapped onto whatever
// corridor RT happens to operate today.
const ROUTE_NOT_YET_COVERED: Templates = {
  KY: "Сиз айткан багытты түшүндүм, бирок RT азырынча так ушул багытта иштебейт. Жеткиликтүү багыттарды тактап берейинби?",
  RU: "Поняла ваш маршрут, но RT пока не работает именно по этому направлению. Подсказать, какие направления сейчас доступны?",
  EN: "I understood the route you mean, but RT doesn't yet operate that exact route. Want me to tell you which routes are currently available?",
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

/** Deterministic clarification request when Jolchu's route intelligence came
 * back NEEDS_CONFIRMATION or PARTIAL (spec s.6/Test 8) — never a confident
 * route/ETA built from ambiguous or incomplete geography. */
export function composeJolchuClarificationReply(language: Language): string {
  return pick(JOLCHU_CLARIFICATION_NEEDED, language);
}

/** Deterministic honest reply when Jolchu's route intelligence came back
 * FAILED, e.g. both route providers unavailable (spec s.6/Test 9) — never a
 * fabricated distance/ETA/traffic fact. */
export function composeRouteServiceUnavailableReply(language: Language): string {
  return pick(ROUTE_SERVICE_UNAVAILABLE, language);
}

/** Deterministic honest coverage-gap reply (spec s.7/Test 10): Jolchu
 * resolved real geography but RT Core has no structured corridor/stop for
 * it — distinct from "I didn't understand your message" and never silently
 * mapped onto an unrelated corridor RT does operate. */
export function composeRouteNotYetCoveredReply(language: Language): string {
  return pick(ROUTE_NOT_YET_COVERED, language);
}

/** Situation text for the honest coverage-gap case (spec s.7/Test 10): Jolchu
 * resolved the geography but RT Core has no structured corridor/stop for it.
 * Kept distinct from situationForOutcome("unrecognized") so a free-generated
 * reply, if used, doesn't imply Mira simply failed to parse the message. */
export function routeNotYetCoveredSituation(): string {
  return "Mira understood the real route the user described, but RT does not currently operate that exact route/corridor. Mira should say this honestly and never imply she misunderstood the message or invent an alternative route/ETA.";
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
      // Verified, not merely requested — see the CANCELLATION_CASE_OPENED
      // comment above: Trip.status is already CANCELLED by this point.
      return "The user's trip has been verified as cancelled at their request; this is a completed fact, not a pending one.";
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
