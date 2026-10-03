import { createHash, randomBytes } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { adminUsers, items, orderCounters, orders, outbox, tables, waiters } from "@/lib/db/schema";
import { businessDay, openStatus } from "@/lib/domain/schedule";
import { NATIVE_LOCALES, type NativeLocale, type PublicItem } from "@/lib/domain/types";
import { pick } from "@/lib/i18n/text";
import type { Kv } from "@/lib/kv/kv";
import { getLiveState, getPublished } from "@/lib/menu/repository";
import {
  CAPTCHA_IP_THRESHOLD,
  checkLimits,
  ORDER_LIMITS,
  peekCount,
} from "@/lib/security/rate-limit";
import { verifyTableToken } from "@/lib/security/table-token";
import type { OrderInput } from "@/lib/validation/schemas";
import { priceOrder, splitOrder } from "./pricing";
import {
  ANY_WAITER,
  DUPLICATE_WINDOW_MS,
  REMIND_AFTER_MS,
  type OrderErrorBody,
  type OrderStatusView,
} from "./types";

export type OrderRow = typeof orders.$inferSelect;

export type OrderDeps = {
  db: Db;
  kv: Kv;
  now: Date;
  /** hashed already (see hashId) */
  ipHash: string;
  sessionHash: string;
  tableSecret: string;
  captcha: { siteKey: string; verify: (token: string) => Promise<boolean> } | null;
};

export type CreateOrderResult =
  { ok: true; order: OrderStatusView; replay: boolean } | ({ status: number } & OrderErrorBody);

const fail = (
  status: number,
  error: OrderErrorBody["error"],
  extra: Omit<OrderErrorBody, "ok" | "error"> = {},
): CreateOrderResult => ({ ok: false, status, error, ...extra });

export const OUTBOX_WAKE = "outbox:wake";
export const orderChannel = (publicId: string) => `order:${publicId}`;

function fingerprint(table: string, lines: { itemId: string; qty: number }[]): string {
  const key = [...lines]
    .sort((a, b) => a.itemId.localeCompare(b.itemId))
    .map((l) => `${l.itemId}x${l.qty}`)
    .join(",");
  return createHash("sha256").update(`${table}|${key}`).digest("base64url").slice(0, 22);
}

async function resolveTable(
  db: Db,
  input: Pick<OrderInput, "tableToken" | "tableCode">,
  secret: string,
): Promise<
  { ok: true; code: string; verified: boolean } | { ok: false; error: OrderErrorBody["error"] }
> {
  if (input.tableToken) {
    const parsed = verifyTableToken(secret, input.tableToken);
    if (!parsed) return { ok: false, error: "table_token_invalid" };
    const [row] = await db.select().from(tables).where(eq(tables.code, parsed.code));
    if (!row || !row.isActive || row.tokenVersion !== parsed.version)
      return { ok: false, error: "table_token_invalid" };
    return { ok: true, code: row.code, verified: true };
  }
  if (!input.tableCode) return { ok: false, error: "table_required" };
  const [row] = await db.select().from(tables).where(eq(tables.code, input.tableCode));
  if (!row || !row.isActive) return { ok: false, error: "table_unknown" };
  return { ok: true, code: row.code, verified: false };
}

