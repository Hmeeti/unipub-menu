import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  hasRole,
  login,
  SESSION_IDLE_MS,
  SESSION_TTL_MS,
  validateSession,
  beginTotp,
  confirmTotp,
} from "@/lib/admin/auth";
import { exportBackup, importBackup } from "@/lib/admin/backup";
import {
  bulkItems,
  deleteItem,
  draftStatus,
  getItem,
  reissueTable,
  saveItem,
  saveTable,
} from "@/lib/admin/catalog";
import { AdminError } from "@/lib/admin/errors";
import { qrSvg, tableQrUrl, tablesPdf } from "@/lib/admin/qr";
import { aggregate, normalizeRange, venueTimeToUtc } from "@/lib/admin/reports";
import { itemSchema, type ItemInput } from "@/lib/admin/schemas";
import { saveUser } from "@/lib/admin/users";
import { getDb, type Db } from "@/lib/db/client";
import { adminUsers, items, tables } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { MemoryKv } from "@/lib/kv/kv";
import { parseLegacyMenuJs, transformLegacy } from "@/lib/legacy/import";
import { seedDatabase } from "@/lib/legacy/seed-db";
import { processImage } from "@/lib/media/images";
import { publishMenu } from "@/lib/menu/repository";
import { seal, unseal } from "@/lib/security/crypto";
import { hashPassword } from "@/lib/security/password";
import { verifyTableToken } from "@/lib/security/table-token";
import { totp } from "@/lib/security/totp";

const NOW = new Date("2026-10-03T15:00:00Z");
let db: Db;
let kv: MemoryKv;
let ownerId: number;

const deps = (now = NOW) => ({ db, kv, now });
const creds = (over: Partial<{ login: string; password: string; totp: string }> = {}) => ({
  login: "owner",
  password: "correct horse battery",
  ipHash: "ip-1",
  ...over,
});

beforeAll(async () => {
  db = await getDb();
  const source = readFileSync(path.join(process.cwd(), "legacy/menu-data.js"), "utf8");
  await seedDatabase(db, transformLegacy(parseLegacyMenuJs(source)).seed);
  const [u] = await db
    .insert(adminUsers)
    .values({
      login: "owner",
      name: "Владелец",
      role: "owner",
      passwordHash: await hashPassword("correct horse battery"),
    })
    .returning({ id: adminUsers.id });
  ownerId = u!.id;
});

beforeEach(() => {
  kv = new MemoryKv(() => NOW.getTime());
});

describe("crypto", () => {
  it("seals and refuses tampered data", () => {
    const s = seal("JBSWY3DPEHPK3PXP");
    expect(s).not.toContain("JBSWY3DP");
    expect(unseal(s)).toBe("JBSWY3DPEHPK3PXP");
    const parts = s.split(".");
    parts[3] = parts[3]!.slice(0, -2) + (parts[3]!.endsWith("A") ? "BB" : "AA");
    expect(unseal(parts.join("."))).toBeNull();
  });
});

