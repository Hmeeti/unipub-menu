import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, type Db } from "@/lib/db/client";
import { items, orders, outbox, tables, waiters } from "@/lib/db/schema";
import { computeTotals } from "@/lib/domain/money";
import { MemoryKv } from "@/lib/kv/kv";
import { parseLegacyMenuJs, transformLegacy } from "@/lib/legacy/import";
import { seedDatabase } from "@/lib/legacy/seed-db";
import { getPublished } from "@/lib/menu/repository";
import {
  createOrder,
  findById,
  remindOrder,
  type CreateOrderResult,
  type OrderDeps,
} from "@/lib/orders/service";
import { CB } from "@/lib/orders/telegram-text";
import { MAX_ATTEMPTS, processOutbox, type Sender } from "@/lib/outbox/worker";
import { CAPTCHA_IP_THRESHOLD } from "@/lib/security/rate-limit";
import { createTableToken } from "@/lib/security/table-token";
import { createBot, telegramLog } from "@/lib/telegram/bot";
import type { OrderInput } from "@/lib/validation/schemas";

const SECRET = "t".repeat(40);
/** 20:00 in Asia/Almaty (UTC+5): inside the imported 12:00–02:00 hours */
const EVENING = new Date("2026-10-03T15:00:00Z");

let db: Db;
let kv: MemoryKv;
let seq = 0;

const key = () => `test-key-${Date.now()}-${++seq}-abcdef`;
const deps = (over: Partial<OrderDeps> = {}): OrderDeps => ({
  db,
  kv,
  now: EVENING,
  ipHash: "ip1",
  sessionHash: `s${seq}`,
  tableSecret: SECRET,
  captcha: null,
  ...over,
});
const input = (over: Partial<OrderInput> = {}): OrderInput => ({
  lines: [
    { itemId: "s1", qty: 2 },
    { itemId: "m1", qty: 1 },
  ],
  tableToken: createTableToken(SECRET, "5", 1),
  waiterId: "any",
  locale: "en",
  ...over,
});
const ok = (r: CreateOrderResult) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.order;
};

beforeAll(async () => {
  db = await getDb();
  const source = readFileSync(path.join(process.cwd(), "legacy/menu-data.js"), "utf8");
  await seedDatabase(db, transformLegacy(parseLegacyMenuJs(source)).seed);
});

beforeEach(async () => {
  kv = new MemoryKv(() => EVENING.getTime());
  await db.update(items).set({ soldOut: false });
});

