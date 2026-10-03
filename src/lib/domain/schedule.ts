import type { Schedule, WeeklyHours } from "./types";

export const VENUE_TZ = "Asia/Almaty";

export type ZonedParts = {
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  /** minutes since local midnight */
  minutes: number;
  /** YYYY-MM-DD in the venue timezone */
  ymd: string;
  hour: number;
  minute: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function formatter(tz: string) {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(tz, f);
  }
  return f;
}

export function zonedParts(date: Date, tz: string = VENUE_TZ): ZonedParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(date)) parts[p.type] = p.value;
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  return {
    weekday: WEEKDAYS[parts.weekday ?? "Sun"] ?? 0,
    hour,
    minute,
    minutes: hour * 60 + minute,
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export function parseHm(value: string | undefined | null): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

export function formatHm(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function addDaysYmd(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function dateInRange(ymd: string, s: Schedule) {
  if (s.startDate && ymd < s.startDate) return false;
  if (s.endDate && ymd > s.endDate) return false;
  return true;
}

/**
 * Whether a schedule is active at `now`. A window that crosses midnight (from > to) is
 * attributed to its start day, so "Fri 22:00–02:00" is active on Saturday 01:30.
 */
export function isScheduleActive(s: Schedule | null | undefined, now: Date, tz: string = VENUE_TZ) {
  if (!s) return false;
  const p = zonedParts(now, tz);
  const from = parseHm(s.from);
  const to = parseHm(s.to);
  const days = s.days && s.days.length ? s.days : null;

  if (from === null || to === null || from === to) {
    return (!days || days.includes(p.weekday)) && dateInRange(p.ymd, s);
  }
  if (from < to) {
    return (
      (!days || days.includes(p.weekday)) &&
      dateInRange(p.ymd, s) &&
      p.minutes >= from &&
      p.minutes < to
    );
  }
  // crosses midnight
  if (p.minutes >= from) {
    return (!days || days.includes(p.weekday)) && dateInRange(p.ymd, s);
  }
  if (p.minutes < to) {
    const prevDay = (p.weekday + 6) % 7;
    return (!days || days.includes(prevDay)) && dateInRange(addDaysYmd(p.ymd, -1), s);
  }
  return false;
}

export type OpenStatus =
  | { open: true; closesAt: string }
  | { open: false; opensAt: string | null; opensWeekday: number | null };

/** Open/closed state from weekly hours, including the tail of yesterday's after-midnight shift. */
export function openStatus(hours: WeeklyHours, now: Date, tz: string = VENUE_TZ): OpenStatus {
  const p = zonedParts(now, tz);
  const prev = hours[(p.weekday + 6) % 7];
  if (prev) {
    const o = parseHm(prev.open);
    const c = parseHm(prev.close);
    if (o !== null && c !== null && c <= o && p.minutes < c) {
      return { open: true, closesAt: prev.close };
    }
  }
  const today = hours[p.weekday];
  if (today) {
    const o = parseHm(today.open);
    const c = parseHm(today.close);
    if (o !== null && c !== null) {
      const crosses = c <= o;
      if (p.minutes >= o && (crosses || p.minutes < c))
        return { open: true, closesAt: today.close };
      if (p.minutes < o) return { open: false, opensAt: today.open, opensWeekday: p.weekday };
    }
  }
  for (let i = 1; i <= 7; i += 1) {
    const wd = (p.weekday + i) % 7;
    const h = hours[wd];
    if (h && parseHm(h.open) !== null) return { open: false, opensAt: h.open, opensWeekday: wd };
  }
  return { open: false, opensAt: null, opensWeekday: null };
}

/**
 * Business day for daily order numbering. The bar works past midnight, so the day switches
 * at `cutoffHour` local time (orders at 01:30 belong to the previous evening).
 */
export function businessDay(now: Date, tz: string = VENUE_TZ, cutoffHour = 6): string {
  const p = zonedParts(now, tz);
  return p.hour < cutoffHour ? addDaysYmd(p.ymd, -1) : p.ymd;
}

export function formatVenueDateTime(date: Date, tz: string = VENUE_TZ): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
