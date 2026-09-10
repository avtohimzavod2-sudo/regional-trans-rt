// RT OFFICE — Driver Live Signals / Telemetry ingestion. Single new
// entrypoint tying together the flow:
//   driver Telegram text -> classifyDriverTelemetryText (deterministic, no
//   LLM guess) -> CRM Auto's append-only fact log (recordOperationalEvent /
//   openBreakdownIncident / resolveBreakdownIncident) -> when a signal
//   changes real Trip/DriverOffer state, the existing exclusive write
//   surface in matching/orchestrate.ts -> when a real route fact is needed
//   (ETA_REQUEST), Jolchu's resolveRouteIntelligence.
//
// This module owns no state of its own: no new Prisma model, no second
// fleet/snapshot engine, no self-computed ETA, no LLM-derived operational
// fact. It never sends anything itself — RT OFFICE has no external-
// communication capability (see boundary.test.ts) — it only returns a plain
// driver-facing reply string for Mira's own sendReply() to deliver.
import { db } from "@/lib/db";
import type { Language } from "@prisma/client";
import { logAgentAction, rootContext } from "@/lib/agents/trace";
import type { Lang } from "@/lib/i18n/messages";
import { classifyDriverTelemetryText, type DriverTelemetrySignalType } from "./telemetry-classify";
import { findEventByIdempotencyKey, operationalHistoryForArtur } from "@/lib/crm-auto/bridge";
import { openBreakdownIncident, recordOperationalEvent, resolveBreakdownIncident } from "@/lib/crm-auto/orchestrator";
import { handleDriverBreakdown, markTripCompletedByDriverReport, markTripDeparted, setDriverReportedSeatsAvailable } from "@/lib/matching/orchestrate";
import { resolveRouteIntelligence } from "@/lib/jolchu/orchestrator";
import {
  NON_TERMINAL_TRIP_STATUSES,
  OPEN_OFFER_STATUSES,
  selectCurrentContext,
  type OfferWithStops,
  type TripWithOffer,
} from "./fleet-picture";

export interface DriverTelemetryIngestParams {
  telegramUserId: string;
  rawText: string;
  /** The channel's own message id (e.g. Telegram update.message.message_id),
   * when the caller has one — the real basis for duplicate-delivery
   * idempotency. Falls back to the trace id only when the channel genuinely
   * has none, which only protects against duplicates within a single
   * process call, not a real retried delivery. */
  rawMessageId?: string;
}

export interface DriverTelemetryIngestOutcome {
  signalType: DriverTelemetrySignalType;
  deduplicated: boolean;
  replyText: string;
}

function pickLang(lang: Language): Lang {
  return lang;
}

function t(lang: Lang, ru: string, ky: string, en: string): string {
  return lang === "KY" ? ky : lang === "EN" ? en : ru;
}

// Mirrors driver-detail.ts's exact three-query "current context" resolution
// (spec: never a second snapshot engine) — same selectCurrentContext rule
// the bulk Live Fleet Picture path uses, just resolved for one driver via
// direct findFirst reads instead of the bulk Map lookups.
async function resolveDriverCurrentContext(driverId: string) {
  const [nonTerminalTrip, openOffer, fallbackTrip] = await Promise.all([
    db.trip.findFirst({
      where: { driverId, status: { in: [...NON_TERMINAL_TRIP_STATUSES] } },
      orderBy: { createdAt: "desc" },
      include: { driverOffer: { include: { origin: true, destination: true } } },
    }),
    db.driverOffer.findFirst({
      where: { driverId, status: { in: [...OPEN_OFFER_STATUSES] } },
      orderBy: { createdAt: "desc" },
      include: { origin: true, destination: true },
    }),
    db.trip.findFirst({
      where: { driverId },
      orderBy: { createdAt: "desc" },
      include: { driverOffer: { include: { origin: true, destination: true } } },
    }),
  ]);

  return selectCurrentContext(
    nonTerminalTrip as TripWithOffer | null,
    openOffer as OfferWithStops | null,
    fallbackTrip as TripWithOffer | null,
  );
}

