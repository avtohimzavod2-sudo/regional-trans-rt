import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { extractTripMessage, type StopContext } from "@/lib/nlp/extract";
import { messages, detectLangFallback, type Lang } from "@/lib/i18n/messages";
import { sendTelegramDirectMessage, sendTelegramMessage } from "@/lib/messaging/telegram";
import { sendWhatsAppText } from "@/lib/messaging/whatsapp";
import { proposeMatchesForRequest } from "@/lib/matching/orchestrate";
import { notifySupplyAvailable, resolveSupplyForDispatcher } from "@/lib/rt-office/orchestrator";
import { rootContext, logAgentAction } from "@/lib/agents/trace";

// Kyrgyzstan does not observe DST; Asia/Bishkek is a fixed UTC+6 offset.
const BISHKEK_OFFSET = "+06:00";

// A Stop's `key` (e.g. "bishkek") is only unique within its own corridor
// (schema: @@unique([corridorId, key])) — RT now operates more than one
// corridor, so the flat list handed to NLP extraction must disambiguate
// stops that share a key across corridors. The composite "<corridorKey>:<stopKey>"
// is an opaque identifier as far as extraction is concerned (extract.ts never
// parses it, only matches it back verbatim) and is unpacked again in
// resolveStopIdByKey below.
function compositeStopKey(corridorKey: string, stopKey: string): string {
  return `${corridorKey}:${stopKey}`;
}

export async function getActiveCorridorStops(): Promise<StopContext[]> {
  const corridors = await db.corridor.findMany({
    where: { isActive: true },
    include: { stops: { orderBy: { order: "asc" } } },
  });
  return corridors.flatMap((corridor) =>
    corridor.stops.map((s) => ({
      key: compositeStopKey(corridor.key, s.key),
      nameRu: s.nameRu,
      nameKy: s.nameKy,
      nameEn: s.nameEn,
      aliases: s.aliases,
    })),
  );
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

async function resolveStopIdByKey(compositeKey: string): Promise<string | null> {
  const separatorIndex = compositeKey.indexOf(":");
  if (separatorIndex === -1) return null;
  const corridorKey = compositeKey.slice(0, separatorIndex);
  const stopKey = compositeKey.slice(separatorIndex + 1);

  const stop = await db.stop.findFirst({ where: { key: stopKey, corridor: { key: corridorKey, isActive: true } } });
  return stop?.id ?? null;
}

export async function ingestPassengerMessage(whatsappId: string, text: string, rawMessageId?: string, notify = true) {
  const stops = await getActiveCorridorStops();
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

  const match = await proposeMatchesForRequest(request.id);
  if (!match) {
    // Spec s.8 — RT OFFICE must be the one to recognize (and audit) that no
    // verified supply exists yet for this request, distinct from MATCH's own
    // silent "no candidate" outcome. Re-reads the same live tables (no second
    // matching engine, no invented facts) purely to make the gap observable.
    const ctx = rootContext();
    const supply = await resolveSupplyForDispatcher(request.id);
    await logAgentAction({
      ctx,
      agent: "RT_OFFICE",
      action: "rt_office.no_verified_supply_yet",
      entityType: "TripRequest",
      entityId: request.id,
      details: { hasCandidateSupply: supply.hasCandidateSupply },
    });
  }
  return request;
}

export async function ingestDriverPrivateMessage(
  telegramUserId: string,
  telegramUsername: string | null,
  text: string,
  rawMessageId?: string,
  notify = true,
) {
  const stops = await getActiveCorridorStops();
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
    // Spec s.8 — RT OFFICE, not this ingest path, owns "supply reported"
    // recognition; it re-triggers RT Core's existing MATCH agent itself
    // (agents/match.ts -> matching/orchestrate.ts) rather than this file
    // calling MATCH directly, so there's exactly one entrypoint for reacting
    // to newly-available supply regardless of how it was reported.
    await notifySupplyAvailable({ offerId: offer.id, reportedBy: "DRIVER_REPORT" });
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
  const stops = await getActiveCorridorStops();
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
