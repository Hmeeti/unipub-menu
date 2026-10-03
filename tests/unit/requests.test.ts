import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, type Db } from "@/lib/db/client";
import { guestRequests, items, outbox, venue, waiters } from "@/lib/db/schema";
import { MemoryKv } from "@/lib/kv/kv";
import { parseLegacyMenuJs, transformLegacy } from "@/lib/legacy/import";
import { seedDatabase } from "@/lib/legacy/seed-db";
import { createOrder } from "@/lib/orders/service";
import { processOutbox, type Sender } from "@/lib/outbox/worker";
import { createRequest, type CreateRequestResult, type RequestDeps } from "@/lib/requests/service";
import { appendAccepted, parseRequestCallback, REQUEST_CB } from "@/lib/requests/telegram-text";
import { createTableToken } from "@/lib/security/table-token";
import { createBot, telegramLog } from "@/lib/telegram/bot";
import { parseStopCallback, STOP_CB } from "@/lib/telegram/stoplist";
import type { RequestInput } from "@/lib/validation/schemas";

const SECRET = "t".repeat(40);
/** 20:00 in Asia/Almaty, inside opening hours */
const EVENING = new Date("2026-10-03T15:00:00Z");
/** 05:30 in Asia/Almaty, closed */
const MORNING = new Date("2026-10-03T00:30:00Z");
const STAFF = 424242;

let db: Db;
let kv: MemoryKv;
let seq = 0;
let sent: { text: string; keyboard?: unknown }[] = [];

const key = () => `req-key-${Date.now()}-${++seq}-abcdef`;
const okSender: Sender = {
  async send(text, opts) {
    sent.push({ text, keyboard: opts?.keyboard });
    return 9000 + sent.length;
  },
};
const brokenSender: Sender = {
  async send() {
    throw new Error("telegram down");
  },
};
const deps = (over: Partial<RequestDeps> = {}): RequestDeps => ({
  db,
  kv,
  now: EVENING,
  ipHash: "ip1",
  sessionHash: `s${++seq}`,
  tableSecret: SECRET,
  captcha: null,
  deliver: okSender,
  retryDelayMs: 0,
  ...over,
});
const token = (table = "5") => createTableToken(SECRET, table, 1);
const ok = (r: CreateRequestResult) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.request;
};
const booking = (over: Partial<Extract<RequestInput, { type: "booking" }>> = {}): RequestInput => ({
  type: "booking",
  locale: "ru",
  name: "Айгерим",
  phone: "8 701 234 56 78",
  date: "2026-10-10",
  time: "20:00",
  guests: 4,
  roomId: "vip",
  comment: "День рождения",
  ...over,
});
const drain = () => processOutbox({ db, kv, sender: okSender, now: () => EVENING });

beforeAll(async () => {
  db = await getDb();
  const source = readFileSync(path.join(process.cwd(), "legacy/menu-data.js"), "utf8");
  await seedDatabase(db, transformLegacy(parseLegacyMenuJs(source)).seed);
});

beforeEach(async () => {
  kv = new MemoryKv(() => EVENING.getTime());
  sent = [];
  await db.update(items).set({ soldOut: false });
  await db.delete(outbox);
});

