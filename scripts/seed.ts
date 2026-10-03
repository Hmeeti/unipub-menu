/**
 * Imports the legacy menu (legacy/menu-data.js + legacy/menu.json) into the database,
 * verifies counts/prices/allergens against the source and writes docs/import-report.md.
 *
 *   npm run db:seed            # uses DATABASE_URL, or the local PGlite database
 *   npm run db:seed -- --check # dry run: report only, no writes
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { count, inArray, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db/client";
import { itemAllergens, items, adminUsers } from "@/lib/db/schema";
import {
  parseLegacyMenuJs,
  renderReport,
  transformLegacy,
  type LegacyData,
} from "@/lib/legacy/import";
import { seedDatabase } from "@/lib/legacy/seed-db";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/security/password";

const root = process.cwd();
const dryRun = process.argv.includes("--check");

async function main() {
  const primary = parseLegacyMenuJs(readFileSync(path.join(root, "legacy/menu-data.js"), "utf8"));
  const secondary = JSON.parse(
    readFileSync(path.join(root, "legacy/menu.json"), "utf8"),
  ) as LegacyData;
  const { seed, report } = transformLegacy(primary, secondary);

  mkdirSync(path.join(root, "docs"), { recursive: true });
  writeFileSync(path.join(root, "docs/import-report.md"), renderReport(report), "utf8");
  console.log(renderReport(report));
  if (dryRun) return;

  const db = await getDb();
  const version = await seedDatabase(db, seed);

  const [itemCount] = await db.select({ n: count() }).from(items);
  const [priceSum] = await db
    .select({ s: sql<string>`coalesce(sum(${items.price}), 0)` })
    .from(items)
    .where(
      inArray(
        items.id,
        seed.items.map((i) => i.id),
      ),
    );
  const [links] = await db.select({ n: count() }).from(itemAllergens);
  const checks = [
    ["блюд", Number(itemCount?.n), report.counts.items],
    ["сумма цен", Number(priceSum?.s), report.counts.priceSum],
    ["связей аллергенов", Number(links?.n), report.counts.allergenLinks],
  ] as const;
  let ok = true;
  for (const [label, actual, expected] of checks) {
    const pass = actual >= expected && (label !== "сумма цен" || actual === expected);
    ok &&= pass;
    console.log(`${pass ? "✓" : "✗"} ${label}: в БД ${actual}, в источнике ${expected}`);
  }
  console.log(version ? `Опубликована версия меню #${version.id}` : "Без публикации");

  const login = process.env.ADMIN_LOGIN;
  const password = process.env.ADMIN_PASSWORD;
  if (login && password) {
    if (password.length < MIN_PASSWORD_LENGTH)
      throw new Error(`ADMIN_PASSWORD must be ≥ ${MIN_PASSWORD_LENGTH} chars`);
    await db
      .insert(adminUsers)
      .values({
        login,
        name: "Владелец",
        passwordHash: await hashPassword(password),
        role: "owner",
      })
      .onConflictDoNothing();
    console.log(`Владелец «${login}» создан (если его не было)`);
  }
  if (!ok) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
