// OPT-IN demo/test fixtures for the Market Acquisition Contractor dispatcher
// pages (PassengerProspect, BusinessProspect, AcquisitionOutreachEvent).
// These three pipelines start with zero real data, so their dispatcher pages
// have only ever been verified empty — this script exists solely to
// populate them for a populated-table UI check, nothing more.
//
// Never wired into `prisma db seed` / `npm run db:seed` (see prisma/seed.ts's
// own `prisma.seed` config, which points only at seed.ts) — this file only
// ever runs when explicitly invoked, so demo data can never silently mix
// into a normal seed/deploy flow.
//
// Every row this script creates goes through the SAME production write
// paths the real agents use (createPassengerProspect, createBusinessProspect,
// transitionBusinessProspectStatus, sendAcquisitionOutreach, recordOptOut —
// see src/lib/passenger-contractor/prospect.ts,
// src/lib/delivery-contractor/prospect.ts, src/lib/acquisition/outreach-log.ts)
// rather than a second, duplicate write path — the only additions are
// (a) the DEMO_FIXTURE_MARKER tag on every row's sourceGroupId/sourceRef/
// idempotencyKey, letting demo rows be told apart from and cleared
// independently of real ones, and (b) two direct status updates for
// PassengerProspect.QUALIFIED/SPAM, which currently have no dedicated
// transition helper of their own (dispatcher-triggered actions not yet
// built) — the same kind of literal field seeding prisma/seed.ts already
// does for its own bootstrap rows.
//
// sendAcquisitionOutreach is called with no ACQUISITION_OUTREACH_MODE
// override, so it runs under its safe default (DRY_RUN) exactly like
// production without a provider configured — this script refuses to run at
// all if the environment is set to LIVE, so it can never trigger a real
// send. Every OutreachStatus produced here (DRY_RUN, DO_NOT_CONTACT) is one
// the real pipeline can genuinely produce; none is fabricated (e.g. no fake
// SENT row is ever written).
//
// Usage:
//   npx tsx prisma/seed-acquisition-fixtures.ts          # create demo rows (idempotent — clears then recreates)
//   npx tsx prisma/seed-acquisition-fixtures.ts --clear  # delete only demo rows, leaves real data untouched
import { db } from "@/lib/db";
import { createPassengerProspect, markProspectContacted, markProspectConverted, markProspectDeclined } from "@/lib/passenger-contractor/prospect";
import { createBusinessProspect, transitionBusinessProspectStatus, linkBusinessProspectToPartner } from "@/lib/delivery-contractor/prospect";
import { sendAcquisitionOutreach, recordOptOut } from "@/lib/acquisition/outreach-log";
import type { PassengerSightingInput } from "@/lib/passenger-contractor/types";
import type { BusinessSightingInput } from "@/lib/delivery-contractor/types";

/** Tags every fixture row (sourceGroupId / sourceRef / idempotencyKey prefix)
 * so it can never be mistaken for a real prospect or outreach attempt, and
 * so `--clear` can remove exactly these rows and nothing else. */
export const DEMO_FIXTURE_MARKER = "demo-fixture";
const DEMO_TAG = "[DEMO]";

function demoPassengerInput(sourceText: string): PassengerSightingInput {
  return {
    sourceType: "INTERNAL",
    sourceGroupId: DEMO_FIXTURE_MARKER,
    sourceRef: DEMO_FIXTURE_MARKER,
    sourceText: `${DEMO_TAG} ${sourceText}`,
  };
}

function demoBusinessInput(sourceText: string, businessName: string): BusinessSightingInput {
  return {
    sourceType: "INTERNAL",
    sourceRef: DEMO_FIXTURE_MARKER,
    sourceText: `${DEMO_TAG} ${sourceText}`,
    businessName: `${DEMO_TAG} ${businessName}`,
  };
}

