import { getDb } from "@/lib/db/client";
import { clientIp, hashId, isAllowedOrigin, json } from "@/lib/http/request";
import { getKv } from "@/lib/kv/kv";
import { log } from "@/lib/log";
import { remindOrder } from "@/lib/orders/service";
import { checkLimits } from "@/lib/security/rate-limit";
import { PUBLIC_ID_RE } from "@/lib/orders/types";

export async function POST(req: Request, ctx: RouteContext<"/api/orders/[id]/remind">) {
  if (!isAllowedOrigin(req.headers)) return json({ ok: false, error: "origin" }, { status: 403 });
  const { id } = await ctx.params;
  if (!PUBLIC_ID_RE.test(id)) return json({ ok: false, error: "not_found" }, { status: 404 });
  try {
    const kv = await getKv();
    const ip = hashId("ip", clientIp(req.headers));
    const limit = await checkLimits(kv, [
      { name: "ip", key: `remind:ip:${ip}`, limit: 30, windowMs: 10 * 60_000 },
    ]);
    if (!limit.ok) return json({ ok: false, error: "rate_limited" }, { status: 429 });
    const result = await remindOrder(await getDb(), kv, id, new Date());
    if (!result.ok) return json({ ok: false, error: result.error }, { status: result.status });
    return json({ ok: true, order: result.order });
  } catch (err) {
    log.error({ err }, "order remind failed");
    return json({ ok: false, error: "server" }, { status: 500 });
  }
}
