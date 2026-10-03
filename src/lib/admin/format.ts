import { VENUE_TZ } from "@/lib/domain/schedule";

const time = new Intl.DateTimeFormat("ru-RU", {
  timeZone: VENUE_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dateTime = new Intl.DateTimeFormat("ru-RU", {
  timeZone: VENUE_TZ,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const longDate = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "long",
});

export const fmtTime = (d: Date | null | undefined) => (d ? time.format(d) : "—");
export const fmtDateTime = (d: Date | null | undefined) => (d ? dateTime.format(d) : "—");
/** YYYY-MM-DD business day → «сб, 3 октября» */
export const fmtDay = (ymd: string) => longDate.format(new Date(`${ymd}T12:00:00Z`));

export function fmtDuration(sec: number | null | undefined) {
  if (sec == null) return "—";
  if (sec < 60) return `${sec} с`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m} мин ${s} с` : `${m} мин`;
  return `${Math.floor(m / 60)} ч ${m % 60} мин`;
}

export const ORDER_STATUS: Record<
  string,
  { label: string; tone: "muted" | "ok" | "warn" | "danger" }
> = {
  queued: { label: "В очереди", tone: "warn" },
  sent: { label: "Отправлен", tone: "warn" },
  accepted: { label: "Принят", tone: "ok" },
  failed: { label: "Не доставлен", tone: "danger" },
};

export const REQUEST_TYPE: Record<string, string> = {
  waiter: "Вызов официанта",
  bill: "Счёт",
  song: "Песня",
  booking: "Бронь",
};
