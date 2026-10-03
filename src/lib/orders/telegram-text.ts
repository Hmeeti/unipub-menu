import { formatPrice, percentLabel } from "@/lib/domain/money";
import type { SplitPart } from "@/lib/domain/split";
import type { OrderLine } from "@/lib/domain/types";

/** Everything the staff message shows; re-rendered in full on every edit (accept, unavailable). */
export type OrderMessageData = {
  number: number;
  tableCode: string;
  tableVerified: boolean;
  waiterName: string | null;
  createdAt: Date;
  lines: OrderLine[];
  subtotal: number;
  service: number;
  total: number;
  serviceRateBp: number;
  comment: string | null;
  split: SplitPart[] | null;
  acceptedBy: string | null;
  acceptedAt: Date | null;
  unavailableItemIds: string[];
};

export function venueTime(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/**
 * Plain text (no parse_mode): guest-supplied strings can never inject markup or links.
 * Positions are in Russian with the guest's name in parentheses when it differs.
 */
export function formatOrderMessage(o: OrderMessageData, tz: string): string {
  const out: string[] = [];
  out.push(`🧾 Заказ №${o.number} · стол ${o.tableCode}`);
  out.push(`Официант: ${o.waiterName ?? "любой"}`);
  out.push(`Время: ${venueTime(o.createdAt, tz)}`);
  if (!o.tableVerified) out.push("⚠️ Стол введён вручную (без QR)");
  out.push("");
  const missing = new Set(o.unavailableItemIds);
  for (const l of o.lines) {
    const guest = l.nameGuest && l.nameGuest !== l.nameRu ? ` (${l.nameGuest})` : "";
    const mark = missing.has(l.itemId) ? "❌ " : "• ";
    const sale = l.unitPrice < l.basePrice ? " (акция)" : "";
    out.push(`${mark}${l.nameRu}${guest} × ${l.qty} = ${formatPrice(l.lineTotal)}${sale}`);
  }
  out.push("");
  out.push(`Сумма: ${formatPrice(o.subtotal)}`);
  out.push(`Обслуживание ${percentLabel(o.serviceRateBp)}%: ${formatPrice(o.service)}`);
  out.push(`Итого: ${formatPrice(o.total)}`);
  if (o.comment) {
    out.push("");
    out.push(`💬 ${o.comment}`);
  }
  if (o.split?.length) {
    out.push("");
    out.push(`👥 Раздельный счёт (${o.split.length}):`);
    for (const p of o.split) out.push(`— ${p.name}: ${formatPrice(p.total)}`);
  }
  if (o.acceptedBy) {
    out.push("");
    const at = o.acceptedAt ? ` · ${venueTime(o.acceptedAt, tz)}` : "";
    out.push(`✅ Принял: ${o.acceptedBy}${at}`);
  }
  const missingNames = o.lines.filter((l) => missing.has(l.itemId)).map((l) => l.nameRu);
  if (missingNames.length) out.push(`⚠️ Нет в наличии: ${missingNames.join(", ")}`);
  return out.join("\n");
}

export type InlineButton = { text: string; callback_data: string };
export type InlineKeyboard = { inline_keyboard: InlineButton[][] };

export const CB = {
  accept: (id: number) => `acc:${id}`,
  unavailableMenu: (id: number) => `na:${id}`,
  unavailablePick: (id: number, index: number) => `nai:${id}:${index}`,
  back: (id: number) => `back:${id}`,
};

export function parseCallback(
  data: string | undefined,
):
  | { kind: "accept" | "unavailableMenu" | "back"; orderId: number }
  | { kind: "unavailablePick"; orderId: number; index: number }
  | null {
  if (!data) return null;
  const m = /^(acc|na|back|nai):(\d{1,15})(?::(\d{1,2}))?$/.exec(data);
  if (!m) return null;
  const orderId = Number(m[2]);
  if (m[1] === "nai") {
    if (m[3] === undefined) return null;
    return { kind: "unavailablePick", orderId, index: Number(m[3]) };
  }
  if (m[3] !== undefined) return null;
  const kind = m[1] === "acc" ? "accept" : m[1] === "na" ? "unavailableMenu" : "back";
  return { kind, orderId };
}

export function mainKeyboard(orderId: number, accepted: boolean): InlineKeyboard {
  const unavailable = { text: "⚠️ Нет блюда", callback_data: CB.unavailableMenu(orderId) };
  return {
    inline_keyboard: accepted
      ? [[unavailable]]
      : [[{ text: "✅ Принял", callback_data: CB.accept(orderId) }, unavailable]],
  };
}

export function unavailableKeyboard(
  orderId: number,
  lines: OrderLine[],
  already: string[],
): InlineKeyboard {
  const done = new Set(already);
  const rows = lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => !done.has(l.itemId))
    .map(({ l, i }) => [
      { text: `❌ ${l.nameRu}`.slice(0, 60), callback_data: CB.unavailablePick(orderId, i) },
    ]);
  return { inline_keyboard: [...rows, [{ text: "← Назад", callback_data: CB.back(orderId) }]] };
}

export function formatReminder(number: number, tableCode: string): string {
  return `🔔 Гость напоминает о заказе №${number} (стол ${tableCode})`;
}
