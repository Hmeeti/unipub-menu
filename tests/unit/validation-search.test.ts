import { describe, expect, it } from "vitest";
import {
  fold,
  matchQuery,
  splitHighlight,
  stem,
  switchLayout,
  translitToRu,
} from "@/lib/search/search";
import {
  formatKzPhone,
  normalizeKzPhone,
  orderInputSchema,
  requestInputSchema,
  validateBookingDate,
} from "@/lib/validation/schemas";

const almaty = (local: string) => new Date(`${local}+05:00`);

describe("booking dates", () => {
  const now = almaty("2026-10-03T18:00:00");
  it("rejects the past, including earlier today", () => {
    expect(validateBookingDate("2026-10-02", "20:00", now)).toBe("booking_past");
    expect(validateBookingDate("2026-10-03", "17:30", now)).toBe("booking_past");
    expect(validateBookingDate("2026-10-03", "18:00", now)).toBe("booking_past");
  });
  it("accepts later today and up to 60 days ahead", () => {
    expect(validateBookingDate("2026-10-03", "21:00", now)).toBeNull();
    expect(validateBookingDate("2026-12-02", "20:00", now)).toBeNull();
  });
  it("rejects more than 60 days ahead and invalid dates", () => {
    expect(validateBookingDate("2026-12-03", "20:00", now)).toBe("booking_too_far");
    expect(validateBookingDate("2026-02-30", "20:00", now)).toBe("booking_invalid");
    expect(validateBookingDate("2026-10-10", "25:00", now)).toBe("booking_invalid");
    expect(validateBookingDate("10.10.2026", "20:00", now)).toBe("booking_invalid");
  });
  it("uses venue time, not server UTC", () => {
    // 2026-10-03 20:30 UTC is already 2026-10-04 01:30 in Almaty
    const lateUtc = new Date("2026-10-03T20:30:00Z");
    expect(validateBookingDate("2026-10-03", "23:00", lateUtc)).toBe("booking_past");
  });
});

describe("phones", () => {
  it("normalizes KZ numbers", () => {
    expect(normalizeKzPhone("+7 (777) 888-44-22")).toBe("77778884422");
    expect(normalizeKzPhone("87778884422")).toBe("77778884422");
    expect(normalizeKzPhone("7778884422")).toBe("77778884422");
    expect(normalizeKzPhone("+1 555 0100")).toBeNull();
  });
  it("formats the +7 mask progressively", () => {
    expect(formatKzPhone("777")).toBe("+7 (77");
    expect(formatKzPhone("7777")).toBe("+7 (777)");
    expect(formatKzPhone("77778884422")).toBe("+7 (777) 888-44-22");
    expect(formatKzPhone("8777888")).toBe("+7 (777) 888");
  });
});

describe("order schema", () => {
  const valid = { lines: [{ itemId: "s1", qty: 2 }], waiterId: "marina", tableCode: "vip1" };
  it("accepts ids and quantities only and uppercases the table", () => {
    const r = orderInputSchema.parse(valid);
    expect(r.tableCode).toBe("VIP1");
    expect(r.locale).toBe("ru");
  });
  it("strips client-sent prices and names", () => {
    const r = orderInputSchema.parse({
      ...valid,
      lines: [{ itemId: "s1", qty: 1, price: 1, name: "x" }],
      total: 1,
    });
    expect(r.lines[0]).toEqual({ itemId: "s1", qty: 1 });
    expect("total" in r).toBe(false);
  });
  it("rejects bad input", () => {
    expect(orderInputSchema.safeParse({ ...valid, lines: [] }).success).toBe(false);
    expect(
      orderInputSchema.safeParse({ ...valid, lines: [{ itemId: "s1", qty: 0 }] }).success,
    ).toBe(false);
    expect(
      orderInputSchema.safeParse({ ...valid, lines: [{ itemId: "s1", qty: 31 }] }).success,
    ).toBe(false);
    expect(orderInputSchema.safeParse({ ...valid, tableCode: "TOOLONG12" }).success).toBe(false);
    expect(orderInputSchema.safeParse({ ...valid, website: "spam" }).success).toBe(false);
    expect(
      orderInputSchema.safeParse({
        ...valid,
        lines: [
          { itemId: "s1", qty: 1 },
          { itemId: "s1", qty: 1 },
        ],
      }).success,
    ).toBe(false);
    expect(
      orderInputSchema.safeParse({ ...valid, lines: [{ itemId: "<script>", qty: 1 }] }).success,
    ).toBe(false);
  });
});

