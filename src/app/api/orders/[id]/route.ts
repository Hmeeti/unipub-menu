import { getDb } from "@/lib/db/client";
import { json } from "@/lib/http/request";
import { log } from "@/lib/log";
import { findByPublicId, toStatusView } from "@/lib/orders/service";
import { PUBLIC_ID_RE } from "@/lib/orders/types";

/** Polling fallback for the live status (SSE is preferred). The random public id is the capability. */
export async function GET(_req: Request, ctx: RouteContext<"/api/orders/[id]">) {
  const { id } = await ctx.params;
  if (!PUBLIC_ID_RE.test(id)) return json({ ok: false, error: "not_found" }, { status: 404 });
  try {
    const db = await getDb();
    const order = await findByPublicId(db, id);
    if (!order) return json({ ok: false, error: "not_found" }, { status: 404 });
    return json({ ok: true, order: await toStatusView(db, order) });
  } catch (err) {
    log.error({ err }, "order status failed");
    return json({ ok: false, error: "server" }, { status: 500 });
  }
}
