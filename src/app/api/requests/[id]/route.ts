import { getDb } from "@/lib/db/client";
import { json } from "@/lib/http/request";
import { log } from "@/lib/log";
import { PUBLIC_ID_RE } from "@/lib/orders/types";
import { findRequestByPublicId, toRequestView } from "@/lib/requests/service";

/** Polled by the guest while the request sheet is open; the random public id is the capability. */
export async function GET(_req: Request, ctx: RouteContext<"/api/requests/[id]">) {
  const { id } = await ctx.params;
  if (!PUBLIC_ID_RE.test(id)) return json({ ok: false, error: "not_found" }, { status: 404 });
  try {
    const row = await findRequestByPublicId(await getDb(), id);
    if (!row) return json({ ok: false, error: "not_found" }, { status: 404 });
    return json({ ok: true, request: toRequestView(row) });
  } catch (err) {
    log.error({ err }, "request status failed");
    return json({ ok: false, error: "server" }, { status: 500 });
  }
}
