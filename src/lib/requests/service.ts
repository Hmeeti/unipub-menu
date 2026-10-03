import { randomBytes } from "node:crypto";
import { GrammyError } from "grammy";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { guestRequests, orders, outbox } from "@/lib/db/schema";
import { VENUE_TZ, businessDay, openStatus } from "@/lib/domain/schedule";
import { pick } from "@/lib/i18n/text";
import { getLiveState, getPublished } from "@/lib/menu/repository";
import { OUTBOX_WAKE, resolveTable, type OrderDeps } from "@/lib/orders/service";
import { ANY_WAITER } from "@/lib/orders/types";
import type { Sender } from "@/lib/outbox/worker";
import {
  CAPTCHA_IP_THRESHOLD,
  checkLimits,
  peekCount,
  REQUEST_LIMITS,
} from "@/lib/security/rate-limit";
import { normalizeKzPhone, validateBookingDate, type RequestInput } from "@/lib/validation/schemas";
import {
  formatRequestMessage,
  requestKeyboard,
  type BookingContact,
  type RequestPayload,
} from "./telegram-text";
import type { RequestErrorBody, RequestStatusView } from "./types";

export type RequestRow = typeof guestRequests.$inferSelect;

export type RequestDeps = OrderDeps & {
  /** bookings are delivered synchronously (their contact data never touches the database) */
  deliver: Sender;
  /** pause between booking delivery attempts; tests pass 0 */
  retryDelayMs?: number;
};

export type CreateRequestResult =
  | { ok: true; request: RequestStatusView; replay: boolean }
  | ({ status: number } & RequestErrorBody);

const fail = (
  status: number,
  error: RequestErrorBody["error"],
  extra: Omit<RequestErrorBody, "ok" | "error"> = {},
): CreateRequestResult => ({ ok: false, status, error, ...extra });

const BOOKING_ATTEMPTS = 3;
/** Telegram may ask to wait; longer than this and the guest is better off calling. */
const MAX_INLINE_WAIT_MS = 3000;

export function toRequestView(r: RequestRow): RequestStatusView {
  return {
    publicId: r.publicId,
    number: r.id,
    type: r.type,
    status: r.status,
    acceptedBy: r.acceptedBy,
    createdAt: r.createdAt.toISOString(),
  };
}

export function renderRequest(r: RequestRow, contact?: BookingContact): string {
  return formatRequestMessage(
    {
      number: r.id,
      type: r.type,
      tableCode: r.tableCode,
      tableVerified: r.tableVerified,
      createdAt: r.createdAt,
      payload: r.payload as RequestPayload,
      contact,
    },
    VENUE_TZ,
  );
}

async function todayOrders(db: Db, table: string, day: string) {
  const rows = await db
    .select({ number: orders.dayNumber, total: orders.total })
    .from(orders)
    .where(
      and(eq(orders.tableCode, table), eq(orders.businessDay, day), ne(orders.status, "failed")),
    )
    .orderBy(orders.dayNumber);
  if (!rows.length) return null;
  return { numbers: rows.map((r) => r.number), total: rows.reduce((s, r) => s + r.total, 0) };
}

async function deliverBooking(deps: RequestDeps, row: RequestRow, contact: BookingContact) {
  const text = renderRequest(row, contact);
  const pause = deps.retryDelayMs ?? 800;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= BOOKING_ATTEMPTS; attempt++) {
    try {
      return await deps.deliver.send(text, { keyboard: requestKeyboard(row.id) });
    } catch (err) {
      lastErr = err;
      const after =
        err instanceof GrammyError && err.error_code === 429
          ? (err.parameters.retry_after ?? 1) * 1000
          : pause * attempt;
      if (attempt === BOOKING_ATTEMPTS || after > MAX_INLINE_WAIT_MS) break;
      if (after) await new Promise((r) => setTimeout(r, after));
    }
  }
  throw lastErr;
}

