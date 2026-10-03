import { readFileSync } from "node:fs";
import path from "node:path";
import { getDb, MIGRATIONS_DIR } from "@/lib/db/client";
import { env } from "@/lib/env";
import { parseLegacyMenuJs, transformLegacy } from "@/lib/legacy/import";
import { isDatabaseEmpty, seedDatabase } from "@/lib/legacy/seed-db";
import { log } from "@/lib/log";

const g = globalThis as unknown as { __unipubBooted?: boolean };

/**
 * Runs once per server process: optional migrations, first-run import of the legacy menu
 * (local/staging), and the inline outbox worker when WORKER_MODE=inline.
 */
export async function bootstrap() {
  if (g.__unipubBooted) return;
  g.__unipubBooted = true;
  const e = env();
  try {
    if (e.DATABASE_URL && e.AUTO_MIGRATE) {
      const { default: postgres } = await import("postgres");
      const { drizzle } = await import("drizzle-orm/postgres-js");
      const { migrate } = await import("drizzle-orm/postgres-js/migrator");
      const client = postgres(e.DATABASE_URL, { max: 1 });
      await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS_DIR });
      await client.end({ timeout: 5 });
    }
    const db = await getDb();
    if (e.APP_ENV !== "production" && (await isDatabaseEmpty(db))) {
      const source = readFileSync(path.join(process.cwd(), "legacy/menu-data.js"), "utf8");
      const { seed } = transformLegacy(parseLegacyMenuJs(source));
      await seedDatabase(db, seed);
      log.info("empty database seeded from legacy menu");
    }
    if (e.WORKER_MODE === "inline") {
      const { startInlineWorker } = await import("@/lib/outbox/worker");
      startInlineWorker();
    }
  } catch (err) {
    log.error({ err }, "bootstrap failed");
  }
}
