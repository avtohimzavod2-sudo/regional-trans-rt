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

function pick(t: Templates, language: Language): string {
  return t[language] ?? t.RU;
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
