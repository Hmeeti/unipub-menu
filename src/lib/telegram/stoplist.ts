import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { items } from "@/lib/db/schema";
import type { InlineKeyboard } from "@/lib/orders/telegram-text";

export type SoldOutItem = { id: string; nameRu: string };

export async function listSoldOut(db: Db): Promise<SoldOutItem[]> {
  const rows = await db
    .select({ id: items.id, name: items.name })
    .from(items)
    .where(and(eq(items.soldOut, true), eq(items.isActive, true)))
    .orderBy(asc(items.sort), asc(items.id));
  return rows.map((r) => ({ id: r.id, nameRu: r.name.ru }));
}

export const STOP_CB = {
  restore: (itemId: string) => `ret:${itemId}`,
  refresh: "stop:refresh",
};

export function parseStopCallback(
  data: string | undefined,
): { kind: "restore"; itemId: string } | { kind: "refresh" } | null {
  if (data === STOP_CB.refresh) return { kind: "refresh" };
  const m = data ? /^ret:([a-z0-9][a-z0-9_-]{0,47})$/i.exec(data) : null;
  return m ? { kind: "restore", itemId: m[1]! } : null;
}

export function formatStopList(list: SoldOutItem[]): string {
  if (!list.length) return "✅ Стоп-лист пуст — всё в наличии.";
  return [
    `🚫 Стоп-лист (${list.length}):`,
    ...list.map((i) => `• ${i.nameRu}`),
    "",
    "Нажмите на блюдо, чтобы вернуть его в продажу.",
  ].join("\n");
}

export function stopKeyboard(list: SoldOutItem[]): InlineKeyboard {
  return {
    inline_keyboard: [
      ...list.map((i) => [
        { text: `↩️ ${i.nameRu}`.slice(0, 60), callback_data: STOP_CB.restore(i.id) },
      ]),
      [{ text: "🔄 Обновить", callback_data: STOP_CB.refresh }],
    ],
  };
}
