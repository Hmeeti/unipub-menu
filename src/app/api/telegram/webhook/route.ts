import { webhookCallback } from "grammy";
import { revalidateTag } from "next/cache";
import { getDb } from "@/lib/db/client";
import { env } from "@/lib/env";
import { getKv } from "@/lib/kv/kv";
import { MENU_TAG } from "@/lib/menu/public";
import { getBot } from "@/lib/telegram/bot";

type Handler = (req: Request) => Promise<Response>;
let handler: Handler | null = null;

/**
 * Telegram updates (inline buttons). grammY rejects requests whose
 * X-Telegram-Bot-Api-Secret-Token does not match; without a configured secret the route is off.
 */
export async function POST(req: Request) {
  const secret = env().TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return new Response(null, { status: 404 });
  if (!handler) {
    const holder = getBot(async () => ({ db: await getDb(), kv: await getKv() }));
    holder.hooks.onMenuChanged = () => revalidateTag(MENU_TAG, { expire: 0 });
    handler = webhookCallback(holder.bot, "std/http", {
      secretToken: secret,
      onTimeout: "return",
      timeoutMilliseconds: 9_000,
    });
  }
  return handler(req);
}