describe("createRequest", () => {
  it("waiter call goes through the outbox with an accept button", async () => {
    const r = ok(
      await createRequest(deps(), { type: "waiter", locale: "ru", tableToken: token("5") }, key()),
    );
    expect(r).toMatchObject({ type: "waiter", status: "queued" });
    await drain();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain(`🙋 Вызов официанта №${r.number} · стол 5`);
    expect(sent[0]!.text).toContain("Официант: любой");
    expect(sent[0]!.text).not.toContain("введён вручную");
    expect(JSON.stringify(sent[0]!.keyboard)).toContain(REQUEST_CB.accept(r.number));
    const [row] = await db.select().from(guestRequests).where(eq(guestRequests.id, r.number));
    expect(row).toMatchObject({ status: "sent", telegramMessageId: 9001 });
  });

  it("bill lists the table's orders of the day and the payment method", async () => {
    const t = token("7");
    const order = await createOrder(
      deps(),
      { lines: [{ itemId: "s1", qty: 1 }], tableToken: t, waiterId: "any", locale: "ru" },
      key(),
    );
    if (!order.ok) throw new Error(order.error);
    ok(
      await createRequest(
        deps(),
        { type: "bill", locale: "ru", tableToken: t, payment: "card" },
        key(),
      ),
    );
    await drain();
    const bill = sent.find((s) => s.text.startsWith("🧾 Просят счёт"))!;
    expect(bill.text).toContain("Оплата: Карта");
    expect(bill.text).toContain(`Заказы стола сегодня: №${order.order.number} · `);
  });

  it("song needs a table or a room; the room alone is enough", async () => {
    const r = ok(
      await createRequest(
        deps(),
        {
          type: "song",
          locale: "ru",
          artist: "Queen",
          title: "Bohemian Rhapsody",
          roomId: "karaoke",
        },
        key(),
      ),
    );
    await drain();
    expect(sent.at(-1)!.text).toContain(`🎤 Песня №${r.number} · Караоке-зал`);
    expect(sent.at(-1)!.text).toContain("Queen — Bohemian Rhapsody");

    const none = await createRequest(
      deps(),
      { type: "song", locale: "ru", artist: "A", title: "B" },
      key(),
    );
    expect(none).toMatchObject({ ok: false, error: "table_required" });
    const ghost = await createRequest(
      deps(),
      { type: "song", locale: "ru", artist: "A", title: "B", roomId: "nope" },
      key(),
    );
    expect(ghost).toMatchObject({ ok: false, error: "room_unknown" });
  });

  it("respects feature flags and opening hours (bookings are accepted when closed)", async () => {
    const [v] = await db.select().from(venue);
    await db.update(venue).set({ features: { ...v!.features, songs: false } });
    try {
      const off = await createRequest(
        deps(),
        { type: "song", locale: "ru", artist: "A", title: "B", tableToken: token() },
        key(),
      );
      expect(off).toMatchObject({ ok: false, error: "feature_off" });
    } finally {
      await db.update(venue).set({ features: v!.features });
    }
    const closed = await createRequest(
      deps({ now: MORNING }),
      { type: "waiter", locale: "ru", tableToken: token() },
      key(),
    );
    expect(closed).toMatchObject({ ok: false, error: "closed" });
    ok(await createRequest(deps({ now: MORNING }), booking(), key()));
  });

  it("is idempotent per key", async () => {
    const k = key();
    const input: RequestInput = { type: "waiter", locale: "ru", tableToken: token() };
    const a = ok(await createRequest(deps(), input, k));
    const b = await createRequest(deps(), input, k);
    expect(b).toMatchObject({ ok: true, replay: true, request: { publicId: a.publicId } });
  });

  it("typed tables get a stricter per-table quota", async () => {
    const call = () =>
      createRequest(deps(), { type: "waiter", locale: "ru", tableCode: "12" }, key());
    ok(await call());
    ok(await call());
    expect(await call()).toMatchObject({ ok: false, error: "rate_limited" });
    await drain();
    expect(sent[0]!.text).toContain("⚠️ Стол введён вручную (без QR)");
  });

  it("rejects unknown waiters and tables", async () => {
    expect(
      await createRequest(
        deps(),
        { type: "waiter", locale: "ru", tableToken: token(), waiterId: "ghost" },
        key(),
      ),
    ).toMatchObject({ ok: false, error: "waiter_unknown" });
    expect(
      await createRequest(
        deps(),
        { type: "bill", locale: "ru", tableCode: "ZZ9", payment: "cash" },
        key(),
      ),
    ).toMatchObject({ ok: false, error: "table_unknown" });
  });
});

describe("booking", () => {
  it("sends the contact to Telegram but never stores it", async () => {
    const r = ok(await createRequest(deps(), booking(), key()));
    expect(r.status).toBe("sent");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("Имя: Айгерим");
    expect(sent[0]!.text).toContain("Телефон: +7 (701) 234-56-78");
    expect(sent[0]!.text).toContain("Когда: сб, 10.10 в 20:00");
    expect(sent[0]!.text).toContain("Зал: VIP-зал");
    expect(sent[0]!.text).toContain("💬 День рождения");

    const [row] = await db.select().from(guestRequests).where(eq(guestRequests.id, r.number));
    const stored = JSON.stringify(row);
    expect(stored).not.toContain("Айгерим");
    expect(stored).not.toContain("701");
    expect(stored).not.toContain("День рождения");
    expect(row!.payload).toEqual({
      date: "2026-10-10",
      time: "20:00",
      guests: 4,
      roomName: "VIP-зал",
    });
    expect(await db.select().from(outbox)).toHaveLength(0);
  });

  it("when Telegram is down, nothing is kept and the guest is asked to call", async () => {
    const before = (await db.select().from(guestRequests)).length;
    const r = await createRequest(deps({ deliver: brokenSender }), booking(), key());
    expect(r).toMatchObject({ ok: false, error: "delivery_failed" });
    expect((await db.select().from(guestRequests)).length).toBe(before);
  });

  it("validates the date window", async () => {
    expect(await createRequest(deps(), booking({ date: "2026-10-02" }), key())).toMatchObject({
      ok: false,
      error: "booking_past",
    });
    expect(await createRequest(deps(), booking({ date: "2026-12-31" }), key())).toMatchObject({
      ok: false,
      error: "booking_too_far",
    });
  });
});

