import { PageHeader } from "@/components/admin/page-header";
import { RangeForm } from "@/components/admin/range-form";
import { Card } from "@/components/admin/ui";
import { fmtDay, fmtDuration, REQUEST_TYPE } from "@/lib/admin/format";
import { analytics, DAY_CUTOFF_HOUR, normalizeRange } from "@/lib/admin/reports";
import { requireAdmin } from "@/lib/admin/session";
import { getDb } from "@/lib/db/client";
import type { RequestType } from "@/lib/db/schema";
import { formatPrice } from "@/lib/domain/money";
import { businessDay, VENUE_TZ } from "@/lib/domain/schedule";

export const metadata = { title: "Аналитика" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
/** Business-day order: the night shift reads left to right. */
const HOURS = Array.from({ length: 24 }, (_, i) => (i + DAY_CUTOFF_HOUR) % 24);

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-line bg-surface rounded-2xl border p-4">
      <div className="text-muted text-[13px] font-semibold">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums">{value}</div>
      {hint ? <div className="text-muted mt-0.5 text-[12px]">{hint}</div> : null}
    </div>
  );
}

export default async function AnalyticsPage(props: PageProps<"/admin/analytics">) {
  await requireAdmin("manager");
  const sp = await props.searchParams;
  const now = new Date();
  const today = businessDay(now, VENUE_TZ, DAY_CUTOFF_HOUR);
  const range = normalizeRange(one(sp.from), one(sp.to), now);
  const a = await analytics(await getDb(), range);
  const peak = Math.max(1, ...a.byHour);
  const topQty = Math.max(1, ...a.topItems.map((t) => t.qty));
  const period =
    range.from === range.to ? fmtDay(range.from) : `${fmtDay(range.from)} — ${fmtDay(range.to)}`;

  return (
    <>
      <PageHeader
        title="Аналитика"
        description={`${period}. Только из базы, без внешних сервисов.`}
      />
      <RangeForm path="/admin/analytics" range={range} today={today} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Заказы"
          value={String(a.orders)}
          hint={a.failed ? `ещё ${a.failed} не доставлено` : undefined}
        />
        <Stat label="Выручка по заказам" value={formatPrice(a.revenue)} hint="с обслуживанием" />
        <Stat label="Средний чек" value={formatPrice(a.avgCheck)} />
        <Stat
          label="До «Принял»"
          value={fmtDuration(a.acceptMedianSec)}
          hint={`медиана · 90% быстрее ${fmtDuration(a.acceptP90Sec)} · принято ${Math.round(a.acceptedShare * 100)}%`}
        />
      </div>

      <Card className="mt-4">
        <h2 className="mb-3 font-bold">Заказы по часам</h2>
        {a.orders ? (
          <div
            className="flex h-40 items-end gap-[3px]"
            role="img"
            aria-label="Гистограмма заказов по часам"
          >
            {HOURS.map((h) => {
              const n = a.byHour[h] ?? 0;
              return (
                <div
                  key={h}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                >
                  {n ? <span className="text-muted text-[10px] tabular-nums">{n}</span> : null}
                  <div
                    className={n ? "bg-accent w-full rounded-t" : "bg-surface-2 w-full rounded-t"}
                    style={{ height: `${n ? Math.max(4, (n / peak) * 100) : 2}%` }}
                    title={`${h}:00 — ${n}`}
                  />
                  <span className="text-muted text-[10px] tabular-nums">
                    {h % 3 === 0 ? h : ""}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-muted">За период заказов нет</p>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold">Топ блюд</h2>
          {a.topItems.length ? (
            <ol className="flex flex-col gap-2">
              {a.topItems.map((t, i) => (
                <li key={t.itemId} className="flex flex-col gap-1">
                  <div className="flex gap-2 text-[14px]">
                    <span className="text-muted w-5 tabular-nums">{i + 1}</span>
                    <span className="flex-1 truncate font-semibold">{t.name}</span>
                    <span className="tabular-nums">{t.qty} шт</span>
                    <span className="text-muted w-24 text-right tabular-nums">
                      {formatPrice(t.revenue)}
                    </span>
                  </div>
                  <div className="bg-surface-2 ml-7 h-1.5 overflow-hidden rounded-full">
                    <div
                      className="bg-gold h-full rounded-full"
                      style={{ width: `${(t.qty / topQty) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted">Нет данных</p>
          )}
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-3 font-bold">Кто принимал заказы</h2>
            {a.byStaff.length ? (
              <ul className="flex flex-col gap-1.5">
                {a.byStaff.map((s) => (
                  <li key={s.name} className="flex justify-between text-[14px]">
                    <span>{s.name}</span>
                    <span className="font-bold tabular-nums">{s.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">Нет данных</p>
            )}
          </Card>
          <Card>
            <h2 className="mb-3 font-bold">Заявки</h2>
            <ul className="grid grid-cols-2 gap-2">
              {(Object.keys(REQUEST_TYPE) as RequestType[]).map((t) => (
                <li key={t} className="bg-surface-2 rounded-xl p-3">
                  <div className="text-muted text-[12px]">{REQUEST_TYPE[t]}</div>
                  <div className="text-xl font-extrabold tabular-nums">{a.requests[t]}</div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