describe("request schema", () => {
  it("validates each request type", () => {
    expect(requestInputSchema.safeParse({ type: "waiter", tableCode: "5" }).success).toBe(true);
    expect(
      requestInputSchema.safeParse({ type: "bill", tableCode: "5", payment: "card" }).success,
    ).toBe(true);
    expect(
      requestInputSchema.safeParse({ type: "bill", tableCode: "5", payment: "crypto" }).success,
    ).toBe(false);
    expect(
      requestInputSchema.safeParse({ type: "song", artist: "Queen", title: "Bohemian Rhapsody" })
        .success,
    ).toBe(true);
    expect(requestInputSchema.safeParse({ type: "song", artist: "", title: "x" }).success).toBe(
      false,
    );
    const booking = {
      type: "booking",
      name: "Айгерим",
      phone: "+7 (777) 888-44-22",
      date: "2026-10-10",
      time: "20:00",
      guests: 6,
    };
    expect(requestInputSchema.safeParse(booking).success).toBe(true);
    expect(requestInputSchema.safeParse({ ...booking, phone: "123" }).success).toBe(false);
    expect(requestInputSchema.safeParse({ ...booking, guests: 0 }).success).toBe(false);
  });
});

describe("search (port of legacy js/search.js)", () => {
  const tartare = ["Тартар из тунца", "Свежий тунец, авокадо, юзу", "тунец, авокадо, юзу, кунжут"];
  const ribeye = ["Рибай стейк", "300 г на углях"];
  const cocktail = ["Негрони", "Классический коктейль"];

  it("folds case, ё and punctuation", () => {
    expect(fold("Ёжик, «Тест»!")).toBe("ежик тест");
  });
  it("stems Russian word forms to a shared root", () => {
    expect(stem("тунца")).toBe(stem("тунец"));
    expect(stem("коктейли")).toBe("коктейл");
  });
  it("transliterates latin queries", () => {
    expect(translitToRu("ribay")).toBe("рибай");
    expect(translitToRu("shashlyk")).toBe("шашлык");
  });
  it("finds by morphology, aliases and transliteration", () => {
    expect(matchQuery("тунец", tartare).ok).toBe(true);
    expect(matchQuery("тунцом", tartare).ok).toBe(true);
    expect(matchQuery("tuna", tartare).ok).toBe(true);
    expect(matchQuery("ribay", ribeye).ok).toBe(true);
    expect(matchQuery("стейк", ribeye).ok).toBe(true);
    expect(matchQuery("коктейли", cocktail).ok).toBe(true);
    expect(matchQuery("cocktail", cocktail).ok).toBe(true);
  });
  it("requires all words to match", () => {
    expect(matchQuery("тунец авокадо", tartare).ok).toBe(true);
    expect(matchQuery("тунец шоколад", tartare).ok).toBe(false);
  });
  it("fixes the wrong keyboard layout", () => {
    expect(switchLayout("nfhnfh")).toBe("тартар");
    expect(matchQuery("nfhnfh", tartare).ok).toBe(true);
    expect(matchQuery("ытфсл", ["Snack board"]).ok).toBe(true);
  });
  it("matches everything on an empty query", () => {
    expect(matchQuery("  ", tartare)).toEqual({ ok: true, score: 0 });
  });
  it("ranks exact matches higher", () => {
    expect(matchQuery("тартар", tartare).score).toBeGreaterThan(matchQuery("тарт", tartare).score);
  });
  it("splits text for highlighting without HTML", () => {
    const parts = splitHighlight("Тартар из тунца", "тунец");
    expect(parts.some((p) => p.hit && p.text.toLowerCase().startsWith("тунц"))).toBe(true);
    expect(parts.map((p) => p.text).join("")).toBe("Тартар из тунца");
    expect(splitHighlight("<b>x</b>", "")).toEqual([{ text: "<b>x</b>", hit: false }]);
  });
});