describe("createOrder", () => {
  it("recomputes names and prices from the published menu", async () => {
    const order = ok(await createOrder(deps(), input(), key()));
    const row = (await db.select().from(orders).where(eq(orders.publicId, order.publicId)))[0]!;
    const snap = (await getPublished(db))!.snapshot;
    const price = (id: string) => snap.items.find((i) => i.id === id)!.price;
    const expected = computeTotals([price("s1") * 2, price("m1")], snap.venue.serviceRateBp);
    expect(row.total).toBe(expected.total);
    expect(row.service).toBe(expected.service);
    expect(row.lines[0]).toMatchObject({ itemId: "s1", nameRu: "Тартар из тунца", qty: 2 });
    expect(row.lines[0]!.nameGuest).not.toBe(row.lines[0]!.nameRu);
    expect(row.tableVerified).toBe(true);
    expect(order.status).toBe("queued");
    const jobs = await db.select().from(outbox).where(eq(outbox.refId, row.id));
    expect(jobs).toHaveLength(1);
  });

  it("is idempotent per key and refuses a concurrent submit", async () => {
    const k = key();
    const a = ok(await createOrder(deps(), input({ lines: [{ itemId: "s2", qty: 1 }] }), k));
    const b = await createOrder(deps(), input({ lines: [{ itemId: "s2", qty: 1 }] }), k);
    expect(b.ok && b.replay && b.order.publicId === a.publicId).toBe(true);

    const k2 = key();
    await kv.setNx(`idem:${k2}`, "1", 20_000);
    const c = await createOrder(deps(), input(), k2);
    expect(!c.ok && c.error).toBe("in_progress");
  });

  it("asks before sending the same order to the same table twice", async () => {
    const same = input({ lines: [{ itemId: "m2", qty: 3 }] });
    const first = ok(await createOrder(deps(), same, key()));
    const dup = await createOrder(deps({ sessionHash: "other" }), same, key());
    expect(!dup.ok && dup.error).toBe("duplicate");
    expect(!dup.ok && dup.duplicateOf).toBe(first.number);
    ok(
      await createOrder(deps({ sessionHash: "other" }), { ...same, confirmDuplicate: true }, key()),
    );
  });

  it("rejects sold-out and unknown dishes with the list of ids", async () => {
    await db.update(items).set({ soldOut: true }).where(eq(items.id, "m1"));
    const r = await createOrder(
      deps(),
      input({
        lines: [
          { itemId: "m1", qty: 1 },
          { itemId: "nope", qty: 1 },
          { itemId: "s1", qty: 1 },
        ],
      }),
      key(),
    );
    expect(!r.ok && r.error).toBe("unavailable");
    expect(!r.ok && r.unavailable).toEqual(["m1", "nope"]);
  });

  it("verifies QR tokens against the table list and its token version", async () => {
    const forged = createTableToken("f".repeat(40), "5", 1);
    const r1 = await createOrder(deps(), input({ tableToken: forged }), key());
    expect(!r1.ok && r1.error).toBe("table_token_invalid");

    await db.update(tables).set({ tokenVersion: 2 }).where(eq(tables.code, "6"));
    const stale = createTableToken(SECRET, "6", 1);
    const r2 = await createOrder(deps(), input({ tableToken: stale }), key());
    expect(!r2.ok && r2.error).toBe("table_token_invalid");

    const ghost = createTableToken(SECRET, "ZZ9", 1);
    const r3 = await createOrder(deps(), input({ tableToken: ghost }), key());
    expect(!r3.ok && r3.error).toBe("table_token_invalid");
  });

  it("accepts a typed table only if it exists, with stricter limits", async () => {
    const typed = (code: string, over: Partial<OrderInput> = {}) =>
      input({ tableToken: undefined, tableCode: code, ...over });
    const r1 = await createOrder(deps(), typed("ZZ9"), key());
    expect(!r1.ok && r1.error).toBe("table_unknown");
    const r0 = await createOrder(deps(), input({ tableToken: undefined }), key());
    expect(!r0.ok && r0.error).toBe("table_required");

    const d = deps({ sessionHash: "manual-session" });
    const o = ok(await createOrder(d, typed("VIP1", { lines: [{ itemId: "s3", qty: 1 }] }), key()));
    const row = (await db.select().from(orders).where(eq(orders.publicId, o.publicId)))[0]!;
    expect(row.tableVerified).toBe(false);
    ok(await createOrder(d, typed("VIP1", { lines: [{ itemId: "s4", qty: 1 }] }), key()));
    const r3 = await createOrder(d, typed("VIP1", { lines: [{ itemId: "s5", qty: 1 }] }), key());
    expect(!r3.ok && r3.error).toBe("rate_limited");
    expect(!r3.ok && r3.retryAfterSec).toBeGreaterThan(0);
  });

  it("validates the waiter and refuses orders while the bar is closed", async () => {
    const r1 = await createOrder(deps(), input({ waiterId: "ghost" }), key());
    expect(!r1.ok && r1.error).toBe("waiter_unknown");
    const morning = new Date("2026-10-04T00:30:00Z"); // 05:30 local
    const r2 = await createOrder(deps({ now: morning }), input(), key());
    expect(!r2.ok && r2.error).toBe("closed");
  });

  it("demands a captcha only after suspicious activity from one IP", async () => {
    const captcha = { siteKey: "site", verify: async (t: string) => t === "good" };
    for (let i = 0; i < CAPTCHA_IP_THRESHOLD; i += 1) await kv.incr("rl:order:ip:busy", 600_000);
    const d = deps({ ipHash: "busy", captcha });
    const r1 = await createOrder(d, input({ lines: [{ itemId: "d1", qty: 1 }] }), key());
    expect(!r1.ok && r1.error).toBe("captcha_required");
    expect(!r1.ok && r1.siteKey).toBe("site");
    const r2 = await createOrder(
      d,
      input({ lines: [{ itemId: "d1", qty: 1 }], turnstileToken: "bad" }),
      key(),
    );
    expect(!r2.ok && r2.error).toBe("captcha_failed");
    ok(
      await createOrder(
        d,
        input({ lines: [{ itemId: "d1", qty: 1 }], turnstileToken: "good" }),
        key(),
      ),
    );
  });

  it("stores a server-computed split bill", async () => {
    const o = ok(
      await createOrder(
        deps(),
        input({
          lines: [
            { itemId: "s1", qty: 1 },
            { itemId: "m3", qty: 1 },
          ],
          split: {
            people: [
              { id: "a", name: "Аня" },
              { id: "b", name: "Боря" },
            ],
            assign: { s1: "a", m3: "b" },
          },
        }),
        key(),
      ),
    );
    const row = (await db.select().from(orders).where(eq(orders.publicId, o.publicId)))[0]!;
    expect(row.split).toHaveLength(2);
    expect(row.split!.reduce((s, p) => s + p.total, 0)).toBe(row.total);
  });
});

