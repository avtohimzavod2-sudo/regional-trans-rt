import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { extractTripMessage, type StopContext } from "@/lib/nlp/extract";
import { messages, detectLangFallback, type Lang } from "@/lib/i18n/messages";
import { sendTelegramDirectMessage, sendTelegramMessage } from "@/lib/messaging/telegram";
import { sendWhatsAppText } from "@/lib/messaging/whatsapp";
import { proposeMatchesForOffer, proposeMatchesForRequest } from "@/lib/matching/orchestrate";

// Kyrgyzstan does not observe DST; Asia/Bishkek is a fixed UTC+6 offset.
const BISHKEK_OFFSET = "+06:00";

const PILOT_CORRIDOR_KEY = "bishkek-karakol";

export async function getPilotCorridorStops(): Promise<StopContext[]> {
  const corridor = await db.corridor.findUnique({
    where: { key: PILOT_CORRIDOR_KEY },
    include: { stops: { orderBy: { order: "asc" } } },
  });
  if (!corridor) return [];
  return corridor.stops.map((s) => ({
    key: s.key,
    nameRu: s.nameRu,
    nameKy: s.nameKy,
    nameEn: s.nameEn,
    aliases: s.aliases,
  }));
}

function parseTravelDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00${BISHKEK_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function findOrCreatePassenger(whatsappId: string, lang: Lang) {
  return db.passenger.upsert({
    where: { whatsappId },
    update: {},
    create: { whatsappId, preferredLang: lang },
  });
}

async function findOrCreateDriver(telegramUserId: string, telegramUsername: string | null, lang: Lang) {
  return db.driver.upsert({
    where: { telegramUserId },
    update: telegramUsername ? { telegramUsername } : {},
    create: { telegramUserId, telegramUsername, preferredLang: lang },
  });
}

async function resolveStopIdByKey(key: string, corridorKey = PILOT_CORRIDOR_KEY): Promise<string | null> {
  const stop = await db.stop.findFirst({ where: { key, corridor: { key: corridorKey } } });
  return stop?.id ?? null;
}

export async function ingestPassengerMessage(whatsappId: string, text: string, rawMessageId?: string, notify = true) {
  const stops = await getPilotCorridorStops();
  const { result, origin, destination } = await extractTripMessage({
    text,
    stops,
    hint: "PASSENGER_LIKELY",
    today: new Date(),
  });
  const lang = (result.language ?? detectLangFallback(text)) as Lang;
  const passenger = await findOrCreatePassenger(whatsappId, lang);

  if (
    result.kind !== "PASSENGER_REQUEST" ||
    !origin ||
    !destination ||
    !result.travelDate ||
    !result.seats
  ) {
    if (notify) await sendWhatsAppText(whatsappId, messages.unrecognized[lang]);
    return null;
  }

  const travelDate = parseTravelDate(result.travelDate);
  if (!travelDate) {
    if (notify) await sendWhatsAppText(whatsappId, messages.unrecognized[lang]);
    return null;
  }

  const originStopId = await resolveStopIdByKey(origin.key);
  const destinationStopId = await resolveStopIdByKey(destination.key);
  if (!originStopId || !destinationStopId) {
    if (notify) await sendWhatsAppText(whatsappId, messages.unrecognized[lang]);
    return null;
  }

  const request = await db.tripRequest.create({
    data: {
      passengerId: passenger.id,
      originStopId,
      destinationStopId,
      travelDate,
      timeWindowStart: result.timeWindowStart,
      timeWindowEnd: result.timeWindowEnd,
      seats: result.seats,
      luggage: result.luggage,
      pickupPoint: result.pickupPoint,
      sourceChannel: "WHATSAPP",
      rawMessageId,
    },
    include: { origin: true, destination: true },
  });

  await logAction({
    actorType: "AGENT",
    action: "request.created",
    entityType: "TripRequest",
    entityId: request.id,
    details: { confidence: result.confidence },
  });

  if (notify) {
    await sendWhatsAppText(
      whatsappId,
      messages.requestReceived[lang](
        { ru: request.origin.nameRu, ky: request.origin.nameKy, en: request.origin.nameEn },
        { ru: request.destination.nameRu, ky: request.destination.nameKy, en: request.destination.nameEn },
        lang,
      ),
    );
  }

  await proposeMatchesForRequest(request.id);
  return request;
}

export async function ingestDriverPrivateMessage(
  telegramUserId: string,
  telegramUsername: string | null,
  text: string,
  rawMessageId?: string,
  notify = true,
) {
  const stops = await getPilotCorridorStops();
  const { result, origin, destination } = await extractTripMessage({
    text,
    stops,
    hint: "DRIVER_LIKELY",
    today: new Date(),
  });
  const lang = (result.language ?? detectLangFallback(text)) as Lang;
  const driver = await findOrCreateDriver(telegramUserId, telegramUsername, lang);

  if (result.kind !== "DRIVER_OFFER" || !origin || !destination || !result.travelDate || !result.seats) {
    if (notify) await sendTelegramMessage(telegramUserId, messages.unrecognized[lang]);
    return null;
  }

  const travelDate = parseTravelDate(result.travelDate);
  if (!travelDate) {
    if (notify) await sendTelegramMessage(telegramUserId, messages.unrecognized[lang]);
    return null;
  }

  const originStopId = await resolveStopIdByKey(origin.key);
  const destinationStopId = await resolveStopIdByKey(destination.key);
  if (!originStopId || !destinationStopId) {
    if (notify) await sendTelegramMessage(telegramUserId, messages.unrecognized[lang]);
    return null;
  }

  if (result.carInfo && !driver.carModel) {
    await db.driver.update({ where: { id: driver.id }, data: { carModel: result.carInfo } });
  }

  const offer = await db.driverOffer.create({
    data: {
      driverId: driver.id,
      originStopId,
      destinationStopId,
      travelDate,
      timeWindowStart: result.timeWindowStart,
      timeWindowEnd: result.timeWindowEnd,
      seatsTotal: result.seats,
      seatsAvailable: result.seats,
      sourceChannel: "TELEGRAM_BOT",
      rawMessageId,
    },
    include: { origin: true, destination: true },
  });

  await logAction({
    actorType: "AGENT",
    action: "offer.created",
    entityType: "DriverOffer",
    entityId: offer.id,
    details: { confidence: result.confidence },
  });

  if (notify) {
    await sendTelegramMessage(
      telegramUserId,
      messages.offerReceived[lang](
        { ru: offer.origin.nameRu, ky: offer.origin.nameKy, en: offer.origin.nameEn },
        { ru: offer.destination.nameRu, ky: offer.destination.nameKy, en: offer.destination.nameEn },
        lang,
        offer.seatsAvailable,
      ),
    );
  }

  if (driver.status === "ACTIVE") {
    await proposeMatchesForOffer(offer.id);
  }
  return offer;
}

export async function ingestAllowedGroupMessage(params: {
  telegramGroupId: string;
  chatId: string;
  senderId: string;
  senderUsername: string | null;
  text: string;
}) {
  const stops = await getPilotCorridorStops();
  const { result } = await extractTripMessage({ text: params.text, stops, hint: "UNKNOWN", today: new Date() });
  const lang = (result.language ?? detectLangFallback(params.text)) as Lang;

  const rawMessage = await db.rawMessage.create({
    data: {
      channel: "TELEGRAM_GROUP",
      chatId: params.chatId,
      telegramGroupId: params.telegramGroupId,
      senderId: params.senderId,
      text: params.text,
      detectedLanguage: lang,
      parseResult: result.kind,
      extractionConfidence: result.confidence,
      extractionRaw: result,
    },
  });

  if (result.kind === "UNRECOGNIZED") return rawMessage;

  // Never reply in the group and never expose the sender to other members.
  // Funnel drivers to the private bot flow, and passengers to WhatsApp.
  const invited = await sendTelegramDirectMessage(params.senderId, messages.groupDmInvite[lang]);

  await logAction({
    actorType: "AGENT",
    action: result.kind === "DRIVER_OFFER" ? "group.driver_announcement_detected" : "group.passenger_announcement_detected",
    entityType: "RawMessage",
    entityId: rawMessage.id,
    details: { invitedPrivately: invited, senderId: params.senderId },
  });

  return rawMessage;
}