// Jolchu needs a real origin description; the only truthful one available
// here is the driver's own most recent verified LOCATION_UPDATE report —
// never a guess, never the offer's origin stop (that is where the driver
// started, not where they are now).
async function lastKnownLocationText(driverId: string): Promise<string | null> {
  const recent = await operationalHistoryForArtur(driverId, 50);
  for (const event of recent) {
    const details = event.details as { signalType?: string; freeText?: string } | null;
    if (details?.signalType === "LOCATION_UPDATE" && details.freeText) return details.freeText;
  }
  return null;
}

/**
 * Ingest one piece of driver free-text as an operational telemetry signal.
 * Returns null when the text does not clearly match any of the 11 known
 * signals (spec rule #4: never guess) — callers must fall through to normal
 * handling in that case, not invent a reply.
 */
export async function ingestDriverTelemetryText(params: DriverTelemetryIngestParams): Promise<DriverTelemetryIngestOutcome | null> {
  const classification = classifyDriverTelemetryText(params.rawText);
  if (!classification.signalType) return null;
  const signalType = classification.signalType;

  // Never auto-register a driver from a free-text message — a signal only
  // ever applies to an already-known, already-verified driver record.
  const driver = await db.driver.findUnique({ where: { telegramUserId: params.telegramUserId } });
  if (!driver) return null;

  const lang = pickLang(driver.preferredLang);
  const ctx = rootContext();
  const idempotencyKey = `driver-telemetry:${driver.id}:${signalType}:${params.rawMessageId ?? ctx.traceId}`;

  // Mandatory pre-check (spec rule #10: duplicate delivery must be a safe
  // no-op). Must run before openBreakdownIncident/resolveBreakdownIncident,
  // whose own business-rule checks (canOpenBreakdown/canResolveBreakdown)
  // would otherwise misread a genuine replay as a conflicting new report.
  const existing = await findEventByIdempotencyKey(idempotencyKey);
  if (existing) {
    await logAgentAction({
      ctx,
      agent: "RT_OFFICE",
      action: "rt_office.telemetry_duplicate_ignored",
      entityType: "DriveCrmEvent",
      entityId: existing.id,
      details: { driverId: driver.id, signalType },
    });
    return {
      signalType,
      deduplicated: true,
      replyText: t(lang, "Уже записано, повторно не применяю.", "Мурда эле катталган, кайра колдонбойм.", "Already recorded, not applying it again."),
    };
  }

  const context = await resolveDriverCurrentContext(driver.id);
  const offerId = context.offer?.id;
  const tripId = context.tripId ?? undefined;

  let replyText: string;

  switch (signalType) {
    case "ON_DUTY":
    case "WAITING_PASSENGERS": {
      await recordOperationalEvent({
        driverId: driver.id,
        offerId,
        tripId,
        eventType: "OPERATIONAL_HISTORY",
        source: "DRIVER_REPORT",
        details: { signalType },
        idempotencyKey,
      });
      replyText = t(lang, "Принято.", "Кабыл алынды.", "Got it.");
      break;
    }

    case "DEPARTED": {
      await recordOperationalEvent({
        driverId: driver.id,
        offerId,
        tripId,
        eventType: "OPERATIONAL_HISTORY",
        source: "DRIVER_REPORT",
        details: { signalType },
        idempotencyKey,
      });
      if (tripId) {
        await markTripDeparted(tripId);
        replyText = t(lang, "Записал, что вы выехали. Счастливого пути!", "Жолго чыкканыңызды жаздым. Ак жол!", "Marked as departed. Safe travels!");
      } else {
        replyText = t(lang, "Записал сообщение, но активный рейс не найден.", "Кабарды жаздым, бирок активдүү сапар табылган жок.", "Recorded, but no active trip was found.");
      }
      break;
    }

    case "ARRIVED": {
      // A verified arrival is itself the ETA fact (0 minutes remaining) —
      // never inferred from elapsed time, only from this explicit report.
      await recordOperationalEvent({
        driverId: driver.id,
        offerId,
        tripId,
        eventType: "OPERATIONAL_ETA",
        etaMinutes: 0,
        source: "DRIVER_REPORT",
        details: { signalType, arrived: true },
        idempotencyKey,
      });
      replyText = t(lang, "Записал прибытие.", "Жетишиңизди жаздым.", "Arrival recorded.");
      break;
    }

    case "TRIP_COMPLETED": {
      await recordOperationalEvent({
        driverId: driver.id,
        offerId,
        tripId,
        eventType: "OPERATIONAL_HISTORY",
        source: "DRIVER_REPORT",
        details: { signalType },
        idempotencyKey,
      });
      if (tripId) {
        await markTripCompletedByDriverReport(tripId);
        replyText = t(lang, "Рейс закрыт, спасибо!", "Сапар жабылды, рахмат!", "Trip closed, thank you!");
      } else {
        replyText = t(lang, "Записал сообщение, но активный рейс не найден.", "Кабарды жаздым, бирок активдүү сапар табылган жок.", "Recorded, but no active trip was found.");
      }
      break;
    }

    case "SEATS_UPDATED": {
      await recordOperationalEvent({
        driverId: driver.id,
        offerId,
        tripId,
        eventType: "OPERATIONAL_HISTORY",
        source: "DRIVER_REPORT",
        details: { signalType, reportedSeats: classification.seatsAvailable ?? null },
        idempotencyKey,
      });
      if (offerId && classification.seatsAvailable !== undefined) {
        const result = await setDriverReportedSeatsAvailable(offerId, classification.seatsAvailable);
        replyText = t(lang, `Обновил свободные места: ${result.seatsAvailable}.`, `Бош орундар жаңыртылды: ${result.seatsAvailable}.`, `Updated free seats: ${result.seatsAvailable}.`);
      } else {
        replyText = t(lang, "Записал сообщение, но активное объявление не найдено.", "Кабарды жаздым, бирок активдүү жарыя табылган жок.", "Recorded, but no active offer was found.");
      }
      break;
    }

    case "DELAYED": {
      // Never flips operational state or invents an ETA from a delay report
      // alone (spec rule #2/#3) — recorded as history only. A real updated
      // ETA only ever comes from an ETA_REQUEST resolved through Jolchu.
      await recordOperationalEvent({
        driverId: driver.id,
        offerId,
        tripId,
        eventType: "OPERATIONAL_HISTORY",
        source: "DRIVER_REPORT",
        details: { signalType, driverReportedDelayMinutes: classification.delayMinutes ?? null },
        idempotencyKey,
      });
      replyText = t(lang, "Записал задержку, диспетчер видит это.", "Кечигүүнү жаздым, диспетчер көрөт.", "Delay recorded, dispatch can see it.");
      break;
    }

    case "BREAKDOWN_OPENED": {
      try {
        await openBreakdownIncident({
          driverId: driver.id,
          source: "DRIVER_REPORT",
          idempotencyKey,
          details: { tripId, offerId, rawText: params.rawText },
        });
        // CRM Auto only records the fact (its write boundary forbids
        // touching Trip/Match/DriverOffer itself) — this is the one call
        // site translating a freshly-opened breakdown into the actual
        // booking-lifecycle reaction (spec s.7F): cancel this driver's
        // active bookings and rematch their stranded passengers. Only runs
        // on the success path, so a redelivered/duplicate BREAKDOWN_OPENED
        // against an already-open incident (caught below) can't re-trigger
        // a second round of cancellations.
        await handleDriverBreakdown(driver.id);
        replyText = t(lang, "Записал поломку, диспетчер уведомлён.", "Бузулганды жаздым, диспетчер кабардар болду.", "Breakdown recorded, dispatch has been notified.");
      } catch {
        await logAgentAction({ ctx, agent: "RT_OFFICE", action: "rt_office.telemetry_rejected", entityType: "Driver", entityId: driver.id, details: { signalType } });
        replyText = t(lang, "У вас уже открыта незакрытая поломка.", "Сизде мурунтан эле ачык бузулуу бар.", "You already have an open breakdown on file.");
      }
      break;
    }

    case "BREAKDOWN_RESOLVED": {
      try {
        await resolveBreakdownIncident({
          driverId: driver.id,
          source: "DRIVER_REPORT",
          idempotencyKey,
          details: { tripId, offerId, rawText: params.rawText },
        });
        replyText = t(lang, "Отлично, записал устранение поломки.", "Мыкты, бузулуунун жоюлганын жаздым.", "Great, breakdown resolution recorded.");
      } catch {
        await logAgentAction({ ctx, agent: "RT_OFFICE", action: "rt_office.telemetry_rejected", entityType: "Driver", entityId: driver.id, details: { signalType } });
        replyText = t(lang, "Открытой поломки не найдено.", "Ачык бузулуу табылган жок.", "No open breakdown was found.");
      }
      break;
    }

    case "LOCATION_UPDATE": {
      await recordOperationalEvent({
        driverId: driver.id,
        offerId,
        tripId,
        eventType: "OPERATIONAL_HISTORY",
        source: "DRIVER_REPORT",
        details: { signalType, freeText: classification.freeText },
        idempotencyKey,
      });
      replyText = t(lang, "Записал местоположение.", "Жайгашкан жериңизди жаздым.", "Location recorded.");
      break;
    }

    case "ETA_REQUEST": {
      const destinationText = context.offer?.destination?.nameRu ?? null;
      const originText = await lastKnownLocationText(driver.id);

      if (!destinationText || !originText) {
        replyText = t(
          lang,
          "Не хватает данных для запроса ETA у Жолчу — пришлите вашу текущую геолокацию.",
          "Жолчудан ETA сурашка маалымат жетишсиз — учурдагы жайгашкан жериңизди жиберип коюңуз.",
          "Not enough data to ask Jolchu for an ETA — please send your current location first.",
        );
        break;
      }

      const routeResult = await resolveRouteIntelligence({
        reasonCode: "ROUTE_CALCULATION",
        origin: originText,
        destination: destinationText,
        ctx,
      });
      const etaMinutes = routeResult.route?.trafficAwareDurationMin ?? routeResult.route?.estimatedDurationMin ?? null;

      if (routeResult.status === "RESOLVED" && etaMinutes !== null) {
        await recordOperationalEvent({
          driverId: driver.id,
          offerId,
          tripId,
          eventType: "OPERATIONAL_ETA",
          etaMinutes,
          source: "JOLCHU",
          details: { signalType, requestedBy: "DRIVER" },
          idempotencyKey,
        });
        replyText = t(lang, `Жолчу: ETA примерно ${etaMinutes} мин.`, `Жолчу: болжолдуу ETA ${etaMinutes} мүн.`, `Jolchu: ETA is about ${etaMinutes} min.`);
      } else {
        // Never fabricate an ETA on a failed/ambiguous Jolchu result — any
        // previously recorded ETA simply stays as-is and will surface as
        // stale via the existing freshness computation, not as a new fact.
        replyText = t(
          lang,
          "Жолчу пока не смог посчитать ETA, попробуйте ещё раз позже.",
          "Жолчу азырынча ETAны эсептей алган жок, бир аздан кийин кайра аракет кылыңыз.",
          "Jolchu could not calculate an ETA right now, please try again later.",
        );
      }
      break;
    }
  }

  await logAgentAction({
    ctx,
    agent: "RT_OFFICE",
    action: "rt_office.telemetry_recorded",
    entityType: "Driver",
    entityId: driver.id,
    details: { signalType, tripId: tripId ?? null, offerId: offerId ?? null },
  });

  return { signalType, deduplicated: false, replyText };
}
