import { and, asc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import { GrammyError } from "grammy";
import type { Db } from "@/lib/db/client";
import { orders, outbox } from "@/lib/db/schema";
import type { Kv } from "@/lib/kv/kv";
import { log } from "@/lib/log";
import { findById, OUTBOX_WAKE, publishStatus } from "@/lib/orders/service";
import { formatReminder, mainKeyboard, type InlineKeyboard } from "@/lib/orders/telegram-text";
import { renderOrder, type BotHolder } from "@/lib/telegram/bot";

export const MAX_ATTEMPTS = 8;
const LOCK_MS = 60_000;
const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 10 * 60_000;

export type Sender = {
  send(text: string, opts?: { keyboard?: InlineKeyboard; replyTo?: number }): Promise<number>;
};

export function botSender(h: BotHolder): Sender {
  return {
    async send(text, opts = {}) {
      const msg = await h.bot.api.sendMessage(h.chatId, text, {
        link_preview_options: { is_disabled: true },
        ...(opts.keyboard ? { reply_markup: opts.keyboard } : {}),
        ...(opts.replyTo
          ? { reply_parameters: { message_id: opts.replyTo, allow_sending_without_reply: true } }
          : {}),
      });
      return msg.message_id;
    },
  };
}

type Job = typeof outbox.$inferSelect;

/** Claims due jobs (and jobs whose worker died mid-flight) without blocking other workers. */
export async function claimDue(db: Db, now: Date, limit = 10): Promise<Job[]> {
  const due = db
    .select({ id: outbox.id })
    .from(outbox)
    .where(
      or(
        and(eq(outbox.status, "pending"), lte(outbox.nextAttemptAt, now)),
        and(eq(outbox.status, "processing"), lt(outbox.lockedUntil, now)),
      ),
    )
    .orderBy(asc(outbox.id))
    .limit(limit)
    .for("update", { skipLocked: true });
  return db
    .update(outbox)
    .set({
      status: "processing",
      lockedUntil: new Date(now.getTime() + LOCK_MS),
      attempts: sql`${outbox.attempts} + 1`,
    })
    .where(inArray(outbox.id, due))
    .returning();
}

export function retryDelayMs(attempts: number, err: unknown): number {
  if (err instanceof GrammyError && err.error_code === 429) {
    const after = err.parameters.retry_after;
    if (after) return after * 1000;
  }
  return Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1), MAX_DELAY_MS);
}

function errorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot<redacted>").slice(0, 500);
}

async function runJob(db: Db, kv: Kv, sender: Sender, job: Job, now: Date) {
  if (job.kind === "order.new" || job.kind === "order.remind") {
    const o = job.refId ? await findById(db, job.refId) : null;
    if (!o) return;
    if (job.kind === "order.remind") {
      await sender.send(formatReminder(o.dayNumber, o.tableCode), {
        replyTo: o.telegramMessageId ?? undefined,
      });
      return;
    }
    if (o.telegramMessageId) return; // delivered before a crash; never post twice
    const messageId = await sender.send(renderOrder(o), {
      keyboard: mainKeyboard(o.id, o.status === "accepted"),
    });
    const [updated] = await db
      .update(orders)
      .set({
        telegramMessageId: messageId,
        sentAt: now,
        status: sql`case when ${orders.status} = 'queued' then 'sent' else ${orders.status} end`,
      })
      .where(eq(orders.id, o.id))
      .returning();
    if (updated) await publishStatus(db, kv, updated);
    return;
  }
  log.warn({ kind: job.kind }, "outbox: unknown job kind, dropping");
}

/** One pass over due jobs. Returns how many were processed. */
export async function processOutbox(deps: { db: Db; kv: Kv; sender: Sender; now?: () => Date }) {
  const now = deps.now ?? (() => new Date());
  const jobs = await claimDue(deps.db, now());
  for (const job of jobs) {
    try {
      await runJob(deps.db, deps.kv, deps.sender, job, now());
      await deps.db
        .update(outbox)
        .set({ status: "sent", sentAt: now(), lockedUntil: null, lastError: null })
        .where(eq(outbox.id, job.id));
    } catch (err) {
      const dead = job.attempts >= MAX_ATTEMPTS;
      log.warn(
        { err: errorText(err), kind: job.kind, attempts: job.attempts, dead },
        "outbox job failed",
      );
      await deps.db
        .update(outbox)
        .set({
          status: dead ? "dead" : "pending",
          lockedUntil: null,
          lastError: errorText(err),
          nextAttemptAt: new Date(now().getTime() + retryDelayMs(job.attempts, err)),
        })
        .where(eq(outbox.id, job.id));
      if (dead && job.kind === "order.new" && job.refId) {
        const [failed] = await deps.db
          .update(orders)
          .set({ status: "failed" })
          .where(and(eq(orders.id, job.refId), eq(orders.status, "queued")))
          .returning();
        if (failed) await publishStatus(deps.db, deps.kv, failed);
      }
    }
  }
  return jobs.length;
}

export async function purgeOutbox(db: Db, now: Date) {
  const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  await db.delete(outbox).where(and(eq(outbox.status, "sent"), lt(outbox.sentAt, cutoff)));
}

/**
 * Polls every few seconds and wakes immediately on `outbox:wake` (Redis pub/sub in production,
 * an in-process bus locally), so the guest sees "sent" within a second.
 */
export async function runWorkerLoop(opts: {
  getDeps: () => Promise<{ db: Db; kv: Kv; sender: Sender }>;
  intervalMs?: number;
  signal?: AbortSignal;
}) {
  const { db, kv, sender } = await opts.getDeps();
  let running = false;
  let again = false;
  let lastPurge = 0;
  const tick = async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        while ((await processOutbox({ db, kv, sender })) > 0) {
          /* drain */
        }
      } while (again);
      if (Date.now() - lastPurge > 60 * 60_000) {
        lastPurge = Date.now();
        await purgeOutbox(db, new Date());
      }
    } catch (err) {
      log.error({ err: errorText(err) }, "outbox tick failed");
    } finally {
      running = false;
    }
  };
  const unsubscribe = await kv.subscribe(OUTBOX_WAKE, () => void tick());
  const timer = setInterval(() => void tick(), opts.intervalMs ?? 3000);
  timer.unref?.();
  void tick();
  opts.signal?.addEventListener("abort", () => {
    clearInterval(timer);
    void unsubscribe();
  });
}

const g = globalThis as unknown as { __unipubWorker?: boolean };

/** WORKER_MODE=inline (local dev, staging): the loop runs inside the Next.js server process. */
export function startInlineWorker() {
  if (g.__unipubWorker) return;
  g.__unipubWorker = true;
  void runWorkerLoop({
    getDeps: async () => {
      const [{ getDb }, { getKv }, { getBot }] = await Promise.all([
        import("@/lib/db/client"),
        import("@/lib/kv/kv"),
        import("@/lib/telegram/bot"),
      ]);
      const db = await getDb();
      const kv = await getKv();
      return { db, kv, sender: botSender(getBot(async () => ({ db, kv }))) };
    },
  }).then(() => log.info("inline outbox worker started"));
}
