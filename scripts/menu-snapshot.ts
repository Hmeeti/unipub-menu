/**
 * Build-time snapshot of the public menu for the static (GitHub Pages) build.
 *
 *   MENU_DATABASE_URL set → the published menu of that database (use a read-only role);
 *   otherwise             → the legacy seed imported into a throwaway in-memory database.
 *
 * Writes `.menu-snapshot.json`; the static page reads it, so the menu works without a backend.
 * Without NEXT_PUBLIC_API_URL online ordering/booking/songs are switched off in the snapshot and
 * the page offers "call the waiter" instead.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import type { PublicMenu } from "@/lib/domain/types";
import { parseLegacyMenuJs, transformLegacy, type LegacyData } from "@/lib/legacy/import";
import { seedDatabase } from "@/lib/legacy/seed-db";
import { composePublicMenu } from "@/lib/menu/repository";

const SNAPSHOT_FILE = path.join(process.cwd(), ".menu-snapshot.json");

async function fromDatabase(url: string): Promise<PublicMenu | null> {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const client = postgres(url, { max: 1, connect_timeout: 15 });
  try {
    return await composePublicMenu(drizzle({ client, schema }) as unknown as Db);
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function fromSeed(): Promise<PublicMenu | null> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const root = process.cwd();
  const primary = parseLegacyMenuJs(readFileSync(path.join(root, "legacy/menu-data.js"), "utf8"));
  const secondary = JSON.parse(
    readFileSync(path.join(root, "legacy/menu.json"), "utf8"),
  ) as LegacyData;
  const client = new PGlite();
  try {
    const pdb = drizzle({ client, schema });
    await migrate(pdb, { migrationsFolder: path.join(root, "drizzle") });
    const db = pdb as unknown as Db;
    await seedDatabase(db, transformLegacy(primary, secondary).seed);
    return await composePublicMenu(db);
  } finally {
    await client.close();
  }
}

async function main() {
  const url = process.env.MENU_DATABASE_URL?.trim();
  const menu = url ? await fromDatabase(url) : await fromSeed();
  if (!menu) throw new Error("no published menu version — publish the menu first");

  const hasBackend = Boolean(process.env.NEXT_PUBLIC_API_URL?.trim());
  const snapshot: PublicMenu = hasBackend
    ? menu
    : { ...menu, features: { ...menu.features, orders: false, booking: false, songs: false } };

  writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot), "utf8");
  console.log(
    `menu snapshot: v${snapshot.version}, ${snapshot.items.length} items, source=${url ? "database" : "seed"}, ` +
      `backend=${hasBackend ? "yes" : "none (ordering off)"}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