export async function createRequest(
  deps: RequestDeps,
  input: RequestInput,
  idempotencyKey: string,
): Promise<CreateRequestResult> {
  const { db, kv, now } = deps;

  const existing = await findRequestByIdempotencyKey(db, idempotencyKey);
  if (existing) return { ok: true, request: toRequestView(existing), replay: true };

  const lockKey = `idem:req:${idempotencyKey}`;
  if (!(await kv.setNx(lockKey, "1", 20_000))) return fail(409, "in_progress");
  try {
    const published = await getPublished(db);
    if (!published) return fail(503, "feature_off");
    const live = await getLiveState(db);
    const { venue } = published.snapshot;
    if (input.type === "song" && !live.features.songs) return fail(503, "feature_off");
    if (input.type === "booking" && !live.features.booking) return fail(503, "feature_off");
    if (input.type !== "booking" && !openStatus(venue.hours, now, venue.timezone).open)
      return fail(409, "closed");

    let table: { code: string; verified: boolean } | null = null;
    const hasTable = Boolean(input.tableToken || input.tableCode);
    const roomId = input.type === "song" || input.type === "booking" ? input.roomId : undefined;
    if (input.type !== "booking" && (hasTable || input.type !== "song" || !roomId)) {
      const t = await resolveTable(db, input, deps.tableSecret);
      if (!t.ok) return fail(400, t.error);
      table = t;
    }

    let roomName: string | null = null;
    if (roomId) {
      const room = live.rooms.find((r) => r.id === roomId);
      if (!room) return fail(400, "room_unknown");
      roomName = pick(room.name, "ru");
    }

    if (input.type === "booking") {
      const dateError = validateBookingDate(input.date, input.time, now, venue.timezone);
      if (dateError) return fail(400, dateError);
    }

    if (deps.captcha && (await peekCount(kv, `req:ip:${deps.ipHash}`)) >= CAPTCHA_IP_THRESHOLD) {
      if (!input.turnstileToken)
        return fail(403, "captcha_required", { siteKey: deps.captcha.siteKey });
      if (!(await deps.captcha.verify(input.turnstileToken))) return fail(403, "captcha_failed");
    }
    const limit = await checkLimits(
      kv,
      REQUEST_LIMITS(input.type, {
        table: table?.code ?? null,
        verified: table?.verified ?? false,
        session: deps.sessionHash,
        ip: deps.ipHash,
      }),
    );
    if (!limit.ok)
      return fail(429, "rate_limited", { retryAfterSec: Math.ceil(limit.retryAfterMs / 1000) });

    const payload: RequestPayload = {};
    if (input.type === "waiter" || input.type === "bill") {
      if (input.waiterId && input.waiterId !== ANY_WAITER) {
        const w = live.waiters.find((x) => x.id === input.waiterId);
        if (!w) return fail(400, "waiter_unknown");
        payload.waiterName = w.name;
      }
      if (input.type === "bill") {
        payload.payment = input.payment;
        payload.todayOrders = await todayOrders(db, table!.code, businessDay(now, venue.timezone));
      }
    } else if (input.type === "song") {
      Object.assign(payload, {
        artist: input.artist,
        title: input.title,
        comment: input.comment || null,
        roomName,
      });
    } else {
      Object.assign(payload, {
        date: input.date,
        time: input.time,
        guests: input.guests,
        roomName,
      });
    }

    const row = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(guestRequests)
        .values({
          publicId: randomBytes(16).toString("base64url"),
          type: input.type,
          tableCode: table?.code ?? null,
          tableVerified: table?.verified ?? false,
          payload,
          locale: input.locale,
          idempotencyKey,
          ipHash: deps.ipHash,
          sessionHash: deps.sessionHash,
          createdAt: now,
        })
        .returning();
      if (input.type !== "booking")
        await tx
          .insert(outbox)
          .values({ kind: "request.new", refId: inserted!.id, nextAttemptAt: now });
      return inserted!;
    });

    if (input.type !== "booking") {
      await kv.publish(OUTBOX_WAKE, "request");
      return { ok: true, request: toRequestView(row), replay: false };
    }

    const contact: BookingContact = {
      name: input.name,
      phone: normalizeKzPhone(input.phone)!,
      comment: input.comment || null,
    };
    try {
      const messageId = await deliverBooking(deps, row, contact);
      const [sent] = await db
        .update(guestRequests)
        .set({ telegramMessageId: messageId, sentAt: new Date(), status: "sent" })
        .where(eq(guestRequests.id, row.id))
        .returning();
      return { ok: true, request: toRequestView(sent ?? row), replay: false };
    } catch {
      // Nothing to retry from: the contact exists only in this request. Let the guest resend.
      await db.delete(guestRequests).where(eq(guestRequests.id, row.id));
      return fail(502, "delivery_failed");
    }
  } finally {
    await kv.del(lockKey);
  }
}

export async function findRequestByIdempotencyKey(db: Db, key: string) {
  const [row] = await db.select().from(guestRequests).where(eq(guestRequests.idempotencyKey, key));
  return row ?? null;
}

export async function findRequestByPublicId(db: Db, publicId: string) {
  const [row] = await db.select().from(guestRequests).where(eq(guestRequests.publicId, publicId));
  return row ?? null;
}

export async function findRequestById(db: Db, id: number) {
  const [row] = await db.select().from(guestRequests).where(eq(guestRequests.id, id));
  return row ?? null;
}

export async function acceptRequest(
  db: Db,
  id: number,
  staff: { name: string; telegramUserId: number },
  now: Date,
): Promise<{ changed: boolean; request: RequestRow | null }> {
  const [row] = await db
    .update(guestRequests)
    .set({
      status: "accepted",
      acceptedBy: staff.name,
      acceptedByTg: staff.telegramUserId,
      acceptedAt: now,
    })
    .where(
      and(eq(guestRequests.id, id), inArray(guestRequests.status, ["queued", "sent", "failed"])),
    )
    .returning();
  if (row) return { changed: true, request: row };
  return { changed: false, request: await findRequestById(db, id) };
}
