/** Applies SQL migrations from ./drizzle to DATABASE_URL (PGlite migrates itself on first use). */
import path from "node:path";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(
      "DATABASE_URL is not set — local PGlite is migrated automatically on first access.",
    );
    return;
  }
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle({ client }), { migrationsFolder: path.join(process.cwd(), "drizzle") });
    console.log("Migrations applied");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
