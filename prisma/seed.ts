import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
