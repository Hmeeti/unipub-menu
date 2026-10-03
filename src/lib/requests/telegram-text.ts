import { formatPrice } from "@/lib/domain/money";
import { venueTime, type InlineKeyboard } from "@/lib/orders/telegram-text";
import { formatKzPhone } from "@/lib/domain/phone";
import type { GuestRequestType, PaymentMethod } from "./types";

const PAYMENT_RU: Record<PaymentMethod, string> = {
  cash: "Наличные",
  card: "Карта",
  qr: "QR (Kaspi)",
};

/** Stored in requests.payload. Booking personal data is deliberately absent from this type. */
export type RequestPayload = {
  waiterName?: string | null;
  payment?: PaymentMethod;
  todayOrders?: { numbers: number[]; total: number } | null;
  artist?: string;
  title?: string;
  comment?: string | null;
  roomName?: string | null;
  date?: string;
  time?: string;
  guests?: number;
};

/** Only lives in memory while the booking is being delivered to Telegram. */
export type BookingContact = { name: string; phone: string; comment: string | null };

export type RequestMessageData = {
  number: number;
  type: GuestRequestType;
  tableCode: string | null;
  tableVerified: boolean;
  createdAt: Date;
  payload: RequestPayload;
  contact?: BookingContact;
};

const TITLES: Record<GuestRequestType, string> = {
  waiter: "🙋 Вызов официанта",
  bill: "🧾 Просят счёт",
  song: "🎤 Песня",
  booking: "📅 Бронь",
};

function bookingWhen(date: string, time: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" }).format(d);
  const [, m, day] = date.split("-");
  return `${weekday}, ${day}.${m} в ${time}`;
}

/** Plain text like orders: guest strings cannot inject markup. */
export function formatRequestMessage(r: RequestMessageData, tz: string): string {
  const p = r.payload;
  const where = r.tableCode ? `стол ${r.tableCode}` : p.roomName ? p.roomName : null;
  const out: string[] = [`${TITLES[r.type]} №${r.number}${where ? ` · ${where}` : ""}`];

  if (r.type === "waiter" || r.type === "bill") out.push(`Официант: ${p.waiterName || "любой"}`);
  if (r.type === "bill" && p.payment) out.push(`Оплата: ${PAYMENT_RU[p.payment]}`);
  if (r.type === "bill" && p.todayOrders?.numbers.length) {
    const nums = p.todayOrders.numbers.map((n) => `№${n}`).join(", ");
    out.push(`Заказы стола сегодня: ${nums} · ${formatPrice(p.todayOrders.total)}`);
  }
  if (r.type === "song") {
    out.push(`${p.artist} — ${p.title}`);
    if (r.tableCode && p.roomName) out.push(`Зал: ${p.roomName}`);
  }
  if (r.type === "booking") {
    if (r.contact) {
      out.push(`Имя: ${r.contact.name}`);
      out.push(`Телефон: ${formatKzPhone(r.contact.phone)}`);
    }
    if (p.date && p.time) out.push(`Когда: ${bookingWhen(p.date, p.time)}`);
    if (p.guests) out.push(`Гостей: ${p.guests}`);
    if (p.roomName) out.push(`Зал: ${p.roomName}`);
  }
  const comment = r.type === "booking" ? r.contact?.comment : p.comment;
  if (comment) out.push(`💬 ${comment}`);
  out.push(`${r.type === "booking" ? "Отправлено" : "Время"}: ${venueTime(r.createdAt, tz)}`);
  if (r.tableCode && !r.tableVerified) out.push("⚠️ Стол введён вручную (без QR)");
  if (r.type === "booking") out.push("Перезвоните гостю для подтверждения.");
  return out.join("\n");
}

export const ACCEPTED_PREFIX = "✅ Принял:";

export function acceptedLine(name: string, at: Date, tz: string): string {
  return `${ACCEPTED_PREFIX} ${name} · ${venueTime(at, tz)}`;
}

/** Bookings are re-rendered from the message itself, since the contact is not in the database. */
export function appendAccepted(text: string, line: string): string {
  const base = text
    .split("\n")
    .filter((l) => !l.startsWith(ACCEPTED_PREFIX))
    .join("\n")
    .trimEnd();
  return `${base}\n\n${line}`;
}

export const REQUEST_CB = { accept: (id: number) => `racc:${id}` };

export function parseRequestCallback(data: string | undefined): { requestId: number } | null {
  const m = data ? /^racc:(\d{1,15})$/.exec(data) : null;
  return m ? { requestId: Number(m[1]) } : null;
}

export function requestKeyboard(id: number): InlineKeyboard {
  return { inline_keyboard: [[{ text: "✅ Принял", callback_data: REQUEST_CB.accept(id) }]] };
}