async function clearDemoFixtures() {
  const outreach = await db.acquisitionOutreachEvent.deleteMany({ where: { idempotencyKey: { startsWith: DEMO_FIXTURE_MARKER } } });
  const passengers = await db.passengerProspect.deleteMany({ where: { sourceGroupId: DEMO_FIXTURE_MARKER } });
  const businesses = await db.businessProspect.deleteMany({ where: { sourceRef: DEMO_FIXTURE_MARKER } });
  console.log(
    `Cleared demo fixtures: ${outreach.count} outreach event(s), ${passengers.count} passenger prospect(s), ${businesses.count} business prospect(s).`,
  );
}

async function seedPassengerProspectFixtures() {
  const contacted = await createPassengerProspect(demoPassengerInput("Ищу попутку Бишкек — Балыкчы на субботу, 2 места"));
  await markProspectContacted(contacted.id);

  const converted = await createPassengerProspect(demoPassengerInput("Еду в Чолпон-Ату в пятницу, ищу компанию на дорогу"));
  await markProspectConverted(converted.id, `${DEMO_FIXTURE_MARKER}-trip-1`);

  const declined = await createPassengerProspect(demoPassengerInput("Нужен попутчик до Каракола, но уже передумал ехать"));
  await markProspectDeclined(declined.id);

  const qualified = await createPassengerProspect(demoPassengerInput("Ищу машину до Бостери в воскресенье, готов подождать"));
  await db.passengerProspect.update({ where: { id: qualified.id }, data: { status: "QUALIFIED" } });

  const spam = await createPassengerProspect(demoPassengerInput("Выиграйте приз, перейдите по ссылке"));
  await db.passengerProspect.update({ where: { id: spam.id }, data: { status: "SPAM" } });

  await createPassengerProspect(demoPassengerInput("Ищу попутку Бишкек — Каракол на пятницу"));

  console.log("Seeded 6 demo PassengerProspect rows (NEW, CONTACTED, QUALIFIED, CONVERTED, DECLINED, SPAM).");
  return { contacted, declined };
}

async function seedBusinessProspectFixtures() {
  await createBusinessProspect(demoBusinessInput("Продаём продукты оптом, интересует доставка", "Демо Продукты"), "GROCERY");

  const contacted = await createBusinessProspect(demoBusinessInput("Хозтовары, ищем партнёра по доставке", "Демо Хозтовары"), "HOUSEHOLD_GOODS");
  await transitionBusinessProspectStatus(contacted.id, "CONTACTED");

  const qualified = await createBusinessProspect(demoBusinessInput("Интернет-магазин одежды, нужна логистика", "Демо Одежда Онлайн"), "CLOTHING");
  await transitionBusinessProspectStatus(qualified.id, "CONTACTED");
  await transitionBusinessProspectStatus(qualified.id, "QUALIFIED");

  const partnered = await createBusinessProspect(demoBusinessInput("Аптека, готовы сотрудничать по доставке заказов", "Демо Аптека"), "PHARMACY");
  await transitionBusinessProspectStatus(partnered.id, "CONTACTED");
  await transitionBusinessProspectStatus(partnered.id, "QUALIFIED");
  await transitionBusinessProspectStatus(partnered.id, "PARTNERED");
  await linkBusinessProspectToPartner(partnered.id, `${DEMO_FIXTURE_MARKER}-partner-1`);

  const declined = await createBusinessProspect(demoBusinessInput("Мебельный магазин, не заинтересованы", "Демо Мебель"), "FURNITURE");
  await transitionBusinessProspectStatus(declined.id, "DECLINED");

  const churned = await createBusinessProspect(demoBusinessInput("Цветочный магазин, был партнёром, прекратили", "Демо Цветы"), "FLOWERS");
  await transitionBusinessProspectStatus(churned.id, "CONTACTED");
  await transitionBusinessProspectStatus(churned.id, "QUALIFIED");
  await transitionBusinessProspectStatus(churned.id, "PARTNERED");
  await transitionBusinessProspectStatus(churned.id, "CHURNED");

  console.log("Seeded 6 demo BusinessProspect rows (PROSPECT, CONTACTED, QUALIFIED, PARTNERED, DECLINED, CHURNED).");
  return { qualified };
}

