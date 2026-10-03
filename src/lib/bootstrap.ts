import { readFileSync } from "node:fs";
import path from "node:path";
import { count } from "drizzle-orm";
import { getDb, MIGRATIONS_DIR, type Db } from "@/lib/db/client";
import { adminUsers } from "@/lib/db/schema";
import { env, type Env } from "@/lib/env";
import { parseLegacyMenuJs, transformLegacy } from "@/lib/legacy/import";
import { isDatabaseEmpty, seedDatabase } from "@/lib/legacy/seed-db";
import { log } from "@/lib/log";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/security/password";

const g = globalThis as unknown as { __unipubBooted?: boolean };

/**
 * Runs once per server process: optional migrations, first-run import of the legacy menu
 * (local/staging, or SEED_IF_EMPTY), the first owner from ADMIN_LOGIN/ADMIN_PASSWORD, the
 * Telegram webhook (TELEGRAM_AUTO_WEBHOOK) and the inline outbox worker (WORKER_MODE=inline).
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
    if ((e.APP_ENV !== "production" || e.SEED_IF_EMPTY) && (await isDatabaseEmpty(db))) {
      const source = readFileSync(path.join(process.cwd(), "legacy/menu-data.js"), "utf8");
      const { seed } = transformLegacy(parseLegacyMenuJs(source));
      await seedDatabase(db, seed);
      log.info("empty database seeded from legacy menu");
    }
    await ensureOwner(db, e);
    if (e.WORKER_MODE === "inline") {
      const { startInlineWorker } = await import("@/lib/outbox/worker");
      startInlineWorker();
    }
  } catch (err) {
    log.error({ err }, "bootstrap failed");
  }
  if (e.TELEGRAM_AUTO_WEBHOOK)
    await ensureWebhook(e).catch((err) => log.error({ err }, "webhook setup failed"));
}

/** Only while there is no admin at all; afterwards the env pair is ignored. */
async function ensureOwner(db: Db, e: Env) {
  if (!e.ADMIN_LOGIN || !e.ADMIN_PASSWORD) return;
  const [row] = await db.select({ n: count() }).from(adminUsers);
  if (Number(row?.n) > 0) return;
  if (e.ADMIN_PASSWORD.length < MIN_PASSWORD_LENGTH) {
    log.error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);
    return;
  }
  const { normalizeLogin } = await import("@/lib/admin/auth");
  await db
    .insert(adminUsers)
    .values({
      login: normalizeLogin(e.ADMIN_LOGIN),
      name: "Владелец",
      passwordHash: await hashPassword(e.ADMIN_PASSWORD),
      role: "owner",
    })
    .onConflictDoNothing();
  log.info("first owner account created from ADMIN_LOGIN");
}

/** Points the bot at this server; skipped when Telegram already uses the same URL. */
async function ensureWebhook(e: Env) {
  if (!e.TELEGRAM_BOT_TOKEN || !e.TELEGRAM_WEBHOOK_SECRET) return;
  const url = new URL("/api/telegram/webhook", e.APP_URL);
  if (url.protocol !== "https:") return;
  const { Api } = await import("grammy");
  const api = new Api(
    e.TELEGRAM_BOT_TOKEN,
    e.TELEGRAM_API_ROOT ? { apiRoot: e.TELEGRAM_API_ROOT } : {},
  );
  const info = await api.getWebhookInfo();
  if (info.url === url.toString()) return;
  await api.setWebhook(url.toString(), {
    secret_token: e.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
  });
  log.info({ url: url.toString() }, "telegram webhook registered");
}
