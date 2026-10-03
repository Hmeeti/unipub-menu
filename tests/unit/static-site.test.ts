import { describe, expect, it } from "vitest";
import type { PublicMenu } from "@/lib/domain/types";
import { guestCorsHeaders } from "@/lib/http/cors";
import { applyOverlay, timedOverlay } from "@/lib/menu/timed";
import { activePromotions, toMenuView } from "@/lib/menu/view";

const almaty = (local: string) => new Date(`${local}+05:00`);
const text = (ru: string) => ({ ru, kk: "", en: "" });

const menu = {
  version: 3,
  venue: {
    name: "UNIPUB",
    timezone: "Asia/Almaty",
    serviceRateBp: 1500,
    hours: Array.from({ length: 7 }, () => ({ open: "12:00", close: "02:00" })),
    contacts: { phone: "+77778884422", phoneDisplay: "+7 777 888-44-22", address: text("") },
    content: {
      tagline: text(""),
      rules: { ru: [] },
      karaokeRules: { ru: [] },
      popularQueries: { ru: [] },
    },
  },
  categories: [{ id: "c", icon: "", title: text("Бар"), sort: 0 }],
  allergens: [],
  items: [
    {
      id: "beer",
      categoryId: "c",
      name: text("Пиво"),
      description: text(""),
      ingredients: text(""),
      price: 1500,
      salePrice: 1000,
      saleSchedule: { from: "16:00", to: "19:00" },
      flags: [],
      spicyLevel: 0,
      weight: null,
      cookTime: null,
      images: [],
      pairWith: [],
      allergens: [],
      sort: 0,
    },
  ],
  promotions: [
    {
      id: 1,
      kind: "banner",
      title: text("Счастливые часы"),
      body: text(""),
      itemId: null,
      image: null,
      link: null,
      schedule: { from: "16:00", to: "19:00" },
    },
  ],
  soldOut: [],
  waiters: [],
  rooms: [],
  features: { orders: false, booking: false, songs: false, promos: true },
} as unknown as PublicMenu;

describe("static menu time overlay", () => {
  const built = almaty("2026-10-03T10:00:00"); // build ran before opening, outside happy hour
  const view = toMenuView(menu, "ru", built);
  const overlay = timedOverlay(menu, "ru");

  it("matches the server rendering at any moment", () => {
    for (const at of ["2026-10-03T10:00:00", "2026-10-03T17:30:00", "2026-10-04T01:30:00"]) {
      const now = almaty(at);
      const res = applyOverlay(view, overlay, now);
      expect(res.menu.items).toEqual(toMenuView(menu, "ru", now).items);
      expect(res.promos).toEqual(activePromotions(menu, "ru", now));
    }
  });

  it("turns happy hour on and reports the venue open", () => {
    const res = applyOverlay(view, overlay, almaty("2026-10-03T17:30:00"));
    expect(res.menu.items[0]).toMatchObject({ price: 1000, oldPrice: 1500 });
    expect(res.promos.map((p) => p.id)).toEqual([1]);
    expect(res.status).toEqual({ open: true, closesAt: "02:00" });
    expect(applyOverlay(view, overlay, built).status.open).toBe(false);
  });
});

describe("guest API CORS", () => {
  it("is granted only to the GitHub Pages origin on guest endpoints", () => {
    const h = guestCorsHeaders("/api/orders", "https://hmeeti.github.io");
    expect(h?.get("access-control-allow-origin")).toBe("https://hmeeti.github.io");
    expect(h?.get("access-control-allow-headers")).toContain("idempotency-key");
    expect(h?.get("access-control-allow-credentials")).toBeNull();
    expect(guestCorsHeaders("/api/orders/A1B2/events", "https://hmeeti.github.io")).not.toBeNull();
    expect(guestCorsHeaders("/api/menu/live", "https://hmeeti.github.io")).not.toBeNull();
  });

  it("is refused to other origins and to non-guest endpoints", () => {
    expect(guestCorsHeaders("/api/orders", "https://evil.example")).toBeNull();
    expect(guestCorsHeaders("/api/orders", "https://hmeeti.github.io.evil.example")).toBeNull();
    expect(guestCorsHeaders("/api/orders", null)).toBeNull();
    expect(guestCorsHeaders("/api/telegram/webhook", "https://hmeeti.github.io")).toBeNull();
    expect(guestCorsHeaders("/api/test/telegram", "https://hmeeti.github.io")).toBeNull();
    expect(guestCorsHeaders("/api/ordersX", "https://hmeeti.github.io")).toBeNull();
  });
});
