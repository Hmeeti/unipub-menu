import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { filterInput, RangeForm } from "@/components/admin/range-form";
import { Badge } from "@/components/admin/ui";
import { fmtDateTime, fmtDuration, fmtTime, ORDER_STATUS, REQUEST_TYPE } from "@/lib/admin/format";
import { DAY_CUTOFF_HOUR, listOrders, listRequests, normalizeRange } from "@/lib/admin/reports";
import { requireAdmin } from "@/lib/admin/session";
import { getDb } from "@/lib/db/client";
import type { OrderStatus, RequestType } from "@/lib/db/schema";
import { TABLE_CODE_RE } from "@/lib/domain/limits";
import { formatPrice } from "@/lib/domain/money";
import { businessDay, VENUE_TZ } from "@/lib/domain/schedule";
import { cn } from "@/lib/utils";

export const metadata = { title: "Заказы" };

const STATUSES = Object.keys(ORDER_STATUS) as OrderStatus[];
const TYPES = Object.keys(REQUEST_TYPE) as RequestType[];
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

const waitSec = (from: Date, to: Date | null) =>
  to ? Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000)) : null;

const PAYMENT: Record<string, string> = { cash: "наличными", card: "картой", qr: "по QR" };

/** Requests keep no guest PII, so only safe service fields are shown. */
function payloadSummary(type: RequestType, p: Record<string, unknown>) {
  const s = (k: string) =>
    typeof p[k] === "string" || typeof p[k] === "number" ? String(p[k]) : "";
  if (type === "song")
    return [[s("artist"), s("title")].filter(Boolean).join(" — "), s("roomName")]
      .filter(Boolean)
      .join(" · ");
  if (type === "booking")
    return [s("date"), s("time"), s("guests") && `${s("guests")} гост.`, s("roomName")]
      .filter(Boolean)
      .join(" · ");
  if (type === "bill")
    return [PAYMENT[s("payment")] ?? s("payment"), s("waiterName")].filter(Boolean).join(" · ");
  return s("waiterName");
}

