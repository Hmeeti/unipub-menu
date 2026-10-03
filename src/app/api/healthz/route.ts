import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getKv } from "@/lib/kv/kv";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, boolean> = {};
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    checks.db = true;
  } catch {
    checks.db = false;
  }
  try {
    checks.kv = await (await getKv()).ping();
  } catch {
    checks.kv = false;
  }
  const ok = Object.values(checks).every(Boolean);
  return Response.json(
    { ok, checks, version: process.env.DEPLOYMENT_VERSION ?? "dev" },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