export async function createOrder(
  deps: OrderDeps,
  input: OrderInput,
  idempotencyKey: string,
): Promise<CreateOrderResult> {
  const { db, kv, now } = deps;

  const existing = await findByIdempotencyKey(db, idempotencyKey);
  if (existing) return { ok: true, order: await toStatusView(db, existing), replay: true };

  const lockKey = `idem:${idempotencyKey}`;
  if (!(await kv.setNx(lockKey, "1", 20_000))) return fail(409, "in_progress");
  try {
    const published = await getPublished(db);
    if (!published) return fail(503, "orders_disabled");
    const live = await getLiveState(db);
    if (!live.features.orders) return fail(503, "orders_disabled");
    const { venue } = published.snapshot;
    if (!openStatus(venue.hours, now, venue.timezone).open) return fail(409, "closed");

    const table = await resolveTable(db, input, deps.tableSecret);
    if (!table.ok) return fail(400, table.error);

    const ids = { table: table.code, session: deps.sessionHash, ip: deps.ipHash };
    if (deps.captcha) {
      const ipKey = `order:${table.verified ? "ip" : "uip"}:${deps.ipHash}`;
      if ((await peekCount(kv, ipKey)) >= CAPTCHA_IP_THRESHOLD) {
        if (!input.turnstileToken)
          return fail(403, "captcha_required", { siteKey: deps.captcha.siteKey });
        if (!(await deps.captcha.verify(input.turnstileToken))) return fail(403, "captcha_failed");
      }
    }
    const limit = await checkLimits(
      kv,
      table.verified ? ORDER_LIMITS.verified(ids) : ORDER_LIMITS.unverified(ids),
    );
    if (!limit.ok)
      return fail(429, "rate_limited", { retryAfterSec: Math.ceil(limit.retryAfterMs / 1000) });

    let waiter: { id: string; name: string } | null = null;
    if (input.waiterId !== ANY_WAITER) {
      waiter = live.waiters.find((w) => w.id === input.waiterId) ?? null;
      if (!waiter) return fail(400, "waiter_unknown");
    }

    const byId = new Map<string, PublicItem>(published.snapshot.items.map((i) => [i.id, i]));
    const priced = priceOrder(input.lines, byId, new Set(live.soldOut), {
      now,
      tz: venue.timezone,
      locale: input.locale,
      serviceRateBp: venue.serviceRateBp,
    });
    if (!priced.ok) return fail(409, "unavailable", { unavailable: priced.unavailable });

    const fp = fingerprint(table.code, input.lines);
    const previous = await kv.get(`fp:${fp}`);
    if (previous && !input.confirmDuplicate)
      return fail(409, "duplicate", { duplicateOf: Number(previous) });

    const split = splitOrder(input.split, priced.lines, priced.totals, venue.serviceRateBp);
    const day = businessDay(now, venue.timezone);
    const publicId = randomBytes(16).toString("base64url");

    const row = await db.transaction(async (tx) => {
      const [counter] = await tx
        .insert(orderCounters)
        .values({ businessDay: day, last: 1 })
        .onConflictDoUpdate({
          target: orderCounters.businessDay,
          set: { last: sql`${orderCounters.last} + 1` },
        })
        .returning({ last: orderCounters.last });
      const [inserted] = await tx
        .insert(orders)
        .values({
          publicId,
          businessDay: day,
          dayNumber: counter!.last,
          tableCode: table.code,
          tableVerified: table.verified,
          waiterId: waiter?.id ?? null,
          waiterName: waiter?.name ?? "",
          locale: input.locale,
          lines: priced.lines,
          subtotal: priced.totals.subtotal,
          service: priced.totals.service,
          total: priced.totals.total,
          serviceRateBp: venue.serviceRateBp,
          comment: input.comment || null,
          split,
          idempotencyKey,
          ipHash: deps.ipHash,
          sessionHash: deps.sessionHash,
          createdAt: now,
        })
        .returning();
      await tx
        .insert(outbox)
        .values({ kind: "order.new", refId: inserted!.id, nextAttemptAt: now });
      return inserted!;
    });

    // Recorded only after the order is safely queued, so a failed attempt never blocks a retry.
    await kv.set(`fp:${fp}`, String(row.dayNumber), DUPLICATE_WINDOW_MS);
    await kv.publish(OUTBOX_WAKE, "order");
    return { ok: true, order: await toStatusView(db, row), replay: false };
  } finally {
    await kv.del(lockKey);
  }
}

export async function findByIdempotencyKey(db: Db, key: string): Promise<OrderRow | null> {
  const [row] = await db.select().from(orders).where(eq(orders.idempotencyKey, key));
  return row ?? null;
}

export async function findByPublicId(db: Db, publicId: string): Promise<OrderRow | null> {
  const [row] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  return row ?? null;
}

export async function findById(db: Db, id: number): Promise<OrderRow | null> {
  const [row] = await db.select().from(orders).where(eq(orders.id, id));
  return row ?? null;
}

function guestLocale(locale: string): NativeLocale {
  return (NATIVE_LOCALES as readonly string[]).includes(locale) ? (locale as NativeLocale) : "ru";
}

