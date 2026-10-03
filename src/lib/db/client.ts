import { mkdirSync } from "node:fs";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

type Holder = {
  db: Db;
  ready: Promise<void>;
  close: () => Promise<void>;
  kind: "postgres" | "pglite";
};

const g = globalThis as unknown as { __unipubDb?: Holder };

export const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

async function createPostgres(url: string): Promise<Holder> {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const client = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: true,
  });
  const db = drizzle({ client, schema }) as unknown as Db;
  return {
    db,
    ready: Promise.resolve(),
    close: () => client.end({ timeout: 5 }),
    kind: "postgres",
  };
}

async function createPglite(dataDir: string | null): Promise<Holder> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  if (dataDir) mkdirSync(path.dirname(path.resolve(dataDir)), { recursive: true });
  const client = dataDir ? new PGlite(path.resolve(dataDir)) : new PGlite();
  const pdb = drizzle({ client, schema });
  const ready = migrate(pdb, { migrationsFolder: MIGRATIONS_DIR });
  return { db: pdb as unknown as Db, ready, close: () => client.close(), kind: "pglite" };
}

/**
 * Production uses PostgreSQL via DATABASE_URL. Without it (local dev, tests) an embedded
 * PGlite database is used and migrated automatically, so `npm run dev` needs no services.
 */
export async function getDb(): Promise<Db> {
  if (!g.__unipubDb) {
    const e = env();
    g.__unipubDb = e.DATABASE_URL
      ? await createPostgres(e.DATABASE_URL)
      : await createPglite(e.APP_ENV === "test" ? null : e.PGLITE_DIR);
  }
  await g.__unipubDb.ready;
  return g.__unipubDb.db;
}

export function dbKind(): "postgres" | "pglite" | null {
  return g.__unipubDb?.kind ?? null;
}

export async function closeDb() {
  if (g.__unipubDb) {
    await g.__unipubDb.close();
    g.__unipubDb = undefined;
  }
}

/** Test helper: install an already-migrated database instance. */
export function __setDbForTests(db: Db, close: () => Promise<void> = async () => {}) {
  g.__unipubDb = { db, ready: Promise.resolve(), close, kind: "pglite" };
}
