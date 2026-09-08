// Mira's honesty guard (Mira Pass 1 spec s.6): a free-generated reply must
// never assert a concrete fact Mira has no verified backend data for. The
// deterministic templates in reply-templates.ts already prove this is
// possible without ever stating a price, seat count, phone number, vehicle,
// booking/payment/parcel status, or RT Point availability — this module is
// the machine-checkable version of that same rule, applied to whatever text
// a live AI provider generates. Pure, deterministic, no I/O.

export type VerifiableFact =
  | "price"
  | "availableDrivers"
  | "availableSeats"
  | "bookingConfirmation"
  | "departureTime"
  | "arrivalTime"
  | "paymentStatus"
  | "parcelAcceptance"
  | "phoneNumber"
  | "vehicleData"
  | "rtPointAvailability";

export interface HonestyCheckResult {
  violations: VerifiableFact[];
  safe: boolean;
}

interface ClaimPattern {
  fact: VerifiableFact;
  patterns: RegExp[];
}

// Each pattern matches a reply *asserting* the fact, not a user *asking*
// about it — e.g. "3 seats available" is a claim, "how many seats?" is not.
const CLAIM_PATTERNS: ClaimPattern[] = [
  {
    fact: "price",
    patterns: [
      /\d[\d\s]*\s*(сом|som|руб(?:л[ья])?|₽|kgs)\b/i,
      /(баасы|цена|стоимость|price)\s*[:\-]?\s*\d/i,
    ],
  },
  {
    fact: "availableDrivers",
    patterns: [
      /(айдоочу|водител[ья]|driver)\s+(табылды|найден[аы]?|бар экен|is\s+available|has\s+been\s+found|found\b)/i,
      /(found|нашла|нашли)\s+(a\s+)?(driver|айдоочу|водител[ья])/i,
    ],
  },
  {
    fact: "availableSeats",
    patterns: [
      /\d+\s*(орун|мест[оа]?)\s+(бар|калды|калган|свободн\w*|доступн\w*)/i,
      /\d+\s*seats?\s+(available|left|remaining)/i,
    ],
  },
  {
    fact: "bookingConfirmation",
    patterns: [
      /брондолду|бронь\s+подтвержд\w*|забронирован\w*|подтвердил[аи]?\s+(вашу\s+)?(поездку|бронь)/i,
      /booking\s+(is\s+)?confirmed|confirmed\s+your\s+(trip|booking|ride)/i,
    ],
  },
  {
    fact: "departureTime",
    patterns: [
      /(жолго\s+чыгат|чыгуу\s+убактысы|отправлени[ея]|выезжа\w*)\s*[:\-]?\s*саат\s*\d|(отправлени[ея]|выезжа\w*)\s+в\s+\d{1,2}[:.]\d{2}/i,
      /departs?\s+at\s+\d{1,2}[:.]\d{2}/i,
    ],
  },
  {
    fact: "arrivalTime",
    patterns: [
      /(жетет|келет)\s+саат\s*\d|прибыти[ея]\s+в\s+\d{1,2}[:.]\d{2}/i,
      /arrives?\s+at\s+\d{1,2}[:.]\d{2}/i,
    ],
  },
  {
    fact: "paymentStatus",
    patterns: [
      /төлөм\s+(кабыл алынды|болду|өттү)|оплата\s+(получена|прошла|подтверждена|поступила)/i,
      /payment\s+(received|confirmed|successful|has\s+gone\s+through)/i,
    ],
  },
  {
    fact: "parcelAcceptance",
    patterns: [/посылка\s+(кабыл алынды|принята)|parcel\s+(has\s+been\s+)?accepted/i],
  },
  {
    fact: "phoneNumber",
    patterns: [/(\+?\d[\d\s-]{6,}\d)/],
  },
  {
    fact: "vehicleData",
    patterns: [
      /\b(toyota|lada|hyundai|kia|daewoo|honda|chevrolet|nissan|vaz|ваз)\s+[a-zа-я0-9]+/i,
      /(номер|plate)\s*[:\-]?\s*\d{2}\s?[a-zа-я]{2,3}\s?\d{2,4}/i,
    ],
  },
  {
    fact: "rtPointAvailability",
    patterns: [/rt\s*point[^.!?]{0,30}(бар|свобод\w*|available|доступ\w*)/i],
  },
];

/** Scans a candidate reply for claims about facts Mira must never invent.
 * `knownFacts` lists facts the caller has actually verified against backend
 * data for this reply (e.g. a real seat count from the matched trip) — those
 * are exempted so Mira can still state facts she genuinely knows. Facts not
 * listed are treated as unverified: any claim about them is a violation. */
export function detectUnverifiedClaims(
  replyText: string,
  knownFacts: ReadonlySet<VerifiableFact> = new Set(),
): HonestyCheckResult {
  const violations: VerifiableFact[] = [];
  for (const { fact, patterns } of CLAIM_PATTERNS) {
    if (knownFacts.has(fact)) continue;
    if (patterns.some((p) => p.test(replyText))) violations.push(fact);
  }
  return { violations, safe: violations.length === 0 };
}
