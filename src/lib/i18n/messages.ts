export type Lang = "RU" | "KY" | "EN";

export interface StopNames {
  ru: string;
  ky: string;
  en: string;
}

function stopName(stop: StopNames, lang: Lang): string {
  if (lang === "RU") return stop.ru;
  if (lang === "KY") return stop.ky;
  return stop.en;
}

export const messages = {
  welcomePassenger: {
    RU: "Здравствуйте! Это Regional Trans — сервис подбора попутных поездок. Напишите, откуда и куда вы едете, дату, время и сколько мест нужно.",
    KY: "Саламатсызбы! Бул Regional Trans — жол өнөктөштөрдү тандоо кызматы. Кайдан кайда бара турганыңызды, күнүн, убактысын жана канча орун керектигин жазыңыз.",
    EN: "Hello! This is Regional Trans, a ride-matching service. Please tell us your origin, destination, date, time, and number of seats needed.",
  },
  welcomeDriver: {
    RU: "Здравствуйте! Это Regional Trans — бот для водителей. Укажите маршрут, дату, время выезда, количество свободных мест и марку/номер автомобиля.",
    KY: "Саламатсызбы! Бул Regional Trans — айдоочулар үчүн бот. Багытты, күнүн, чыгуу убактысын, бош орундардын санын жана унаанын маркасын/номерин жазыңыз.",
    EN: "Hello! This is the Regional Trans driver bot. Please share your route, date, departure time, available seats, and car model/plate.",
  },
  requestReceived: {
    RU: (from: StopNames, to: StopNames, lang: Lang) =>
      `Принято: ${stopName(from, lang)} → ${stopName(to, lang)}. Ищем подходящего водителя, сообщим, как только найдём.`,
    KY: (from: StopNames, to: StopNames, lang: Lang) =>
      `Кабыл алынды: ${stopName(from, lang)} → ${stopName(to, lang)}. Ылайыктуу айдоочуну издеп жатабыз, тапкан замат билдиребиз.`,
    EN: (from: StopNames, to: StopNames, lang: Lang) =>
      `Got it: ${stopName(from, lang)} → ${stopName(to, lang)}. We're looking for a suitable driver and will let you know as soon as we find one.`,
  },
  offerReceived: {
    RU: (from: StopNames, to: StopNames, lang: Lang, seats: number) =>
      `Принято: ${stopName(from, lang)} → ${stopName(to, lang)}, свободных мест: ${seats}. Как только появится подходящий пассажир, пришлём заявку.`,
    KY: (from: StopNames, to: StopNames, lang: Lang, seats: number) =>
      `Кабыл алынды: ${stopName(from, lang)} → ${stopName(to, lang)}, бош орун: ${seats}. Ылайыктуу жүргүнчү табылганда сизге билдиребиз.`,
    EN: (from: StopNames, to: StopNames, lang: Lang, seats: number) =>
      `Got it: ${stopName(from, lang)} → ${stopName(to, lang)}, ${seats} seat(s) available. We'll send you a request as soon as a matching passenger appears.`,
  },
  proposalToDriver: {
    RU: (from: StopNames, to: StopNames, lang: Lang, date: string, seats: number) =>
      `Новая заявка пассажира: ${stopName(from, lang)} → ${stopName(to, lang)}, ${date}, мест: ${seats}. Подтвердить поездку? Контакт пассажира будет передан только после вашего подтверждения.`,
    KY: (from: StopNames, to: StopNames, lang: Lang, date: string, seats: number) =>
      `Жүргүнчүнүн жаңы арызы: ${stopName(from, lang)} → ${stopName(to, lang)}, ${date}, орун: ${seats}. Сапарды ырастайсызбы? Жүргүнчүнүн байланышы сиз ырастагандан кийин гана берилет.`,
    EN: (from: StopNames, to: StopNames, lang: Lang, date: string, seats: number) =>
      `New passenger request: ${stopName(from, lang)} → ${stopName(to, lang)}, ${date}, seats: ${seats}. Confirm this trip? The passenger's contact will only be shared after you confirm.`,
  },
  proposalToPassenger: {
    RU: (from: StopNames, to: StopNames, lang: Lang, date: string) =>
      `Найден водитель на ваш маршрут: ${stopName(from, lang)} → ${stopName(to, lang)}, ${date}. Подтвердить поездку? Контакт водителя будет передан только после вашего подтверждения.`,
    KY: (from: StopNames, to: StopNames, lang: Lang, date: string) =>
      `Сиздин багыт боюнча айдоочу табылды: ${stopName(from, lang)} → ${stopName(to, lang)}, ${date}. Сапарды ырастайсызбы? Айдоочунун байланышы сиз ырастагандан кийин гана берилет.`,
    EN: (from: StopNames, to: StopNames, lang: Lang, date: string) =>
      `A driver was found for your route: ${stopName(from, lang)} → ${stopName(to, lang)}, ${date}. Confirm this trip? The driver's contact will only be shared after you confirm.`,
  },
  waitingForOtherSide: {
    RU: "Спасибо! Ждём подтверждения от второй стороны, сообщим сразу после этого.",
    KY: "Рахмат! Экинчи тараптан ырастоо күтүп жатабыз, дароо билдиребиз.",
    EN: "Thank you! We're waiting for confirmation from the other side and will let you know right away.",
  },
  contactRevealedToDriver: {
    RU: (name: string, phone: string, pickup: string | null) =>
      `Поездка подтверждена! Пассажир: ${name}, телефон: ${phone}.${pickup ? ` Место посадки: ${pickup}.` : ""} Договор перевозки заключается напрямую между вами и пассажиром. Regional Trans — информационный посредник и не является перевозчиком.`,
    KY: (name: string, phone: string, pickup: string | null) =>
      `Сапар ырасталды! Жүргүнчү: ${name}, телефон: ${phone}.${pickup ? ` Отуруу жери: ${pickup}.` : ""} Ташуу келишими сиз менен жүргүнчүнүн ортосунда түздөн-түз түзүлөт. Regional Trans — маалыматтык ортомчу жана ташуучу эмес.`,
    EN: (name: string, phone: string, pickup: string | null) =>
      `Trip confirmed! Passenger: ${name}, phone: ${phone}.${pickup ? ` Pickup point: ${pickup}.` : ""} The carriage contract is formed directly between you and the passenger. Regional Trans is an information intermediary and not a carrier.`,
  },
  contactRevealedToPassenger: {
    RU: (name: string, phone: string, car: string | null) =>
      `Поездка подтверждена! Водитель: ${name}, телефон: ${phone}.${car ? ` Автомобиль: ${car}.` : ""} Договор перевозки заключается напрямую между вами и водителем. Regional Trans — информационный посредник и не является перевозчиком.`,
    KY: (name: string, phone: string, car: string | null) =>
      `Сапар ырасталды! Айдоочу: ${name}, телефон: ${phone}.${car ? ` Унаа: ${car}.` : ""} Ташуу келишими сиз менен айдоочунун ортосунда түздөн-түз түзүлөт. Regional Trans — маалыматтык ортомчу жана ташуучу эмес.`,
    EN: (name: string, phone: string, car: string | null) =>
      `Trip confirmed! Driver: ${name}, phone: ${phone}.${car ? ` Car: ${car}.` : ""} The carriage contract is formed directly between you and the driver. Regional Trans is an information intermediary and not a carrier.`,
  },
  declinedTryNext: {
    RU: "Хорошо, ищем другой вариант.",
    KY: "Макул, башка вариант издеп жатабыз.",
    EN: "Understood, we're looking for another option.",
  },
  noCandidatesYet: {
    RU: "Пока подходящих вариантов нет. Как только появятся, мы вам сразу напишем.",
    KY: "Азырынча ылайыктуу вариант жок. Пайда болушу менен дароо жазабыз.",
    EN: "No matching options yet. We'll message you as soon as one appears.",
  },
  driverResponseTimedOut: {
    RU: "Время на подтверждение этой заявки истекло, поэтому мы предложили её другому водителю.",
    KY: "Бул арызды ырастоого берилген убакыт бүттү, андыктан аны башка айдоочуга сунуштадык.",
    EN: "Your time to respond to this request has expired, so we've offered it to another driver.",
  },
  passengerResponseTimedOutForDriver: {
    RU: "Пассажир не успел подтвердить поездку вовремя. Ищем для вас другого пассажира на этот рейс.",
    KY: "Жүргүнчү сапарды өз убагында ырастай алган жок. Бул рейске башка жүргүнчү издеп жатабыз.",
    EN: "The passenger didn't confirm in time. We're looking for another passenger for this trip.",
  },
  passengerResponseTimedOut: {
    RU: "Время на подтверждение поездки истекло. Продолжаем искать вам подходящего водителя.",
    KY: "Сапарды ырастоого берилген убакыт бүттү. Сизге ылайыктуу айдоочу издөөнү улантып жатабыз.",
    EN: "Your time to confirm this trip has expired. We're continuing to look for a suitable driver for you.",
  },
  unrecognized: {
    RU: "Не удалось распознать заявку. Укажите, пожалуйста: откуда, куда, дату, время, количество мест.",
    KY: "Арызды таанып билүү мүмкүн болгон жок. Сураныч, кайдан, кайда, күнүн, убактысын, орун санын жазыңыз.",
    EN: "We couldn't parse that as a trip request. Please specify: origin, destination, date, time, and number of seats.",
  },
  groupDmInvite: {
    RU: "Здравствуйте! Мы увидели ваше объявление в группе. Чтобы безопасно и без спама подобрать поездку, напишите нам, пожалуйста, напрямую сюда, в этот чат.",
    KY: "Саламатсызбы! Топтогу жарыяңызды көрдүк. Коопсуз жана спамсыз сапар табуу үчүн бул жерге, ушул чатка түздөн-түз жазып коюңузчу.",
    EN: "Hello! We saw your post in the group. To match you safely and without spam, please message us directly here in this chat.",
  },
} as const;

export function detectLangFallback(text: string): Lang {
  if (/[өүң]/i.test(text)) return "KY";
  if (/[а-яё]/i.test(text)) return "RU";
  return "EN";
}
