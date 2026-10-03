import { PageHeader } from "@/components/admin/page-header";
import { Badge, Card } from "@/components/admin/ui";
import { fmtDateTime } from "@/lib/admin/format";
import { outboxStatus } from "@/lib/admin/reports";
import { requireAdmin } from "@/lib/admin/session";
import { getDb } from "@/lib/db/client";
import { getKv } from "@/lib/kv/kv";
import { log } from "@/lib/log";
import { storageConfigured } from "@/lib/media/images";
import { getBot } from "@/lib/telegram/bot";
import { translatorConfigured } from "@/lib/translate/provider";
import { BotTestButton, RetryButton } from "./system-actions";

export const metadata = { title: "Система" };

type Webhook = {
  url: string;
  pending: number;
  lastError: string | null;
  lastErrorAt: Date | null;
} | null;

async function webhookInfo(holder: ReturnType<typeof getBot>): Promise<Webhook | "error"> {
  if (holder.mock) return null;
  try {
    const w = await holder.bot.api.getWebhookInfo();
    return {
      url: w.url ? new URL(w.url).host + new URL(w.url).pathname : "",
      pending: w.pending_update_count,
      lastError: w.last_error_message ?? null,
      lastErrorAt: w.last_error_date ? new Date(w.last_error_date * 1000) : null,
    };
  } catch (err) {
    log.warn({ err }, "getWebhookInfo failed");
    return "error";
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-2">
      <span className="text-muted w-44 text-[14px]">{label}</span>
      <span className="flex flex-wrap items-center gap-2">{children}</span>
    </div>
  );
}

export default async function SystemPage() {
  await requireAdmin("manager");
  const db = await getDb();
  const kv = await getKv();
  const holder = getBot(async () => ({ db, kv }));
  const [ob, hook] = await Promise.all([outboxStatus(db), webhookInfo(holder)]);
  const now = new Date();
  const oldestMin = ob.oldestPendingAt
    ? Math.round((now.getTime() - ob.oldestPendingAt.getTime()) / 60_000)
    : 0;

  return (
    <>
      <PageHeader
        title="Система"
        description="Связь с Telegram, очередь отправки и подключённые сервисы."
      />
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Telegram-бот</h2>
          <Row label="Режим">
            {holder.mock ? (
              <Badge tone="warn">тестовый: сообщения никуда не уходят</Badge>
            ) : (
              <Badge tone="ok">боевой</Badge>
            )}
          </Row>
          {hook === "error" ? (
            <Row label="Webhook">
              <Badge tone="danger">Telegram не ответил</Badge>
            </Row>
          ) : hook ? (
            <>
              <Row label="Webhook">
                {hook.url ? (
                  <span className="font-mono text-[13px]">{hook.url}</span>
                ) : (
                  <Badge tone="danger">не установлен</Badge>
                )}
              </Row>
              <Row label="Ждут обработки">{hook.pending}</Row>
              {hook.lastError ? (
                <Row label="Последняя ошибка">
                  <span className="text-danger text-[14px]">
                    {hook.lastError} · {fmtDateTime(hook.lastErrorAt)}
                  </span>
                </Row>
              ) : null}
            </>
          ) : null}
          <BotTestButton />
        </Card>

        <Card className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Очередь отправки (outbox)</h2>
          <p className="text-muted text-[13px]">
            Заказы и заявки сначала пишутся в базу, потом отдельный процесс отправляет их в Telegram
            с повторами.
          </p>
          <Row label="В очереди">
            <span className="font-bold">{ob.pending + ob.processing}</span>
            {ob.pending && oldestMin >= 2 ? (
              <Badge tone="danger">старейшей {oldestMin} мин — проверьте воркер</Badge>
            ) : null}
          </Row>
          <Row label="Отправлено">{ob.sent}</Row>
          <Row label="Не доставлено">{ob.dead ? <Badge tone="danger">{ob.dead}</Badge> : "0"}</Row>
          {ob.problems.length ? (
            <ul className="divide-line border-line mt-2 divide-y rounded-xl border">
              {ob.problems.map((j) => (
                <li
                  key={j.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[14px]"
                >
                  <span className="font-mono">#{j.id}</span>
                  <span>{j.kind}</span>
                  <Badge tone={j.status === "dead" ? "danger" : "warn"}>
                    {j.status === "dead" ? "не доставлено" : `повтор ${j.attempts}`}
                  </Badge>
                  <span className="text-muted text-[13px]">{fmtDateTime(j.createdAt)}</span>
                  {j.lastError ? (
                    <span className="text-muted w-full truncate text-[13px]">{j.lastError}</span>
                  ) : null}
                  {j.status === "dead" ? <RetryButton ids={[j.id]} label="Повторить" /> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {ob.dead ? <RetryButton ids="all" label={`Повторить все (${ob.dead})`} /> : null}
        </Card>

        <Card className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Сервисы</h2>
          <Row label="Хранилище фото">
            {storageConfigured() ? (
              <Badge tone="ok">Cloudflare R2</Badge>
            ) : (
              <Badge tone="warn">локальная папка сервера</Badge>
            )}
          </Row>
          <Row label="Автоперевод">
            {translatorConfigured() ? (
              <Badge tone="ok">подключён</Badge>
            ) : (
              <Badge tone="warn">ключ не задан</Badge>
            )}
          </Row>
        </Card>
      </div>
    </>
  );
}
