import { and, count, desc, eq, gte, ilike, inArray, lt, lte, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  adminUsers,
  auditLog,
  guestRequests,
  menuVersions,
  orders,
  outbox,
  type OrderStatus,
  type RequestType,
} from "@/lib/db/schema";
import { addDaysYmd, businessDay, VENUE_TZ, zonedParts } from "@/lib/domain/schedule";

export const DAY_CUTOFF_HOUR = 6;
export const MAX_RANGE_DAYS = 92;

/** UTC instant of a wall-clock time in the venue timezone (offset found via Intl, no hardcoded +5). */
export function venueTimeToUtc(ymd: string, hour: number, tz = VENUE_TZ): Date {
  const guess = new Date(`${ymd}T${String(hour).padStart(2, "0")}:00:00Z`);
  const p = zonedParts(guess, tz);
  const shown = Date.UTC(
    Number(p.ymd.slice(0, 4)),
    Number(p.ymd.slice(5, 7)) - 1,
    Number(p.ymd.slice(8, 10)),
    p.hour,
    p.minute,
  );
  return new Date(guess.getTime() - (shown - guess.getTime()));
}

export type DayRange = { from: string; to: string };

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Clamps a user-supplied business-day range: valid dates, from ≤ to, at most MAX_RANGE_DAYS. */
export function normalizeRange(
  from: string | undefined,
  to: string | undefined,
  now: Date,
): DayRange {
  const today = businessDay(now, VENUE_TZ, DAY_CUTOFF_HOUR);
  let t = to && YMD.test(to) ? to : today;
  let f = from && YMD.test(from) ? from : t;
  if (f > t) [f, t] = [t, f];
  const minFrom = addDaysYmd(t, -(MAX_RANGE_DAYS - 1));
  if (f < minFrom) f = minFrom;
  return { from: f, to: t };
}

export function rangeBounds(r: DayRange) {
  return {
    start: venueTimeToUtc(r.from, DAY_CUTOFF_HOUR),
    end: venueTimeToUtc(addDaysYmd(r.to, 1), DAY_CUTOFF_HOUR),
  };
}

// ── Journal ──────────────────────────────────────────────────────────────────

export type OrderFilter = DayRange & { table?: string; status?: OrderStatus };

export async function listOrders(db: Db, f: OrderFilter, limit = 300) {
  const where: SQL[] = [gte(orders.businessDay, f.from), lte(orders.businessDay, f.to)];
  if (f.table) where.push(eq(orders.tableCode, f.table.toUpperCase()));
  if (f.status) where.push(eq(orders.status, f.status));
  return db
    .select()
    .from(orders)
    .where(and(...where))
    .orderBy(desc(orders.id))
    .limit(limit);
}

export type RequestFilter = DayRange & { table?: string; type?: RequestType };

export async function listRequests(db: Db, f: RequestFilter, limit = 300) {
  const { start, end } = rangeBounds(f);
  const where: SQL[] = [gte(guestRequests.createdAt, start), lt(guestRequests.createdAt, end)];
  if (f.table) where.push(eq(guestRequests.tableCode, f.table.toUpperCase()));
  if (f.type) where.push(eq(guestRequests.type, f.type));
  return db
    .select()
    .from(guestRequests)
    .where(and(...where))
    .orderBy(desc(guestRequests.id))
    .limit(limit);
}

// ── Analytics ────────────────────────────────────────────────────────────────

type OrderFacts = {
  createdAt: Date;
  acceptedAt: Date | null;
  status: OrderStatus;
  total: number;
  acceptedBy: string | null;
  lines: { itemId: string; nameRu: string; qty: number; lineTotal: number }[];
};

export type Analytics = {
  orders: number;
  failed: number;
  revenue: number;
  avgCheck: number;
  acceptedShare: number;
  acceptMedianSec: number | null;
  acceptP90Sec: number | null;
  byHour: number[];
  topItems: { itemId: string; name: string; qty: number; revenue: number }[];
  byStaff: { name: string; count: number }[];
  requests: Record<RequestType, number>;
};

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx]!;
}

/** Pure aggregation (unit-tested); failed orders count only in `failed`. */
export function aggregate(
  rows: OrderFacts[],
  requests: { type: RequestType }[],
  tz = VENUE_TZ,
): Analytics {
  const good = rows.filter((r) => r.status !== "failed");
  const revenue = good.reduce((s, r) => s + r.total, 0);
  const waits = good
    .filter((r) => r.acceptedAt)
    .map((r) => Math.max(0, Math.round((r.acceptedAt!.getTime() - r.createdAt.getTime()) / 1000)))
    .sort((a, b) => a - b);
  const byHour = Array.from({ length: 24 }, () => 0);
  for (const r of good) byHour[zonedParts(r.createdAt, tz).hour]! += 1;
  const items = new Map<string, { itemId: string; name: string; qty: number; revenue: number }>();
  for (const r of good)
    for (const l of r.lines) {
      const cur = items.get(l.itemId) ?? { itemId: l.itemId, name: l.nameRu, qty: 0, revenue: 0 };
      cur.qty += l.qty;
      cur.revenue += l.lineTotal;
      items.set(l.itemId, cur);
    }
  const staff = new Map<string, number>();
  for (const r of good)
    if (r.acceptedBy) staff.set(r.acceptedBy, (staff.get(r.acceptedBy) ?? 0) + 1);
  const req: Record<RequestType, number> = { waiter: 0, bill: 0, song: 0, booking: 0 };
  for (const q of requests) req[q.type] += 1;
  return {
    orders: good.length,
    failed: rows.length - good.length,
    revenue,
    avgCheck: good.length ? Math.round(revenue / good.length) : 0,
    acceptedShare: good.length ? waits.length / good.length : 0,
    acceptMedianSec: percentile(waits, 0.5),
    acceptP90Sec: percentile(waits, 0.9),
    byHour,
    topItems: [...items.values()]
      .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
      .slice(0, 15),
    byStaff: [...staff.entries()]
      .map(([name, c]) => ({ name, count: c }))
      .sort((a, b) => b.count - a.count),
    requests: req,
  };
}

