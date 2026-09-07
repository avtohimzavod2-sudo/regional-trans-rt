import { PrismaClient, type Prisma } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { BENCHMARK_CASES } from "../src/lib/mira/training/benchmark-cases";
import { TRAINING_CORPUS } from "../src/lib/mira/training/corpus";

const db = new PrismaClient();

const PILOT_STOPS = [
  { key: "bishkek", nameRu: "Бишкек", nameKy: "Бишкек", nameEn: "Bishkek", order: 0, aliases: ["бишкек", "бишкекте", "bishkek"] },
  { key: "balykchy", nameRu: "Балыкчы", nameKy: "Балыкчы", nameEn: "Balykchy", order: 1, aliases: ["балыкчи", "балыкчы", "balykchy", "balykchi"] },
  { key: "cholpon-ata", nameRu: "Чолпон-Ата", nameKy: "Чолпон-Ата", nameEn: "Cholpon-Ata", order: 2, aliases: ["чолпоната", "чолпон ата", "cholponata"] },
  { key: "bosteri", nameRu: "Бостери", nameKy: "Бостери", nameEn: "Bosteri", order: 3, aliases: ["бостери", "bosteri"] },
  { key: "karakol", nameRu: "Каракол", nameKy: "Каракол", nameEn: "Karakol", order: 4, aliases: ["каракол", "karakol", "przhevalsk"] },
];