describe("admin login and sessions", () => {
  it("roles are ordered", () => {
    expect(hasRole("owner", "manager")).toBe(true);
    expect(hasRole("manager", "owner")).toBe(false);
    expect(hasRole("waiter", "waiter")).toBe(true);
  });

  it("logs in case-insensitively and validates the session token", async () => {
    const res = await login(deps(), creds({ login: "  OWNER " }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const s = await validateSession(db, res.token, NOW);
    expect(s?.user).toMatchObject({ login: "owner", role: "owner" });
    expect(await validateSession(db, "x".repeat(43), NOW)).toBeNull();
  });

  it("expires sessions on idle and absolute timeouts", async () => {
    const res = await login(deps(), creds());
    if (!res.ok) throw new Error("login failed");
    const idle = new Date(NOW.getTime() + SESSION_IDLE_MS + 1000);
    expect(await validateSession(db, res.token, idle)).toBeNull();
    // the expired session was deleted, even a "fresh" check fails now
    expect(await validateSession(db, res.token, NOW)).toBeNull();

    const res2 = await login(deps(), creds());
    if (!res2.ok) throw new Error("login failed");
    let t = NOW.getTime();
    while (t < NOW.getTime() + SESSION_TTL_MS - SESSION_IDLE_MS) {
      t += SESSION_IDLE_MS - 60_000;
      expect(await validateSession(db, res2.token, new Date(t))).not.toBeNull();
    }
    expect(
      await validateSession(db, res2.token, new Date(NOW.getTime() + SESSION_TTL_MS + 1)),
    ).toBeNull();
  });

  it("counts only failures and locks the login for a while after 5 of them", async () => {
    for (let i = 0; i < 5; i++) {
      expect(await login(deps(), creds({ password: "wrong password!" }))).toMatchObject({
        error: "invalid",
      });
    }
    expect(await login(deps(), creds())).toMatchObject({ ok: false, error: "rate_limited" });
    const later = new MemoryKv(() => NOW.getTime() + 16 * 60_000);
    expect((await login({ db, kv: later, now: NOW }, creds())).ok).toBe(true);
  });

  it("unknown logins look exactly like wrong passwords", async () => {
    expect(await login(deps(), creds({ login: "nobody" }))).toEqual({
      ok: false,
      error: "invalid",
    });
  });

  it("requires a fresh TOTP code once 2FA is enabled", async () => {
    const [u] = await db
      .insert(adminUsers)
      .values({
        login: "mgr2fa",
        name: "M",
        role: "manager",
        passwordHash: await hashPassword("manager password"),
      })
      .returning({ id: adminUsers.id });
    const secret = await beginTotp(db, u!.id);
    const [stored] = await db.select().from(adminUsers).where(eq(adminUsers.id, u!.id));
    expect(stored!.totpSecret).not.toContain(secret);
    expect(await confirmTotp(db, u!.id, "000000", NOW)).toBe(false);
    expect(await confirmTotp(db, u!.id, totp(secret, NOW.getTime()), NOW)).toBe(true);

    const c = { login: "mgr2fa", password: "manager password", ipHash: "ip-2" };
    expect(await login(deps(), c)).toMatchObject({ error: "totp_required" });
    expect(await login(deps(), { ...c, totp: "123456" })).toMatchObject({ error: "totp_invalid" });
    const code = totp(secret, NOW.getTime());
    expect((await login(deps(), { ...c, totp: code })).ok).toBe(true);
    expect(await login(deps(), { ...c, totp: code })).toMatchObject({ error: "totp_invalid" });
  });
});

const baseItem = (over: Partial<ItemInput> = {}): ItemInput => ({
  id: "test-burger",
  categoryId: "hot",
  name: { ru: "Тестовый бургер", en: "Test burger" },
  description: { ru: "Описание" },
  ingredients: { ru: "" },
  price: 3500,
  salePrice: null,
  saleSchedule: null,
  flags: ["new"],
  spicyLevel: 0,
  weight: { ru: "300 г" },
  cookTime: null,
  images: [],
  pairWith: [],
  allergens: ["gluten"],
  isActive: true,
  ...over,
});

describe("catalog", () => {
  let catId: string;
  beforeAll(async () => {
    const [first] = await db.select({ c: items.categoryId }).from(items).limit(1);
    catId = first!.c;
  });

  it("schema rejects a sale price that is not lower", () => {
    const r = itemSchema.safeParse(baseItem({ categoryId: catId, salePrice: 4000 }));
    expect(r.success).toBe(false);
  });

  it("creates, updates and deletes an item; draft status follows", async () => {
    expect((await draftStatus(db)).dirty).toBe(false);
    await saveItem(db, baseItem({ categoryId: catId }), true);
    await expect(saveItem(db, baseItem({ categoryId: catId }), true)).rejects.toBeInstanceOf(
      AdminError,
    );
    let st = await draftStatus(db);
    expect(st.added).toEqual(["test-burger"]);

    const [other] = await db
      .select({ id: items.id })
      .from(items)
      .where(eq(items.categoryId, catId))
      .limit(1);
    await saveItem(
      db,
      baseItem({ categoryId: catId, price: 3900, pairWith: [other!.id, "test-burger"] }),
      false,
    );
    const saved = await getItem(db, "test-burger");
    expect(saved).toMatchObject({ price: 3900, pairWith: [other!.id], allergens: ["gluten"] });
    expect(saved!.cookTime).toBeNull();

    await publishMenu(db, {});
    st = await draftStatus(db);
    expect(st.dirty).toBe(false);

    await db
      .update(items)
      .set({ pairWith: ["test-burger"] })
      .where(eq(items.id, other!.id));
    await deleteItem(db, "test-burger");
    expect(await getItem(db, "test-burger")).toBeNull();
    expect((await getItem(db, other!.id))!.pairWith).toEqual([]);
    st = await draftStatus(db);
    expect(st.removed).toEqual(["test-burger"]);
    // the dangling recommendation was cleaned up, so the other dish matches the published one again
    expect(st.changed).toEqual([]);
  });

  it("rejects unknown categories, allergens and recommendations", async () => {
    await expect(saveItem(db, baseItem({ categoryId: "nope" }), true)).rejects.toThrow("Категория");
    await expect(
      saveItem(db, baseItem({ categoryId: catId, allergens: ["nope"] }), true),
    ).rejects.toThrow("аллерген");
    await expect(
      saveItem(db, baseItem({ categoryId: catId, pairWith: ["nope"] }), true),
    ).rejects.toThrow("рекомендациях");
  });

  it("bulk actions: stop-list and move", async () => {
    const two = await db.select({ id: items.id }).from(items).limit(2);
    const ids = two.map((r) => r.id);
    expect(await bulkItems(db, ids, "sold_out")).toBe(2);
    expect((await getItem(db, ids[0]!))!.soldOut).toBe(true);
    await bulkItems(db, ids, "in_stock");
    await expect(bulkItems(db, ids, "move")).rejects.toThrow("категорию");
  });

  it("table codes are immutable and reissue invalidates the old QR", async () => {
    await saveTable(
      db,
      { code: "T9", roomId: "hall", label: null, sort: 900, isActive: true },
      null,
    );
    await expect(
      saveTable(db, { code: "T10", roomId: "hall", label: null, sort: 900, isActive: true }, "T9"),
    ).rejects.toThrow("нельзя");
    const oldUrl = tableQrUrl("T9", 1);
    expect(await reissueTable(db, "T9")).toBe(2);
    const [row] = await db.select().from(tables).where(eq(tables.code, "T9"));
    const oldToken = verifyTableToken(
      env().TABLE_TOKEN_SECRET!,
      decodeURIComponent(oldUrl.split("t=")[1]!),
    );
    expect(oldToken).toEqual({ code: "T9", version: 1 });
    expect(row!.tokenVersion).toBe(2);
  });
});

describe("users", () => {
  it("never leaves the venue without an active owner", async () => {
    await expect(
      saveUser(
        db,
        {
          id: ownerId,
          login: "owner",
          name: "В",
          role: "manager",
          telegramUserId: null,
          isActive: true,
        },
        999,
      ),
    ).rejects.toThrow("владелец");
    await expect(
      saveUser(
        db,
        {
          id: ownerId,
          login: "owner",
          name: "В",
          role: "owner",
          telegramUserId: null,
          isActive: false,
        },
        ownerId,
      ),
    ).rejects.toThrow("себя");
    await expect(
      saveUser(
        db,
        {
          id: null,
          login: "newbie",
          name: "Н",
          role: "waiter",
          telegramUserId: null,
          isActive: true,
          password: "short",
        },
        ownerId,
      ),
    ).rejects.toThrow("короче");
    const id = await saveUser(
      db,
      {
        id: null,
        login: "newbie",
        name: "Н",
        role: "waiter",
        telegramUserId: null,
        isActive: true,
        password: "long enough pass",
      },
      ownerId,
    );
    expect(
      (await login(deps(), { login: "newbie", password: "long enough pass", ipHash: "ip-3" })).ok,
    ).toBe(true);
    await saveUser(
      db,
      { id, login: "newbie", name: "Н", role: "waiter", telegramUserId: null, isActive: false },
      ownerId,
    );
    expect(
      await login(deps(), { login: "newbie", password: "long enough pass", ipHash: "ip-3" }),
    ).toMatchObject({
      error: "invalid",
    });
  });
});

describe("backup", () => {
  it("round-trips and hides entities missing from the file", async () => {
    const dump = await exportBackup(db);
    expect(dump.items.length).toBeGreaterThan(40);
    const roundTrip = JSON.parse(JSON.stringify(dump));
    const summary = await importBackup(db, roundTrip);
    expect(summary).toMatchObject({ items: dump.items.length, hidden: 0 });
    expect((await exportBackup(db)).items).toEqual(dump.items);

    const removed = dump.items[0]!.id;
    const smaller = { ...roundTrip, items: roundTrip.items.slice(1) };
    smaller.items.forEach(
      (i: { pairWith: string[] }) => (i.pairWith = i.pairWith.filter((p) => p !== removed)),
    );
    expect((await importBackup(db, smaller)).hidden).toBe(1);
    expect((await getItem(db, removed))!.isActive).toBe(false);
    await importBackup(db, roundTrip);
    expect((await getItem(db, removed))!.isActive).toBe(true);
  });

  it("rejects foreign or broken files with a readable reason", async () => {
    await expect(importBackup(db, { hello: 1 })).rejects.toThrow("Файл не подходит");
    const dump = JSON.parse(JSON.stringify(await exportBackup(db)));
    dump.items[0].categoryId = "ghost";
    await expect(importBackup(db, dump)).rejects.toThrow("нет категории ghost");
  });
});

describe("reports", () => {
  it("converts venue wall time and clamps ranges", () => {
    expect(venueTimeToUtc("2026-10-03", 6).toISOString()).toBe("2026-10-03T01:00:00.000Z");
    expect(normalizeRange("2026-10-05", "2026-10-01", NOW)).toEqual({
      from: "2026-10-01",
      to: "2026-10-05",
    });
    expect(normalizeRange("2020-01-01", "2026-10-03", NOW).from).toBe("2026-07-04");
    expect(normalizeRange(undefined, undefined, NOW)).toEqual({
      from: "2026-10-03",
      to: "2026-10-03",
    });
  });

  it("aggregates orders: hours in venue time, medians, top items, failed excluded", () => {
    const at = (iso: string) => new Date(iso);
    const line = (itemId: string, qty: number, price: number) => ({
      itemId,
      nameRu: itemId.toUpperCase(),
      qty,
      lineTotal: qty * price,
    });
    const a = aggregate(
      [
        {
          createdAt: at("2026-10-03T15:00:00Z"),
          acceptedAt: at("2026-10-03T15:01:00Z"),
          status: "accepted",
          total: 5000,
          acceptedBy: "Аня",
          lines: [line("a", 2, 1000), line("b", 1, 3000)],
        },
        {
          createdAt: at("2026-10-03T15:30:00Z"),
          acceptedAt: at("2026-10-03T15:33:00Z"),
          status: "accepted",
          total: 3000,
          acceptedBy: "Аня",
          lines: [line("a", 3, 1000)],
        },
        {
          createdAt: at("2026-10-03T19:10:00Z"),
          acceptedAt: null,
          status: "sent",
          total: 1000,
          acceptedBy: null,
          lines: [line("c", 1, 1000)],
        },
        {
          createdAt: at("2026-10-03T19:20:00Z"),
          acceptedAt: null,
          status: "failed",
          total: 99999,
          acceptedBy: null,
          lines: [line("z", 9, 1)],
        },
      ],
      [{ type: "waiter" }, { type: "bill" }, { type: "bill" }],
    );
    expect(a).toMatchObject({
      orders: 3,
      failed: 1,
      revenue: 9000,
      avgCheck: 3000,
      acceptMedianSec: 60,
      acceptP90Sec: 180,
    });
    expect(a.acceptedShare).toBeCloseTo(2 / 3);
    expect(a.byHour[20]).toBe(2);
    expect(a.byHour[0]).toBe(1);
    expect(a.topItems[0]).toEqual({ itemId: "a", name: "A", qty: 5, revenue: 5000 });
    expect(a.topItems.some((t) => t.itemId === "z")).toBe(false);
    expect(a.byStaff).toEqual([{ name: "Аня", count: 2 }]);
    expect(a.requests).toEqual({ waiter: 1, bill: 2, song: 0, booking: 0 });
  });
});

describe("qr and photos", () => {
  it("renders a vector QR and a printable PDF", async () => {
    const svg = qrSvg("https://menu.example.kz/?t=abc", "<x>");
    expect(svg).toMatch(/^<svg[^>]+viewBox="0 0 \d+ \d+"/);
    expect(svg).not.toContain("<x>");
    const pdf = await tablesPdf([
      { code: "1", version: 1 },
      { code: "VIP1", version: 3 },
    ]);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("renders every loader width as WebP with a blur placeholder and no upscaling", async () => {
    const { default: sharp } = await import("sharp");
    const png = await sharp({
      create: { width: 700, height: 500, channels: 3, background: "#c91062" },
    })
      .png()
      .toBuffer();
    const img = await processImage(png);
    expect(img.variants.map((v) => v.width)).toEqual([320, 480, 640, 960, 1280]);
    expect(img).toMatchObject({ width: 700, height: 500 });
    expect(img.blur).toMatch(/^data:image\/webp;base64,/);
    const meta = await sharp(img.variants[4]!.data).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 700 });
    await expect(processImage(Buffer.from("not an image"))).rejects.toThrow("изображение");
  });
});
