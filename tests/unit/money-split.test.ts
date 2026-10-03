import { describe, expect, it } from "vitest";
import { computeTotals, formatPrice, NBSP, percentLabel, serviceFor } from "@/lib/domain/money";
import { calcSplit, ownerOf, SHARED_ID } from "@/lib/domain/split";

describe("formatPrice", () => {
  it("groups thousands with non-breaking spaces and keeps ₸ attached", () => {
    expect(formatPrice(3900)).toBe(`3${NBSP}900${NBSP}₸`);
    expect(formatPrice(1234567)).toBe(`1${NBSP}234${NBSP}567${NBSP}₸`);
    expect(formatPrice(0)).toBe(`0${NBSP}₸`);
    expect(formatPrice(950)).toBe(`950${NBSP}₸`);
  });
  it("never contains a regular space", () => {
    expect(formatPrice(12400)).not.toContain(" ");
  });
  it("handles non-finite values", () => {
    expect(formatPrice(Number.NaN)).toBe(`—${NBSP}₸`);
  });
});

describe("totals", () => {
  it("adds 15% service rounded to tenge like the legacy menu", () => {
    expect(computeTotals([3900, 4200], 1500)).toEqual({
      subtotal: 8100,
      service: 1215,
      total: 9315,
    });
    expect(serviceFor(3333, 1500)).toBe(500); // 499.95 → 500
    expect(serviceFor(0, 1500)).toBe(0);
  });
  it("supports a configurable rate", () => {
    expect(computeTotals([10000], 1000).service).toBe(1000);
    expect(percentLabel(1500)).toBe("15");
    expect(percentLabel(1250)).toBe("12.5");
  });
});

describe("calcSplit (legacy algorithm)", () => {
  const people = [
    { id: "p1", name: "Я" },
    { id: "p2", name: "Друг" },
    { id: "p3", name: "Гость 3" },
  ];

  it("assigns personal lines and splits shared lines equally", () => {
    const lines = [
      { itemId: "a", lineTotal: 3900 },
      { itemId: "b", lineTotal: 4200 },
      { itemId: "c", lineTotal: 3000 },
    ];
    const assign = { a: "p1", b: "p2", c: SHARED_ID };
    const grand = computeTotals([3900, 4200, 3000], 1500).total;
    const parts = calcSplit(lines, people, assign, 1500, grand);
    expect(parts.map((p) => p.sub)).toEqual([4900, 5200, 1000]);
    expect(parts.reduce((s, p) => s + p.total, 0)).toBe(grand);
  });

  it("puts the rounding remainder into the last person's service", () => {
    const lines = [{ itemId: "x", lineTotal: 1000 }];
    const assign = { x: SHARED_ID };
    const grand = computeTotals([1000], 1500).total; // 1150
    const parts = calcSplit(lines, people, assign, 1500, grand);
    // 333.33 → 333 each, service 50 each → 1149, remainder 1 goes to the last person
    expect(parts.map((p) => p.total)).toEqual([383, 383, 384]);
    expect(parts[2]!.service).toBe(51);
    expect(parts.reduce((s, p) => s + p.total, 0)).toBe(grand);
  });

  it("falls back to the first person for unknown or missing owners", () => {
    expect(ownerOf("a", { a: "ghost" }, people)).toBe("p1");
    expect(ownerOf("a", {}, people)).toBe("p1");
    expect(ownerOf("a", { a: SHARED_ID }, people)).toBe(SHARED_ID);
  });

  it("returns nothing without people", () => {
    expect(calcSplit([{ itemId: "a", lineTotal: 100 }], [], {}, 1500, 115)).toEqual([]);
  });

  it("always sums to the grand total for many random carts", () => {
    for (let n = 0; n < 200; n += 1) {
      const lines = Array.from({ length: 1 + (n % 6) }, (_, i) => ({
        itemId: `i${i}`,
        lineTotal: 100 * (7 + ((n * 13 + i * 31) % 120)),
      }));
      const assign: Record<string, string> = {};
      lines.forEach((l, i) => (assign[l.itemId] = [SHARED_ID, "p1", "p2", "p3"][(n + i) % 4]!));
      const grand = computeTotals(
        lines.map((l) => l.lineTotal),
        1500,
      ).total;
      const parts = calcSplit(lines, people, assign, 1500, grand);
      expect(parts.reduce((s, p) => s + p.total, 0)).toBe(grand);
    }
  });
});