describe("outbox worker", () => {
  const sender = (fail = false): Sender & { sent: string[] } => {
    const sent: string[] = [];
    return {
      sent,
      async send(text) {
        if (fail) throw new Error("telegram down: bot123:SECRET");
        sent.push(text);
        return 4242;
      },
    };
  };

  it("delivers new orders once and marks them sent", async () => {
    await db.update(outbox).set({ status: "sent" });
    const o = ok(await createOrder(deps(), input({ lines: [{ itemId: "s2", qty: 2 }] }), key()));
    const s = sender();
    expect(await processOutbox({ db, kv, sender: s, now: () => EVENING })).toBe(1);
    expect(await processOutbox({ db, kv, sender: s, now: () => EVENING })).toBe(0);
    expect(s.sent).toHaveLength(1);
    expect(s.sent[0]).toContain(`Заказ №${o.number} · стол 5`);
    expect(s.sent[0]).toContain("Итого:");
    const row = (await db.select().from(orders).where(eq(orders.publicId, o.publicId)))[0]!;
    expect(row.status).toBe("sent");
    expect(row.telegramMessageId).toBe(4242);
  });

  it("retries with backoff, redacts tokens and gives up after the limit", async () => {
    await db.update(outbox).set({ status: "sent" });
    const o = ok(await createOrder(deps(), input({ lines: [{ itemId: "s3", qty: 2 }] }), key()));
    let now = EVENING.getTime();
    for (let i = 1; i <= MAX_ATTEMPTS; i += 1) {
      expect(await processOutbox({ db, kv, sender: sender(true), now: () => new Date(now) })).toBe(
        1,
      );
      now += 11 * 60_000;
    }
    const [job] = await db.select().from(outbox).where(eq(outbox.status, "dead"));
    expect(job!.lastError).toContain("bot<redacted>");
    expect(job!.lastError).not.toContain("SECRET");
    const row = (await db.select().from(orders).where(eq(orders.publicId, o.publicId)))[0]!;
    expect(row.status).toBe("failed");
  });
});

describe("telegram buttons", () => {
  const STAFF = 5550001;

  const press = async (data: string, from = STAFF) => {
    const holder = createBot({
      token: "0:mock",
      chatId: "-1",
      mock: true,
      deps: async () => ({ db, kv }),
    });
    let menuChanged = false;
    holder.hooks.onMenuChanged = () => {
      menuChanged = true;
    };
    const before = telegramLog().length;
    await holder.bot.handleUpdate({
      update_id: 1,
      callback_query: {
        id: "cb",
        chat_instance: "x",
        data,
        from: { id: from, is_bot: false, first_name: "X" },
        message: {
          message_id: 1,
          date: 0,
          chat: { id: -1, type: "supergroup", title: "g" },
          text: "t",
        },
      },
    });
    return { calls: telegramLog().slice(before), menuChanged };
  };

  beforeAll(async () => {
    const [w] = await db.select().from(waiters).limit(1);
    await db.update(waiters).set({ telegramUserId: STAFF }).where(eq(waiters.id, w!.id));
  });

  it("only staff can accept; accepting edits the message and is reported once", async () => {
    const o = ok(await createOrder(deps(), input({ lines: [{ itemId: "m4", qty: 1 }] }), key()));
    const row = (await db.select().from(orders).where(eq(orders.publicId, o.publicId)))[0]!;

    const stranger = await press(CB.accept(row.id), 1);
    expect(stranger.calls.map((c) => c.method)).toEqual(["answerCallbackQuery"]);
    expect((await findById(db, row.id))!.status).toBe("queued");

    const first = await press(CB.accept(row.id));
    expect(first.calls.map((c) => c.method)).toEqual(["editMessageText", "answerCallbackQuery"]);
    expect(String(first.calls[0]!.payload.text)).toContain("✅ Принял:");
    const accepted = (await findById(db, row.id))!;
    expect(accepted.status).toBe("accepted");
    expect(accepted.acceptedByTg).toBe(STAFF);

    const again = await press(CB.accept(row.id));
    expect(String(again.calls.at(-1)!.payload.text)).toContain("Уже принят");
  });

  it("'no dish' puts the item on the stop-list and tells the guest", async () => {
    const o = ok(
      await createOrder(
        deps(),
        input({
          lines: [
            { itemId: "s1", qty: 1 },
            { itemId: "m2", qty: 1 },
          ],
        }),
        key(),
      ),
    );
    const row = (await db.select().from(orders).where(eq(orders.publicId, o.publicId)))[0]!;
    const menu = await press(CB.unavailableMenu(row.id));
    expect(menu.calls[0]!.method).toBe("editMessageReplyMarkup");

    const received: string[] = [];
    await kv.subscribe(`order:${o.publicId}`, (m) => received.push(m));
    const pick = await press(CB.unavailablePick(row.id, 1));
    expect(pick.menuChanged).toBe(true);
    const [m2] = await db.select().from(items).where(eq(items.id, "m2"));
    expect(m2!.soldOut).toBe(true);
    expect(JSON.parse(received.at(-1)!).unavailable).toHaveLength(1);
  });
});

describe("remind", () => {
  it("is allowed once, only after 3 minutes and while waiting", async () => {
    const o = ok(await createOrder(deps(), input({ lines: [{ itemId: "d2", qty: 1 }] }), key()));
    const early = await remindOrder(db, kv, o.publicId, new Date(EVENING.getTime() + 60_000));
    expect(!early.ok && early.error).toBe("remind_not_allowed");
    const later = new Date(EVENING.getTime() + 3 * 60_000);
    const r = await remindOrder(db, kv, o.publicId, later);
    expect(r.ok && r.order.remindAt).toBeNull();
    const twice = await remindOrder(db, kv, o.publicId, later);
    expect(!twice.ok && twice.error).toBe("remind_not_allowed");
    const missing = await remindOrder(db, kv, "x".repeat(22), later);
    expect(!missing.ok && missing.error).toBe("not_found");
  });
});