export default async function OrdersPage(props: PageProps<"/admin/orders">) {
  await requireAdmin("waiter");
  const sp = await props.searchParams;
  const now = new Date();
  const today = businessDay(now, VENUE_TZ, DAY_CUTOFF_HOUR);
  const range = normalizeRange(one(sp.from), one(sp.to), now);
  const tab = one(sp.tab) === "requests" ? "requests" : "orders";
  const rawTable = one(sp.table)?.trim().toUpperCase();
  const table = rawTable && TABLE_CODE_RE.test(rawTable) ? rawTable : undefined;
  const status = STATUSES.find((s) => s === one(sp.status));
  const type = TYPES.find((t) => t === one(sp.type));
  const db = await getDb();
  const keep = { tab, table, status, type };

  const tabLink = (t: string) => {
    const q = new URLSearchParams({
      tab: t,
      from: range.from,
      to: range.to,
      ...(table ? { table } : {}),
    });
    return `/admin/orders?${q}`;
  };

  return (
    <>
      <PageHeader
        title="Журнал"
        description="Сутки считаются с 06:00 до 06:00 — ночная смена попадает в один день."
      />
      <nav className="mb-3 flex gap-2" aria-label="Журнал">
        {(
          [
            ["orders", "Заказы"],
            ["requests", "Заявки"],
          ] as const
        ).map(([t, label]) => (
          <Link
            key={t}
            href={tabLink(t)}
            aria-current={tab === t ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-xl px-4 font-bold",
              tab === t ? "bg-surface-2 text-text" : "text-muted",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      <RangeForm path="/admin/orders" range={range} today={today} keep={keep} hidden={["tab"]}>
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          <span className="text-muted">Стол</span>
          <input
            name="table"
            defaultValue={table ?? ""}
            className={cn(filterInput, "w-24")}
            autoCapitalize="characters"
          />
        </label>
        {tab === "orders" ? (
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            <span className="text-muted">Статус</span>
            <select name="status" defaultValue={status ?? ""} className={filterInput}>
              <option value="">все</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ORDER_STATUS[s]!.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            <span className="text-muted">Тип</span>
            <select name="type" defaultValue={type ?? ""} className={filterInput}>
              <option value="">все</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {REQUEST_TYPE[t]}
                </option>
              ))}
            </select>
          </label>
        )}
      </RangeForm>

      {tab === "orders" ? (
        <OrdersList
          rows={await listOrders(db, { ...range, table, status })}
          multiDay={range.from !== range.to}
        />
      ) : (
        <RequestsList rows={await listRequests(db, { ...range, table, type })} />
      )}
    </>
  );
}

function OrdersList({
  rows,
  multiDay,
}: {
  rows: Awaited<ReturnType<typeof listOrders>>;
  multiDay: boolean;
}) {
  if (!rows.length)
    return (
      <p className="text-muted border-line rounded-2xl border border-dashed p-6 text-center">
        Заказов нет
      </p>
    );
  const total = rows.filter((r) => r.status !== "failed").reduce((s, r) => s + r.total, 0);
  return (
    <>
      <p className="text-muted mb-2 text-[14px]">
        {rows.length} заказов · {formatPrice(total)}
        {rows.length >= 300 ? " · показаны последние 300, сузьте период" : ""}
      </p>
      <ul className="flex flex-col gap-2">
        {rows.map((o) => {
          const st = ORDER_STATUS[o.status] ?? { label: o.status, tone: "muted" as const };
          return (
            <li key={o.id}>
              <details className="border-line bg-surface group rounded-2xl border">
                <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                  <span className="font-extrabold">№{o.dayNumber}</span>
                  <span className="bg-surface-2 rounded-lg px-2 py-0.5 font-bold">
                    стол {o.tableCode}
                  </span>
                  {!o.tableVerified ? <Badge tone="warn">без QR</Badge> : null}
                  <Badge tone={st.tone}>{st.label}</Badge>
                  <span className="text-muted text-[13px]">
                    {multiDay ? fmtDateTime(o.createdAt) : fmtTime(o.createdAt)}
                  </span>
                  <span className="ml-auto font-bold">{formatPrice(o.total)}</span>
                </summary>
                <div className="border-line border-t px-4 py-3 text-[14px]">
                  <ul className="flex flex-col gap-1">
                    {o.lines.map((l) => (
                      <li
                        key={l.itemId}
                        className={cn(
                          "flex gap-2",
                          o.unavailableItemIds.includes(l.itemId) && "text-muted line-through",
                        )}
                      >
                        <span className="flex-1">
                          {l.nameRu} × {l.qty}
                        </span>
                        <span>{formatPrice(l.lineTotal)}</span>
                      </li>
                    ))}
                  </ul>
                  <dl className="text-muted mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                    <dt>Подытог</dt>
                    <dd>
                      {formatPrice(o.subtotal)}
                      {o.service ? ` + обслуживание ${formatPrice(o.service)}` : ""}
                    </dd>
                    <dt>Официант</dt>
                    <dd>{o.waiterName}</dd>
                    {o.acceptedBy ? (
                      <>
                        <dt>Принял</dt>
                        <dd>
                          {o.acceptedBy} через {fmtDuration(waitSec(o.createdAt, o.acceptedAt))}
                        </dd>
                      </>
                    ) : null}
                    {o.comment ? (
                      <>
                        <dt>Комментарий</dt>
                        <dd className="text-text">{o.comment}</dd>
                      </>
                    ) : null}
                    {o.split?.length ? (
                      <>
                        <dt>Раздельно</dt>
                        <dd>
                          {o.split.map((p) => `${p.name}: ${formatPrice(p.total)}`).join(", ")}
                        </dd>
                      </>
                    ) : null}
                    <dt>Код</dt>
                    <dd className="font-mono">{o.publicId}</dd>
                  </dl>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function RequestsList({ rows }: { rows: Awaited<ReturnType<typeof listRequests>> }) {
  if (!rows.length)
    return (
      <p className="text-muted border-line rounded-2xl border border-dashed p-6 text-center">
        Заявок нет
      </p>
    );
  return (
    <ul className="border-line bg-surface divide-line divide-y overflow-hidden rounded-2xl border">
      {rows.map((r) => {
        const st = ORDER_STATUS[r.status] ?? { label: r.status, tone: "muted" as const };
        const extra = payloadSummary(r.type, r.payload);
        return (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
            <span className="font-bold">{REQUEST_TYPE[r.type] ?? r.type}</span>
            {r.tableCode ? (
              <span className="bg-surface-2 rounded-lg px-2 py-0.5 text-[14px] font-bold">
                стол {r.tableCode}
              </span>
            ) : null}
            <Badge tone={st.tone}>{st.label}</Badge>
            <span className="text-muted text-[13px]">{fmtDateTime(r.createdAt)}</span>
            {r.acceptedBy ? (
              <span className="text-muted text-[13px]">
                {r.acceptedBy} · {fmtDuration(waitSec(r.createdAt, r.acceptedAt))}
              </span>
            ) : null}
            {extra ? <span className="w-full text-[14px]">{extra}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