export async function toStatusView(db: Db, o: OrderRow): Promise<OrderStatusView> {
  let unavailable: string[] = [];
  if (o.unavailableItemIds.length) {
    const rows = await db
      .select({ id: items.id, name: items.name })
      .from(items)
      .where(inArray(items.id, o.unavailableItemIds));
    const loc = guestLocale(o.locale);
    unavailable = o.unavailableItemIds.map((id) => {
      const r = rows.find((x) => x.id === id);
      return r ? pick(r.name, loc) : (o.lines.find((l) => l.itemId === id)?.nameGuest ?? id);
    });
  }
  const waiting = o.status === "queued" || o.status === "sent";
  return {
    publicId: o.publicId,
    number: o.dayNumber,
    status: o.status,
    acceptedBy: o.acceptedBy,
    unavailable,
    total: o.total,
    createdAt: o.createdAt.toISOString(),
    remindAt:
      waiting && !o.remindedAt
        ? new Date(o.createdAt.getTime() + REMIND_AFTER_MS).toISOString()
        : null,
  };
}

export async function publishStatus(db: Db, kv: Kv, o: OrderRow): Promise<OrderStatusView> {
  const view = await toStatusView(db, o);
  await kv.publish(orderChannel(o.publicId), JSON.stringify(view));
  return view;
}

/** One reminder per order, only while it is still waiting and at least 3 minutes old. */
export async function remindOrder(
  db: Db,
  kv: Kv,
  publicId: string,
  now: Date,
): Promise<
  | { ok: true; order: OrderStatusView }
  | { ok: false; status: number; error: "not_found" | "remind_not_allowed" }
> {
  const o = await findByPublicId(db, publicId);
  if (!o) return { ok: false, status: 404, error: "not_found" };
  const due = o.createdAt.getTime() + REMIND_AFTER_MS <= now.getTime();
  if (!due || o.remindedAt || (o.status !== "queued" && o.status !== "sent"))
    return { ok: false, status: 409, error: "remind_not_allowed" };
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(orders)
      .set({ remindedAt: now })
      .where(and(eq(orders.id, o.id), isNull(orders.remindedAt)))
      .returning();
    if (row)
      await tx.insert(outbox).values({ kind: "order.remind", refId: row.id, nextAttemptAt: now });
    return row ?? null;
  });
  if (!updated) return { ok: false, status: 409, error: "remind_not_allowed" };
  await kv.publish(OUTBOX_WAKE, "remind");
  return { ok: true, order: await publishStatus(db, kv, updated) };
}

/** Staff allowed to press order buttons: active waiters and owner/manager admins linked to Telegram. */
export async function findStaff(db: Db, telegramUserId: number): Promise<{ name: string } | null> {
  const [w] = await db
    .select({ name: waiters.name })
    .from(waiters)
    .where(and(eq(waiters.telegramUserId, telegramUserId), eq(waiters.isActive, true)));
  if (w) return w;
  const [a] = await db
    .select({ name: adminUsers.name })
    .from(adminUsers)
    .where(
      and(
        eq(adminUsers.telegramUserId, telegramUserId),
        eq(adminUsers.isActive, true),
        inArray(adminUsers.role, ["owner", "manager"]),
      ),
    );
  return a ?? null;
}

export async function acceptOrder(
  db: Db,
  orderId: number,
  staff: { name: string; telegramUserId: number },
  now: Date,
): Promise<{ changed: boolean; order: OrderRow | null }> {
  const [row] = await db
    .update(orders)
    .set({
      status: "accepted",
      acceptedBy: staff.name,
      acceptedByTg: staff.telegramUserId,
      acceptedAt: now,
    })
    .where(and(eq(orders.id, orderId), inArray(orders.status, ["queued", "sent", "failed"])))
    .returning();
  if (row) return { changed: true, order: row };
  return { changed: false, order: await findById(db, orderId) };
}

/** "Нет блюда": puts the dish on the stop-list and records it on the order for the guest. */
export async function markUnavailable(
  db: Db,
  orderId: number,
  lineIndex: number,
): Promise<{ order: OrderRow; itemId: string } | null> {
  const o = await findById(db, orderId);
  const line = o?.lines[lineIndex];
  if (!o || !line) return null;
  return db.transaction(async (tx) => {
    await tx
      .update(items)
      .set({ soldOut: true, updatedAt: new Date() })
      .where(eq(items.id, line.itemId));
    const [row] = await tx
      .update(orders)
      .set({ unavailableItemIds: [...new Set([...o.unavailableItemIds, line.itemId])] })
      .where(eq(orders.id, orderId))
      .returning();
    return { order: row!, itemId: line.itemId };
  });
}
