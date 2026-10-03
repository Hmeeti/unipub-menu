import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { hasRole } from "@/lib/admin/auth";
import { draftStatus } from "@/lib/admin/catalog";
import { fmtDay, fmtDuration, fmtTime } from "@/lib/admin/format";
import { analytics, normalizeRange, outboxStatus, waitingOrders } from "@/lib/admin/reports";
import { requireAdmin } from "@/lib/admin/session";
import { getDb } from "@/lib/db/client";
import { items } from "@/lib/db/schema";
import { formatPrice } from "@/lib/domain/money";
import { StopList } from "./stop-list";

export const metadata = { title: "Сводка" };

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-line bg-surface rounded-2xl border p-4">
      <div className="text-muted text-[13px] font-semibold">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums">{value}</div>
      {hint ? <div className="text-muted mt-0.5 text-[13px]">{hint}</div> : null}
    </div>
  );
}

export default async function Dashboard({ searchParams }: PageProps<"/admin">) {
  const { user } = await requireAdmin("waiter");
  const sp = await searchParams;
  const db = await getDb();
  const now = new Date();
  const range = normalizeRange(undefined, undefined, now);
  const isManager = hasRole(user.role, "manager");
  const [stats, waiting, sold, draft, queue] = await Promise.all([
    analytics(db, range),
    waitingOrders(db, now),
    db
      .select({ id: items.id, name: items.name })
      .from(items)
      .where(eq(items.soldOut, true))
      .orderBy(asc(items.sort)),
    isManager ? draftStatus(db) : null,
    isManager ? outboxStatus(db) : null,
  ]);

  return (
    <>
      <PageHeader
        title="Сводка"
        description={`Бизнес-день: ${fmtDay(range.from)} (с 06:00 до 06:00)`}
      />
      {sp.denied ? (
        <p
          role="alert"
          className="border-line bg-surface text-danger mb-4 rounded-2xl border p-4 font-semibold"
        >
          У вашей роли нет доступа к этому разделу.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Заказов"
          value={String(stats.orders)}
          hint={stats.failed ? `не доставлено: ${stats.failed}` : undefined}
        />
        <Stat label="Выручка" value={formatPrice(stats.revenue)} />
        <Stat label="Средний чек" value={formatPrice(stats.avgCheck)} />
        <Stat label="До «Принял»" value={fmtDuration(stats.acceptMedianSec)} hint="медиана" />
      </div>

      {draft?.dirty || (queue && (queue.dead > 0 || queue.pending > 5)) ? (
        <div className="mt-4 flex flex-col gap-2">
          {draft?.dirty ? (
            <Link
              href="/admin/publish"
              className="border-gold/40 bg-gold/10 text-gold block rounded-2xl border p-4 font-semibold"
            >
              Есть неопубликованные изменения меню — гости их пока не видят. Открыть публикацию →
            </Link>
          ) : null}
          {queue && queue.dead > 0 ? (
            <Link
              href="/admin/system"
              className="border-danger/40 bg-danger/10 text-danger block rounded-2xl border p-4 font-semibold"
            >
              {queue.dead} сообщ. не доставлено в Telegram. Проверить бота →
            </Link>
          ) : queue && queue.pending > 5 ? (
            <Link
              href="/admin/system"
              className="border-gold/40 bg-gold/10 text-gold block rounded-2xl border p-4 font-semibold"
            >
              В очереди Telegram {queue.pending} сообщений. Проверить бота →
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="border-line bg-surface rounded-2xl border p-4">
          <h2 className="mb-2 text-lg font-bold">Ждут «Принял» дольше 3 минут</h2>
          {waiting.length ? (
            <ul className="divide-line divide-y">
              {waiting.map((o) => (
                <li key={o.id} className="flex min-h-12 items-center gap-3 py-1 text-[15px]">
                  <span className="font-bold tabular-nums">№{o.dayNumber}</span>
                  <span>стол {o.tableCode}</span>
                  <span className="text-muted ml-auto tabular-nums">{fmtTime(o.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted text-[15px]">Все заказы приняты вовремя.</p>
          )}
        </section>
        <section className="border-line bg-surface rounded-2xl border p-4">
          <h2 className="mb-2 text-lg font-bold">Стоп-лист</h2>
          <StopList items={sold.map((s) => ({ id: s.id, name: s.name.ru }))} canEdit={isManager} />
        </section>
      </div>
    </>
  );
}
