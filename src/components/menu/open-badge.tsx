"use client";

import { openStatus, type OpenStatus } from "@/lib/domain/schedule";
import type { WeeklyHours } from "@/lib/domain/types";
import { useMinute } from "@/lib/menu/use-minute";
import { cn } from "@/lib/utils";

export type OpenBadgeText = {
  openUntil: string;
  opensAt: string;
  opensOn: string;
  closed: string;
  /** Sunday-first, already declined for "opens on …" */
  weekdays: string[];
};

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "");

function weekdayIndex(now: Date, tz: string): number {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" })
    .formatToParts(now)
    .find((p) => p.type === "weekday")?.value;
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day ?? "");
}

function describe(status: OpenStatus, text: OpenBadgeText, now: Date, tz: string): string {
  if (status.open) return fill(text.openUntil, { time: status.closesAt });
  if (!status.opensAt) return text.closed;
  if (status.opensWeekday === null || status.opensWeekday === weekdayIndex(now, tz)) {
    return fill(text.opensAt, { time: status.opensAt });
  }
  return fill(text.opensOn, {
    day: text.weekdays[status.opensWeekday] ?? "",
    time: status.opensAt,
  });
}

/** Rendered with the build/request time first, then kept current with the guest's clock. */
export function OpenBadge({
  initial,
  initialAt,
  hours,
  tz,
  text,
  note,
}: {
  initial: OpenStatus;
  initialAt: number;
  hours: WeeklyHours;
  tz: string;
  text: OpenBadgeText;
  /** Static schedule hint, e.g. "пт–сб до 03:00" */
  note?: string | null;
}) {
  const minute = useMinute(true);
  const now = new Date(minute ?? initialAt);
  const status = minute === null ? initial : openStatus(hours, now, tz);
  return (
    <span className="border-line bg-surface inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-[14px] font-semibold">
      <span
        className={cn("size-2 rounded-full", status.open ? "bg-success" : "bg-danger")}
        aria-hidden="true"
      />
      {describe(status, text, now, tz)}
      {note ? <span className="text-gold">· {note}</span> : null}
    </span>
  );
}
