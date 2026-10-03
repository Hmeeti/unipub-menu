import { getDb } from "@/lib/db/client";
import { env } from "@/lib/env";
import {
  clientIp,
  hashId,
  isAllowedOrigin,
  json,
  newSessionId,
  readJson,
  readSession,
  sessionCookie,
} from "@/lib/http/request";
import { getKv } from "@/lib/kv/kv";
import { log } from "@/lib/log";
import { createOrder } from "@/lib/orders/service";
import { IDEMPOTENCY_KEY_RE } from "@/lib/orders/types";
import { turnstileEnabled, verifyTurnstile } from "@/lib/security/turnstile";
import { orderInputSchema } from "@/lib/validation/schemas";

export async function POST(req: Request) {
  if (!isAllowedOrigin(req.headers)) return json({ ok: false, error: "origin" }, { status: 403 });
  const key = req.headers.get("idempotency-key");
  if (!key || !IDEMPOTENCY_KEY_RE.test(key))
    return json({ ok: false, error: "invalid" }, { status: 400 });
  const parsed = orderInputSchema.safeParse(await readJson(req));
  if (!parsed.success) return json({ ok: false, error: "invalid" }, { status: 400 });

  const existingSid = readSession(req.headers.get("cookie"));
  const sid = existingSid ?? newSessionId();
  const headers = new Headers();
  if (!existingSid) headers.append("set-cookie", sessionCookie(sid));

  const ip = clientIp(req.headers);
  const e = env();
  try {
    const result = await createOrder(
      {
        db: await getDb(),
        kv: await getKv(),
        now: new Date(),
        ipHash: hashId("ip", ip),
        sessionHash: hashId("sid", sid),
        tableSecret: e.TABLE_TOKEN_SECRET!,
        captcha: turnstileEnabled()
          ? { siteKey: e.TURNSTILE_SITE_KEY!, verify: (t) => verifyTurnstile(t, ip) }
          : null,
      },
      parsed.data,
      key,
    );
    if (result.ok) {
      return json(
        { ok: true, order: result.order },
        { status: result.replay ? 200 : 201, headers },
      );
    }
    const { status, ...body } = result;
    if (body.retryAfterSec) headers.set("retry-after", String(body.retryAfterSec));
    return json(body, { status, headers });
  } catch (err) {
    log.error({ err }, "order creation failed");
    return json({ ok: false, error: "server" }, { status: 500, headers });
  }
}
