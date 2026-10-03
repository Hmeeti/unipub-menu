import { describe, expect, it } from "vitest";
import type { PublicItem } from "@/lib/domain/types";
import { priceOrder } from "@/lib/orders/pricing";
import {
  formatOrderMessage,
  mainKeyboard,
  parseCallback,
  unavailableKeyboard,
  type OrderMessageData,
} from "@/lib/orders/telegram-text";

const item = (over: Partial<PublicItem>): PublicItem => ({
  id: "x",
  categoryId: "c",
  name: { ru: "Блюдо", en: "Dish" },
  description: { ru: "" },
  ingredients: { ru: "" },
  price: 1000,
  salePrice: null,
  saleSchedule: null,
  flags: [],
  spicyLevel: 0,
  weight: null,
  cookTime: null,
  images: [],
  pairWith: [],
  allergens: [],
  sort: 0,
  ...over,
});

describe("priceOrder", () => {
  const items = new Map([
    [
      "a",
      item({ id: "a", price: 2000, salePrice: 1500, saleSchedule: { from: "12:00", to: "16:00" } }),
    ],
    ["b", item({ id: "b", price: 990 })],
  ]);
  const opts = { tz: "Asia/Almaty", locale: "en", serviceRateBp: 1500 };

  it("applies the sale price only inside its schedule", () => {
    const noon = priceOrder([{ itemId: "a", qty: 2 }], items, new Set(), {
      ...opts,
      now: new Date("2026-10-03T08:00:00Z"), // 13:00 local
    });
    const night = priceOrder([{ itemId: "a", qty: 2 }], items, new Set(), {
      ...opts,
      now: new Date("2026-10-03T16:00:00Z"), // 21:00 local
    });
    expect(noon.ok && noon.lines[0]!.lineTotal).toBe(3000);
    expect(night.ok && night.lines[0]!.lineTotal).toBe(4000);
  });

  it("computes service on the subtotal and falls back to Russian names", () => {
    const r = priceOrder([{ itemId: "b", qty: 3 }], items, new Set(), {
      ...opts,
      locale: "de",
      now: new Date(),
    });
    expect(r.ok && r.totals).toEqual({ subtotal: 2970, service: 446, total: 3416 });
    expect(r.ok && r.lines[0]!.nameGuest).toBe("Блюдо");
  });
});

describe("staff message", () => {
  const base: OrderMessageData = {
    number: 7,
    tableCode: "VIP1",
    tableVerified: true,
    waiterName: "Айгерим",
    createdAt: new Date("2026-10-03T16:47:00Z"),
    lines: [
      {
        itemId: "a",
        nameRu: "Тартар",
        nameGuest: "Tartare",
        qty: 2,
        unitPrice: 1500,
        basePrice: 2000,
        lineTotal: 3000,
      },
      {
        itemId: "b",
        nameRu: "Чай",
        nameGuest: "Чай",
        qty: 1,
        unitPrice: 500,
        basePrice: 500,
        lineTotal: 500,
      },
    ],
    subtotal: 3500,
    service: 525,
    total: 4025,
    serviceRateBp: 1500,
    comment: "<b>без лука</b>",
    split: null,
    acceptedBy: null,
    acceptedAt: null,
    unavailableItemIds: [],
  };

  it("is plain Russian text with the guest's name in parentheses and venue time", () => {
    const text = formatOrderMessage(base, "Asia/Almaty");
    expect(text).toContain("🧾 Заказ №7 · стол VIP1");
    expect(text).toContain("Время: 21:47");
    expect(text).toContain("• Тартар (Tartare) × 2 = 3\u00A0000\u00A0₸ (акция)");
    expect(text).toContain("• Чай × 1");
    expect(text).toContain("Обслуживание 15%: 525\u00A0₸");
    expect(text).toContain("💬 <b>без лука</b>");
    expect(text).not.toContain("без QR");
  });

  it("marks manual tables, accepted state and missing dishes", () => {
    const text = formatOrderMessage(
      {
        ...base,
        tableVerified: false,
        waiterName: null,
        acceptedBy: "Данияр",
        acceptedAt: new Date("2026-10-03T16:50:00Z"),
        unavailableItemIds: ["b"],
        split: [
          { id: "1", name: "Аня", sub: 1750, service: 263, total: 2013 },
          { id: "2", name: "Боря", sub: 1750, service: 262, total: 2012 },
        ],
      },
      "Asia/Almaty",
    );
    expect(text).toContain("Официант: любой");
    expect(text).toContain("⚠️ Стол введён вручную (без QR)");
    expect(text).toContain("❌ Чай × 1");
    expect(text).toContain("✅ Принял: Данияр · 21:50");
    expect(text).toContain("⚠️ Нет в наличии: Чай");
    expect(text).toContain("— Аня: 2\u00A0013\u00A0₸");
  });

  it("keyboards fit Telegram limits and round-trip through the parser", () => {
    expect(mainKeyboard(12, false).inline_keyboard[0]).toHaveLength(2);
    expect(mainKeyboard(12, true).inline_keyboard[0]).toHaveLength(1);
    const kb = unavailableKeyboard(12, base.lines, ["a"]);
    expect(kb.inline_keyboard).toHaveLength(2);
    for (const row of kb.inline_keyboard)
      for (const b of row) {
        expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);
        expect(parseCallback(b.callback_data)).not.toBeNull();
      }
    expect(parseCallback("nai:12:1")).toEqual({ kind: "unavailablePick", orderId: 12, index: 1 });
    expect(parseCallback("acc:12:1")).toBeNull();
    expect(parseCallback("nai:12")).toBeNull();
    expect(parseCallback("drop table")).toBeNull();
    expect(parseCallback(undefined)).toBeNull();
  });
});