async function main() {
  const corridor = await db.corridor.upsert({
    where: { key: "bishkek-karakol" },
    update: {},
    create: {
      key: "bishkek-karakol",
      nameRu: "Бишкек — Каракол",
      nameKy: "Бишкек — Каракол",
      nameEn: "Bishkek — Karakol",
    },
  });

  for (const stop of PILOT_STOPS) {
    await db.stop.upsert({
      where: { corridorId_key: { corridorId: corridor.id, key: stop.key } },
      update: { nameRu: stop.nameRu, nameKy: stop.nameKy, nameEn: stop.nameEn, order: stop.order, aliases: stop.aliases },
      create: { ...stop, corridorId: corridor.id },
    });
  }

  const adminUsername = process.env.SEED_DISPATCHER_USERNAME ?? "admin";
  const adminPassword = process.env.SEED_DISPATCHER_PASSWORD ?? "changeme123";
  await db.dispatcherUser.upsert({
    where: { username: adminUsername },
    update: {},
    create: { username: adminUsername, passwordHash: hashPassword(adminPassword), role: "admin" },
  });

  console.log(`Seeded corridor "${corridor.nameRu}" with ${PILOT_STOPS.length} stops.`);
  console.log(`Dispatcher user ready: ${adminUsername} (password from SEED_DISPATCHER_PASSWORD or default "changeme123" — change it).`);

  // SAPARGUL — head treasurer account + a SANDBOX PaymentDestination so the
  // cargo Payment Gate has something to issue in dev/test without ever
  // touching real banking (AGENTS Sapargul spec s.8/s.27). Never seeds a
  // PRODUCTION destination — that must be configured by an admin with real,
  // approved requisites.
  const treasurerUsername = process.env.SEED_TREASURER_USERNAME ?? "treasurer";
  const treasurerPassword = process.env.SEED_TREASURER_PASSWORD ?? "changeme123";
  await db.dispatcherUser.upsert({
    where: { username: treasurerUsername },
    update: {},
    create: { username: treasurerUsername, passwordHash: hashPassword(treasurerPassword), role: "treasurer" },
  });
  console.log(`Treasurer dispatcher user ready: ${treasurerUsername} (password from SEED_TREASURER_PASSWORD or default "changeme123" — change it).`);

  const sandboxDestinationLabel = "RT Cargo — Sandbox";
  const existingSandboxDestination = await db.paymentDestination.findFirst({ where: { label: sandboxDestinationLabel, environment: "SANDBOX" } });
  if (!existingSandboxDestination) {
    await db.paymentDestination.create({
      data: {
        label: sandboxDestinationLabel,
        environment: "SANDBOX",
        method: "bank_transfer",
        accountReference: "SANDBOX-0000-TEST",
        instructionsText: "Тестовые реквизиты RT Cargo (песочница) — не для реальных платежей.",
        isActive: true,
      },
    });
    console.log(`Seeded sandbox PaymentDestination "${sandboxDestinationLabel}".`);
  }

  // TYYIN — human accountant + owner dispatcher accounts (AGENTS Tyyin
  // spec s.18/s.24/s.28-s.30). "accountant" may record/close an
  // AccountantCase resolution; "owner" gets OWNER_DIRECT_CALL read-only
  // financial visibility on the Tyyin dashboard. Neither role can ever
  // trigger outgoing money movement — that capability does not exist in
  // Tyyin's code, not just its permissions (see src/lib/tyyin/bank-adapter.ts).
  const accountantUsername = process.env.SEED_ACCOUNTANT_USERNAME ?? "accountant";
  const accountantPassword = process.env.SEED_ACCOUNTANT_PASSWORD ?? "changeme123";
  await db.dispatcherUser.upsert({
    where: { username: accountantUsername },
    update: {},
    create: { username: accountantUsername, passwordHash: hashPassword(accountantPassword), role: "accountant" },
  });
  console.log(`Accountant dispatcher user ready: ${accountantUsername} (password from SEED_ACCOUNTANT_PASSWORD or default "changeme123" — change it).`);

  const ownerUsername = process.env.SEED_OWNER_USERNAME ?? "owner";
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? "changeme123";
  await db.dispatcherUser.upsert({
    where: { username: ownerUsername },
    update: {},
    create: { username: ownerUsername, passwordHash: hashPassword(ownerPassword), role: "owner" },
  });
  console.log(`Owner dispatcher user ready: ${ownerUsername} (password from SEED_OWNER_PASSWORD or default "changeme123" — change it).`);

  // ARTUR — Founder dispatcher account (AGENTS Master Architecture spec
  // s.16/s.28). "founder" is the top of role.ts's FOUNDER_ROLES; it is the
  // only role that may decide on a weekly strategic initiative or be the
  // recorded recipient of an emergency escalation. "admin" already carries
  // the same authorization as an operational break-glass (see role.ts).
  const founderUsername = process.env.SEED_FOUNDER_USERNAME ?? "founder";
  const founderPassword = process.env.SEED_FOUNDER_PASSWORD ?? "changeme123";
  await db.dispatcherUser.upsert({
    where: { username: founderUsername },
    update: {},
    create: { username: founderUsername, passwordHash: hashPassword(founderPassword), role: "founder" },
  });
  console.log(`Founder dispatcher user ready: ${founderUsername} (password from SEED_FOUNDER_PASSWORD or default "changeme123" — change it).`);

  // MIRA KYRGYZ TRAINING — synthetic-only seed data. Idempotent: benchmark
  // cases upsert by their unique `code`; training examples are skipped if
  // an entry with the same `input` already exists. Never seeds real user
  // conversation data — see src/lib/mira/training/provenance.ts.
  for (const c of BENCHMARK_CASES) {
    await db.miraBenchmarkCase.upsert({
      where: { code: c.code },
      update: {
        input: c.input,
        inputType: c.inputType,
        expectedRole: c.expectedRole,
        expectedIntent: c.expectedIntent,
        expectedLanguage: c.expectedLanguage,
        expectedNormalizedData: c.expectedNormalizedData as Prisma.InputJsonValue | undefined,
        difficulty: c.difficulty,
        dialect: c.dialect,
        containsTypos: c.containsTypos ?? false,
        containsRussianMix: c.containsRussianMix ?? false,
        containsMissingKyrgyzLetters: c.containsMissingKyrgyzLetters ?? false,
        containsVoice: c.containsVoice ?? false,
        sourceClass: c.sourceClass,
        privacyStatus: c.privacyStatus,
        humanVerified: c.humanVerified,
        tags: c.tags,
      },
      create: {
        code: c.code,
        input: c.input,
        inputType: c.inputType,
        expectedRole: c.expectedRole,
        expectedIntent: c.expectedIntent,
        expectedLanguage: c.expectedLanguage,
        expectedNormalizedData: c.expectedNormalizedData as Prisma.InputJsonValue | undefined,
        difficulty: c.difficulty,
        dialect: c.dialect,
        containsTypos: c.containsTypos ?? false,
        containsRussianMix: c.containsRussianMix ?? false,
        containsMissingKyrgyzLetters: c.containsMissingKyrgyzLetters ?? false,
        containsVoice: c.containsVoice ?? false,
        sourceClass: c.sourceClass,
        privacyStatus: c.privacyStatus,
        humanVerified: c.humanVerified,
        tags: c.tags,
      },
    });
  }

  let trainingExamplesCreated = 0;
  for (const entry of TRAINING_CORPUS) {
    const existing = await db.miraTrainingExample.findFirst({ where: { input: entry.input } });
    if (existing) continue;
    await db.miraTrainingExample.create({
      data: {
        level: entry.level,
        category: entry.category,
        input: entry.input,
        inputType: entry.inputType,
        language: entry.language,
        dialect: entry.dialect,
        containsTypos: entry.containsTypos ?? false,
        containsRussianMix: entry.containsRussianMix ?? false,
        containsMissingKyrgyzLetters: entry.containsMissingKyrgyzLetters ?? false,
        expectedRole: entry.expectedRole,
        expectedIntent: entry.expectedIntent,
        expectedNormalizedData: entry.expectedNormalizedData as Prisma.InputJsonValue | undefined,
        source: entry.provenance.source,
        sourceType: entry.provenance.sourceType,
        license: entry.provenance.license,
        verified: false,
        reviewedByHuman: false,
        allowedForTraining: entry.provenance.allowedForTraining,
        allowedForEvaluation: entry.provenance.allowedForEvaluation,
        privacyStatus: entry.provenance.privacyStatus,
        notes: entry.notes,
      },
    });
    trainingExamplesCreated++;
  }

  console.log(`Seeded ${BENCHMARK_CASES.length} RT Kyrgyz Benchmark cases (upserted).`);
  console.log(`Seeded ${trainingExamplesCreated} new synthetic training examples (${TRAINING_CORPUS.length - trainingExamplesCreated} already present).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
