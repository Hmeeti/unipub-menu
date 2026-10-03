import { asc, eq, isNotNull } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { getDb } from "@/lib/db/client";
import { venue, waiters } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { json } from "@/lib/http/request";
import { getKv } from "@/lib/kv/kv";
import { MENU_TAG } from "@/lib/menu/public";
import { publishMenu } from "@/lib/menu/repository";
import { getBot, telegramLog } from "@/lib/telegram/bot";

const E2E_STAFF_TG_ID = 777_000_777;

/**
 * E2E-only hooks (E2E_TEST_HOOKS=true, refused in production by env validation):
 * read the mocked Telegram traffic, press inline buttons as staff, open the venue around the clock.
 */
function enabled() {
  return env().E2E_TEST_HOOKS && env().APP_ENV !== "production";
}

export async function GET() {
  if (!enabled()) return new Response(null, { status: 404 });
  return json({ calls: telegramLog() });
}

export async function POST(req: Request) {
  if (!enabled()) return new Response(null, { status: 404 });
  const body = (await req.json()) as { action: string; data?: string; messageId?: number };
  const db = await getDb();
  const kv = await getKv();

  if (body.action === "open") {
    const allDay = Array.from({ length: 7 }, () => ({ open: "00:00", close: "00:00" }));
    await db.update(venue).set({ hours: allDay }).where(eq(venue.id, 1));
    await publishMenu(db, { note: "e2e: open 24/7" });
    revalidateTag(MENU_TAG, { expire: 0 });
    return json({ ok: true });
  }

  if (body.action === "press" && body.data) {
    const [linked] = await db
      .select({ id: waiters.id })
      .from(waiters)
      .where(isNotNull(waiters.telegramUserId));
    if (!linked) {
      const [first] = await db.select({ id: waiters.id }).from(waiters).orderBy(asc(waiters.sort));
      if (first)
        await db
          .update(waiters)
          .set({ telegramUserId: E2E_STAFF_TG_ID })
          .where(eq(waiters.id, first.id));
    }
    const holder = getBot(async () => ({ db, kv }));
    holder.hooks.onMenuChanged = () => revalidateTag(MENU_TAG, { expire: 0 });
    const before = telegramLog().length;
    await holder.bot.handleUpdate({
      update_id: Date.now(),
      callback_query: {
        id: String(Date.now()),
        chat_instance: "e2e",
        data: body.data,
        from: { id: E2E_STAFF_TG_ID, is_bot: false, first_name: "E2E" },
        message: {
          message_id: body.messageId ?? 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: -1, type: "supergroup", title: "mock" },
          text: "order",
        },
      },
    });
    return json({ ok: true, calls: telegramLog().slice(before) });
  }

  return json({ ok: false }, { status: 400 });
}