async function seedOutreachFixtures(passenger: { contacted: { id: string }; declined: { id: string } }, business: { qualified: { id: string } }) {
  await sendAcquisitionOutreach({
    contractorAgent: "PASSENGER_CONTRACTOR",
    prospectType: "PASSENGER",
    prospectRef: passenger.contacted.id,
    channel: "WHATSAPP",
    sourceType: "INTERNAL",
    sourceRef: DEMO_FIXTURE_MARKER,
    to: `${DEMO_FIXTURE_MARKER}-recipient`,
    text: `${DEMO_TAG} Здравствуйте! Мы RT — платформа для межгородских поездок. По вашему направлению уже есть водители.`,
    idempotencyKey: `${DEMO_FIXTURE_MARKER}:passenger:${passenger.contacted.id}:outreach-1`,
  });

  await recordOptOut({
    contractorAgent: "PASSENGER_CONTRACTOR",
    prospectType: "PASSENGER",
    prospectRef: passenger.declined.id,
    channel: "WHATSAPP",
    sourceType: "INTERNAL",
    idempotencyKey: `${DEMO_FIXTURE_MARKER}:passenger:${passenger.declined.id}:opt-out`,
  });

  await sendAcquisitionOutreach({
    contractorAgent: "DELIVERY_CONTRACTOR",
    prospectType: "BUSINESS",
    prospectRef: business.qualified.id,
    channel: "WHATSAPP",
    sourceType: "INTERNAL",
    sourceRef: DEMO_FIXTURE_MARKER,
    to: `${DEMO_FIXTURE_MARKER}-recipient`,
    text: `${DEMO_TAG} Здравствуйте! RT предлагает партнёрство по доставке заказов.`,
    idempotencyKey: `${DEMO_FIXTURE_MARKER}:business:${business.qualified.id}:outreach-1`,
  });

  // Driver Contractor's outreach log shares this same ledger. No ScoutCandidate
  // fixture is created here (out of scope for this pass) — prospectRef is a
  // clearly-tagged placeholder id, the same "loose correlation id" the schema
  // already documents (never a real foreign key), purely to populate this
  // page's own outreach-log table.
  await sendAcquisitionOutreach({
    contractorAgent: "DRIVER_CONTRACTOR",
    prospectType: "DRIVER",
    prospectRef: `${DEMO_FIXTURE_MARKER}-driver-candidate-1`,
    channel: "TELEGRAM_BOT",
    sourceType: "INTERNAL",
    sourceRef: DEMO_FIXTURE_MARKER,
    to: `${DEMO_FIXTURE_MARKER}-recipient`,
    text: `${DEMO_TAG} Здравствуйте! RT ищет водителей на маршрут Бишкек — Каракол.`,
    idempotencyKey: `${DEMO_FIXTURE_MARKER}:driver:1:outreach-1`,
  });

  console.log("Seeded 4 demo AcquisitionOutreachEvent rows (DRY_RUN x3, DO_NOT_CONTACT x1) across all three contractors.");
}

async function main() {
  const clearOnly = process.argv.includes("--clear");

  if ((process.env.ACQUISITION_OUTREACH_MODE ?? "").toUpperCase() === "LIVE") {
    throw new Error("Refusing to run: ACQUISITION_OUTREACH_MODE=LIVE. Demo fixtures must never risk a real outreach send — unset it or set DRY_RUN/SANDBOX first.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed/clear demo acquisition fixtures against a production environment.");
  }

  await clearDemoFixtures();
  if (clearOnly) return;

  const passenger = await seedPassengerProspectFixtures();
  const business = await seedBusinessProspectFixtures();
  await seedOutreachFixtures(passenger, business);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
