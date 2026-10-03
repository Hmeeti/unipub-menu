import Link from "next/link";
import type { ReactNode } from "react";
import { addDaysYmd } from "@/lib/domain/schedule";
import type { DayRange } from "@/lib/admin/reports";
import { cn } from "@/lib/utils";

const input =
  "border-line bg-bg-2 text-text min-h-11 rounded-xl border px-3 text-[15px] outline-none focus-visible:border-pink";

/** GET filter: quick presets as links plus a custom range; extra fields keep the rest of the query. */
export function RangeForm({
  path,
  range,
  today,
  keep = {},
  hidden = [],
  children,
}: {
  path: string;
  range: DayRange;
  today: string;
  /** query params preserved by the preset links */
  keep?: Record<string, string | undefined>;
  /** keys of `keep` that have no visible field in `children` */
  hidden?: string[];
  children?: ReactNode;
}) {
  const presets = [
    { label: "Сегодня", from: today, to: today },
    { label: "Вчера", from: addDaysYmd(today, -1), to: addDaysYmd(today, -1) },
    { label: "7 дней", from: addDaysYmd(today, -6), to: today },
    { label: "30 дней", from: addDaysYmd(today, -29), to: today },
  ];
  const href = (from: string, to: string) => {
    const q = new URLSearchParams({
      ...Object.fromEntries(Object.entries(keep).filter(([, v]) => v)),
      from,
      to,
    });
    return `${path}?${q}`;
  };
  return (
    <form
      method="get"
      action={path}
      className="border-line bg-surface mb-4 flex flex-col gap-3 rounded-2xl border p-3"
    >
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const active = p.from === range.from && p.to === range.to;
          return (
            <Link
              key={p.label}
              href={href(p.from, p.to)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "inline-flex min-h-10 items-center rounded-full border px-4 text-[14px] font-semibold",
                active ? "bg-accent text-on-accent border-transparent" : "border-line bg-surface-2",
              )}
            >
              {p.label}
            </Link>
          );
        })}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {hidden.map((k) =>
          keep[k] ? <input key={k} type="hidden" name={k} value={keep[k]} /> : null,
        )}
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          <span className="text-muted">С</span>
          <input type="date" name="from" defaultValue={range.from} max={today} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          <span className="text-muted">По</span>
          <input type="date" name="to" defaultValue={range.to} max={today} className={input} />
        </label>
        {children}
        <button
          type="submit"
          className="bg-surface-2 border-line min-h-11 rounded-xl border px-4 font-semibold"
        >
          Показать
        </button>
      </div>
    </form>
  );
}

export const filterInput = input;
