import { listTables } from "@/lib/admin/catalog";
import { tablesPdf } from "@/lib/admin/qr";
import { getAdminSession } from "@/lib/admin/session";
import { hasRole } from "@/lib/admin/auth";
import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/** GET /admin/api/qr[?codes=12,VIP1] — A6 PDF, one card per active table. */
export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session || !hasRole(session.user.role, "manager"))
    return new Response("Forbidden", { status: 403 });
  const wanted = new URL(request.url).searchParams
    .get("codes")
    ?.split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  const tables = (await listTables(await getDb())).filter((t) =>
    wanted?.length ? wanted.includes(t.code) : t.isActive,
  );
  if (!tables.length) return new Response("No tables", { status: 404 });
  const pdf = await tablesPdf(tables.map((t) => ({ code: t.code, version: t.tokenVersion })));
  const name = tables.length === 1 ? `unipub-table-${tables[0]!.code}.pdf` : "unipub-tables.pdf";
  return new Response(new Blob([pdf as BlobPart], { type: "application/pdf" }), {
    headers: {
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
