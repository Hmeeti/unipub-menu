import { audit } from "@/lib/admin/audit";
import { hasRole } from "@/lib/admin/auth";
import { exportBackup } from "@/lib/admin/backup";
import { getAdminSession, requestIpHash } from "@/lib/admin/session";
import { getDb } from "@/lib/db/client";
import { businessDay } from "@/lib/domain/schedule";

export const dynamic = "force-dynamic";

/** GET /admin/api/export — the draft menu as JSON (same format the import accepts). */
export async function GET() {
  const session = await getAdminSession();
  if (!session || !hasRole(session.user.role, "manager"))
    return new Response("Forbidden", { status: 403 });
  const db = await getDb();
  const backup = await exportBackup(db);
  await audit(
    db,
    { id: session.user.id, login: session.user.login, ipHash: await requestIpHash() },
    "menu.export",
  );
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="unipub-menu-${businessDay(new Date())}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