describe("telegram: requests and stop-list", () => {
  const holder = () => {
    const h = createBot({
      token: "0:mock",
      chatId: "-1",
      mock: true,
      deps: async () => ({ db, kv }),
    });
    let menuChanged = false;
    h.hooks.onMenuChanged = () => {
      menuChanged = true;
    };
    return { h, changed: () => menuChanged };
  };
  const press = async (data: string, from = STAFF, text = "t") => {
    const { h, changed } = holder();
    const before = telegramLog().length;
    await h.bot.handleUpdate({
      update_id: ++seq,
      callback_query: {
        id: "cb",
        chat_instance: "x",
        data,
        from: { id: from, is_bot: false, first_name: "X" },
        message: { message_id: 1, date: 0, chat: { id: -1, type: "supergroup", title: "g" }, text },
      },
    });
    return { calls: telegramLog().slice(before), menuChanged: changed() };
  };

  beforeAll(async () => {
    const [w] = await db.select().from(waiters).limit(1);
    await db.update(waiters).set({ telegramUserId: STAFF }).where(eq(waiters.id, w!.id));
  });

  it("accepting a request appends the staff name once", async () => {
    const r = ok(
      await createRequest(deps(), { type: "waiter", locale: "ru", tableToken: token() }, key()),
    );
    const stranger = await press(REQUEST_CB.accept(r.number), 1);
    expect(stranger.calls.find((c) => c.method === "answerCallbackQuery")?.payload.text).toMatch(
      /Нет прав/,
    );
    const first = await press(REQUEST_CB.accept(r.number));
    const edit = first.calls.find((c) => c.method === "editMessageText")!;
    expect(edit.payload.text).toMatch(/Вызов официанта[\s\S]*✅ Принял: .+ · \d\d:\d\d$/);
    const again = await press(REQUEST_CB.accept(r.number));
    expect(again.calls.find((c) => c.method === "answerCallbackQuery")?.payload.text).toMatch(
      /Уже принято/,
    );
    const [row] = await db.select().from(guestRequests).where(eq(guestRequests.id, r.number));
    expect(row!.status).toBe("accepted");
  });

  it("booking accept edits the existing Telegram text (the contact is not in the DB)", async () => {
    const r = ok(await createRequest(deps(), booking(), key()));
    const res = await press(REQUEST_CB.accept(r.number), STAFF, sent[0]!.text);
    const edit = res.calls.find((c) => c.method === "editMessageText")!;
    expect(edit.payload.text).toContain("Имя: Айгерим");
    expect(edit.payload.text).toMatch(/✅ Принял: /);
  });

  it("/stop lists sold-out dishes and a button returns one to sale", async () => {
    await db.update(items).set({ soldOut: true }).where(eq(items.id, "s1"));
    const { h } = holder();
    const before = telegramLog().length;
    await h.bot.handleUpdate({
      update_id: ++seq,
      message: {
        message_id: 2,
        date: Math.floor(EVENING.getTime() / 1000),
        chat: { id: -1, type: "supergroup", title: "g" },
        from: { id: STAFF, is_bot: false, first_name: "X" },
        text: "/stop",
        entities: [{ type: "bot_command", offset: 0, length: 5 }],
      },
    });
    const reply = telegramLog()
      .slice(before)
      .find((c) => c.method === "sendMessage")!;
    expect(reply.payload.text).toContain("Стоп-лист (1)");
    expect(JSON.stringify(reply.payload.reply_markup)).toContain(STOP_CB.restore("s1"));

    const res = await press(STOP_CB.restore("s1"));
    expect(res.menuChanged).toBe(true);
    expect(res.calls.find((c) => c.method === "editMessageText")?.payload.text).toContain(
      "Стоп-лист пуст",
    );
    const [it] = await db.select().from(items).where(eq(items.id, "s1"));
    expect(it!.soldOut).toBe(false);
  });

  it("strangers cannot open or change the stop-list", async () => {
    await db.update(items).set({ soldOut: true }).where(eq(items.id, "s2"));
    const res = await press(STOP_CB.restore("s2"), 1);
    expect(res.menuChanged).toBe(false);
    const [it] = await db.select().from(items).where(eq(items.id, "s2"));
    expect(it!.soldOut).toBe(true);
  });
});

describe("callback parsing and text helpers", () => {
  it("parses request and stop-list callbacks strictly", () => {
    expect(parseRequestCallback("racc:12")).toEqual({ requestId: 12 });
    expect(parseRequestCallback("racc:x")).toBeNull();
    expect(parseStopCallback("ret:s1")).toEqual({ kind: "restore", itemId: "s1" });
    expect(parseStopCallback("ret:../x")).toBeNull();
    expect(parseStopCallback(STOP_CB.refresh)).toEqual({ kind: "refresh" });
  });

  it("re-accepting replaces the previous accepted line", () => {
    const once = appendAccepted("A\nB", "✅ Принял: X · 20:00");
    expect(appendAccepted(once, "✅ Принял: Y · 20:05")).toBe("A\nB\n\n✅ Принял: Y · 20:05");
  });
});