export async function analytics(db: Db, r: DayRange): Promise<Analytics> {
  const rows = await db
    .select({
      createdAt: orders.createdAt,
      acceptedAt: orders.acceptedAt,
      status: orders.status,
      total: orders.total,
      acceptedBy: orders.acceptedBy,
      lines: orders.lines,
    })
    .from(orders)
    .where(and(gte(orders.businessDay, r.from), lte(orders.businessDay, r.to)));
  const { start, end } = rangeBounds(r);
  const reqs = await db
    .select({ type: guestRequests.type })
    .from(guestRequests)
    .where(and(gte(guestRequests.createdAt, start), lt(guestRequests.createdAt, end)));
  return aggregate(rows, reqs);
}

/** Orders still waiting for "Принял" longer than `olderThanMs`. */
export async function waitingOrders(db: Db, now: Date, olderThanMs = 3 * 60_000) {
  return db
    .select({
      id: orders.id,
      dayNumber: orders.dayNumber,
      tableCode: orders.tableCode,
      total: orders.total,
      createdAt: orders.createdAt,
      status: orders.status,
    })
    .from(orders)
    .where(
      and(
        inArray(orders.status, ["queued", "sent"]),
        lt(orders.createdAt, new Date(now.getTime() - olderThanMs)),
        gte(orders.createdAt, new Date(now.getTime() - 12 * 60 * 60_000)),
      ),
    )
    .orderBy(orders.createdAt)
    .limit(20);
}

// ── Outbox ───────────────────────────────────────────────────────────────────

export async function outboxStatus(db: Db) {
  const counts = await db
    .select({ status: outbox.status, n: count() })
    .from(outbox)
    .groupBy(outbox.status);
  const [oldest] = await db
    .select({ createdAt: outbox.createdAt })
    .from(outbox)
    .where(eq(outbox.status, "pending"))
    .orderBy(outbox.createdAt)
    .limit(1);
  const problems = await db
    .select()
    .from(outbox)
    .where(
      or(eq(outbox.status, "dead"), and(eq(outbox.status, "pending"), gte(outbox.attempts, 1))),
    )
    .orderBy(desc(outbox.id))
    .limit(20);
  const by = Object.fromEntries(counts.map((c) => [c.status, Number(c.n)]));
  return {
    pending: by.pending ?? 0,
    processing: by.processing ?? 0,
    sent: by.sent ?? 0,
    dead: by.dead ?? 0,
    oldestPendingAt: oldest?.createdAt ?? null,
    problems,
  };
}

/** Dead jobs back to the queue; the linked order/request leaves "failed" so the guest sees progress. */
export async function retryDead(db: Db, ids: number[] | "all") {
  const where =
    ids === "all"
      ? eq(outbox.status, "dead")
      : and(eq(outbox.status, "dead"), inArray(outbox.id, ids));
  const jobs = await db
    .update(outbox)
    .set({ status: "pending", attempts: 0, nextAttemptAt: new Date(), lockedUntil: null })
    .where(where)
    .returning({ kind: outbox.kind, refId: outbox.refId });
  const orderIds = jobs.filter((j) => j.kind === "order.new" && j.refId).map((j) => j.refId!);
  const requestIds = jobs.filter((j) => j.kind === "request.new" && j.refId).map((j) => j.refId!);
  if (orderIds.length)
    await db
      .update(orders)
      .set({ status: "queued" })
      .where(and(inArray(orders.id, orderIds), eq(orders.status, "failed")));
  if (requestIds.length)
    await db
      .update(guestRequests)
      .set({ status: "queued" })
      .where(and(inArray(guestRequests.id, requestIds), eq(guestRequests.status, "failed")));
  return jobs.length;
}

// ── Activity log, versions ───────────────────────────────────────────────────

export async function listAudit(
  db: Db,
  opts: { before?: number; q?: string; limit?: number } = {},
) {
  const where: SQL[] = [];
  if (opts.before) where.push(lt(auditLog.id, opts.before));
  if (opts.q) {
    const like = `%${opts.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    where.push(
      or(
        ilike(auditLog.action, like),
        ilike(auditLog.userLogin, like),
        ilike(auditLog.entityId, like),
      )!,
    );
  }
  return db
    .select()
    .from(auditLog)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(opts.limit ?? 100);
}

export async function listVersions(db: Db, limit = 50) {
  return db
    .select({
      id: menuVersions.id,
      note: menuVersions.note,
      createdAt: menuVersions.createdAt,
      restoredFrom: menuVersions.restoredFrom,
      author: adminUsers.name,
      items: sql<number>`jsonb_array_length(${menuVersions.snapshot}->'items')`,
    })
    .from(menuVersions)
    .leftJoin(adminUsers, eq(adminUsers.id, menuVersions.createdBy))
    .orderBy(desc(menuVersions.id))
    .limit(limit);
}
