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
import { IDEMPOTENCY_KEY_RE } from "@/lib/orders/types";
import { botSender } from "@/lib/outbox/worker";
import { createRequest } from "@/lib/requests/service";
import { turnstileEnabled, verifyTurnstile } from "@/lib/security/turnstile";
import { getBot } from "@/lib/telegram/bot";
import { requestInputSchema } from "@/lib/validation/schemas";

/** Waiter, bill, song and booking requests. Booking contact data is never logged or stored. */
export async function POST(req: Request) {
  if (!isAllowedOrigin(req.headers)) return json({ ok: false, error: "origin" }, { status: 403 });
  const key = req.headers.get("idempotency-key");
  if (!key || !IDEMPOTENCY_KEY_RE.test(key))
    return json({ ok: false, error: "invalid" }, { status: 400 });
  const parsed = requestInputSchema.safeParse(await readJson(req));
  if (!parsed.success) return json({ ok: false, error: "invalid" }, { status: 400 });

  const existingSid = readSession(req.headers.get("cookie"));
  const sid = existingSid ?? newSessionId();
  const headers = new Headers();
  if (!existingSid) headers.append("set-cookie", sessionCookie(sid));

  const ip = clientIp(req.headers);
  const e = env();
  try {
    const db = await getDb();
    const kv = await getKv();
    const result = await createRequest(
      {
        db,
        kv,
        now: new Date(),
        ipHash: hashId("ip", ip),
        sessionHash: hashId("sid", sid),
        tableSecret: e.TABLE_TOKEN_SECRET!,
        captcha: turnstileEnabled()
          ? { siteKey: e.TURNSTILE_SITE_KEY!, verify: (t) => verifyTurnstile(t, ip) }
          : null,
        deliver: botSender(getBot(async () => ({ db, kv }))),
      },
      parsed.data,
      key,
    );
    if (result.ok) {
      return json(
        { ok: true, request: result.request },
        { status: result.replay ? 200 : 201, headers },
      );
    }
    const { status, ...body } = result;
    if (body.retryAfterSec) headers.set("retry-after", String(body.retryAfterSec));
    return json(body, { status, headers });
  } catch (err) {
    log.error({ err, type: parsed.data.type }, "request creation failed");
    return json({ ok: false, error: "server" }, { status: 500, headers });
  }
}
