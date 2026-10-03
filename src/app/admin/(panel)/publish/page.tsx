import { PageHeader } from "@/components/admin/page-header";
import { Badge, Card } from "@/components/admin/ui";
import { hasRole } from "@/lib/admin/auth";
import { draftStatus } from "@/lib/admin/catalog";
import { fmtDateTime } from "@/lib/admin/format";
import { listVersions } from "@/lib/admin/reports";
import { requireAdmin } from "@/lib/admin/session";
import { getDb } from "@/lib/db/client";
import { ImportForm, PublishForm, RollbackButton } from "./publish-forms";

export const metadata = { title: "Публикация" };

function Names({
  label,
  ids,
  tone,
}: {
  label: string;
  ids: string[];
  tone: "ok" | "warn" | "danger";
}) {
  if (!ids.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone={tone}>
        {label}: {ids.length}
      </Badge>
      <span className="text-muted text-[13px]">
        {ids.slice(0, 8).join(", ")}
        {ids.length > 8 ? ` и ещё ${ids.length - 8}` : ""}
      </span>
    </div>
  );
}

export default async function PublishPage() {
  const session = await requireAdmin("manager");
  const db = await getDb();
  const [status, versions] = await Promise.all([draftStatus(db), listVersions(db)]);
  const isOwner = hasRole(session.user.role, "owner");

  return (
    <>
      <PageHeader
        title="Публикация"
        description="Правки блюд, категорий и заведения копятся в черновике. Стоп-лист, акции, официанты и функции работают сразу."
      />
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex-1 text-lg font-bold">Черновик</h2>
            {status.dirty ? (
              <Badge tone="warn">есть неопубликованные правки</Badge>
            ) : (
              <Badge tone="ok">совпадает с опубликованным</Badge>
            )}
          </div>
          {status.dirty ? (
            <div className="flex flex-col gap-1.5">
              <Names label="Новые" ids={status.added} tone="ok" />
              <Names label="Изменены" ids={status.changed} tone="warn" />
              <Names label="Убраны" ids={status.removed} tone="danger" />
              {status.categories ? <Badge tone="warn">категории: {status.categories}</Badge> : null}
              {status.venue ? <Badge tone="warn">данные заведения</Badge> : null}
            </div>
          ) : null}
          <a
            href="/ru/preview"
            target="_blank"
            rel="noopener"
            className="border-line bg-surface-2 inline-flex min-h-11 w-fit items-center rounded-xl border px-4 font-semibold"
          >
            Открыть предпросмотр черновика ↗
          </a>
          <PublishForm dirty={status.dirty} />
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-bold">История версий</h2>
          {versions.length ? (
            <ul className="divide-line divide-y">
              {versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <span className="font-extrabold">v{v.id}</span>
                  {v.id === status.publishedId ? <Badge tone="ok">сейчас у гостей</Badge> : null}
                  <span className="text-muted text-[13px]">
                    {fmtDateTime(v.createdAt)} · {v.author ?? "система"} · {v.items} блюд
                  </span>
                  {v.restoredFrom ? <Badge>откат к v{v.restoredFrom}</Badge> : null}
                  {v.note ? <span className="w-full text-[14px]">{v.note}</span> : null}
                  {v.id !== status.publishedId ? (
                    <div className="ml-auto">
                      <RollbackButton id={v.id} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">Меню ещё не публиковалось</p>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">Резервная копия</h2>
          <p className="text-muted text-[14px]">
            JSON с блюдами, категориями и акциями черновика. Фото остаются в хранилище — в файле
            только ссылки.
          </p>
          <a
            href="/admin/api/export"
            download
            className="border-line bg-surface-2 inline-flex min-h-11 w-fit items-center rounded-xl border px-4 font-semibold"
          >
            Скачать JSON
          </a>
          {isOwner ? <ImportForm /> : null}
        </Card>
      </div>
    </>
  );
}
