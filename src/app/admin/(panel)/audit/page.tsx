import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { filterInput } from "@/components/admin/range-form";
import { AUDIT_LABELS } from "@/lib/admin/audit";
import { fmtDateTime } from "@/lib/admin/format";
import { listAudit } from "@/lib/admin/reports";
import { requireAdmin } from "@/lib/admin/session";
import { getDb } from "@/lib/db/client";
import { cn } from "@/lib/utils";

export const metadata = { title: "Журнал действий" };

const PAGE = 100;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

function details(d: Record<string, unknown> | null) {
  if (!d) return "";
  return Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
    .map(([k, v]) => `${k}: ${typeof v === "boolean" ? (v ? "да" : "нет") : String(v)}`)
    .join(" · ")
    .slice(0, 200);
}

export default async function AuditPage(props: PageProps<"/admin/audit">) {
  await requireAdmin("owner");
  const sp = await props.searchParams;
  const q = one(sp.q)?.trim().slice(0, 60) || undefined;
  const before = Number(one(sp.before)) || undefined;
  const rows = await listAudit(await getDb(), { q, before, limit: PAGE });
  const last = rows.at(-1);

  return (
    <>
      <PageHeader
        title="Журнал действий"
        description="Кто и что менял в админке. IP хранятся только в виде хэша."
      />
      <form method="get" className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Поиск: логин, действие, код блюда"
          aria-label="Поиск"
          className={cn(filterInput, "flex-1")}
        />
        <button
          type="submit"
          className="bg-surface-2 border-line min-h-11 rounded-xl border px-4 font-semibold"
        >
          Найти
        </button>
      </form>
      {rows.length ? (
        <ul className="border-line bg-surface divide-line divide-y overflow-hidden rounded-2xl border">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 text-[14px]"
            >
              <span className="text-muted w-24 shrink-0 text-[13px] tabular-nums">
                {fmtDateTime(r.createdAt)}
              </span>
              <span className="font-semibold">{r.userLogin ?? "—"}</span>
              <span
                className={
                  r.action.endsWith("_failed") || r.action.includes("fail") ? "text-danger" : ""
                }
              >
                {AUDIT_LABELS[r.action] ?? r.action}
              </span>
              {r.entityId ? (
                <span className="text-muted font-mono text-[13px]">{r.entityId}</span>
              ) : null}
              {r.details ? (
                <span className="text-muted w-full text-[13px]">{details(r.details)}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted border-line rounded-2xl border border-dashed p-6 text-center">
          Записей нет
        </p>
      )}
      {rows.length === PAGE && last ? (
        <Link
          href={`/admin/audit?${new URLSearchParams({ ...(q ? { q } : {}), before: String(last.id) })}`}
          className="border-line bg-surface-2 mt-3 inline-flex min-h-11 items-center rounded-xl border px-4 font-semibold"
        >
          Показать раньше
        </Link>
      ) : null}
    </>
  );
}
