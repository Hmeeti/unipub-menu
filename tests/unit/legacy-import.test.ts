import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  localizeMeasure,
  parseLegacyMenuJs,
  transformLegacy,
  type LegacyData,
} from "@/lib/legacy/import";

const root = path.resolve(__dirname, "../..");
const primary = parseLegacyMenuJs(readFileSync(path.join(root, "legacy/menu-data.js"), "utf8"));
const secondary = JSON.parse(
  readFileSync(path.join(root, "legacy/menu.json"), "utf8"),
) as LegacyData;
const { seed, report } = transformLegacy(primary, secondary);

describe("legacy import", () => {
  it("imports every dish and category without loss", () => {
    expect(seed.items).toHaveLength(primary.items.length);
    expect(seed.items).toHaveLength(46);
    expect(seed.categories.map((c) => c.id)).not.toContain("all");
    expect(seed.categories).toHaveLength(8);
  });

  it("keeps prices from menu-data.js (the file the live site used)", () => {
    for (const legacy of primary.items) {
      expect(seed.items.find((i) => i.id === legacy.id)!.price).toBe(legacy.price);
    }
    expect(seed.items.find((i) => i.id === "s1")!.price).toBe(3900);
  });

  it("maps every legacy allergen into the normalized directory", () => {
    const legacyLinks = primary.items.reduce((s, i) => s + (i.allergens?.length ?? 0), 0);
    expect(report.counts.allergenLinks).toBe(legacyLinks);
    expect(report.warnings.filter((w) => w.includes("аллерген"))).toEqual([]);
    expect(seed.items.find((i) => i.id === "s1")!.allergens).toEqual(["fish", "sesame", "soy"]);
  });

  it("renames kz→kk and keeps all three languages", () => {
    const s1 = seed.items.find((i) => i.id === "s1")!;
    expect(s1.name).toEqual({ ru: "Тартар из тунца", kk: "Тунец тартары", en: "Tuna tartare" });
  });

  it("reports the tuna tartare ingredient mismatch between languages", () => {
    expect(
      report.languageMismatches.some((m) => m.includes("s1") && m.includes("RU 6, KZ 4, EN 5")),
    ).toBe(true);
  });

  it("reports the price difference between menu-data.js and menu.json", () => {
    expect(
      report.sourceDiffs.some(
        (d) => d.startsWith("s1: price") && d.includes("3900") && d.includes("4900"),
      ),
    ).toBe(true);
  });

  it("drops waiter phone numbers", () => {
    expect(seed.waiters.length).toBe(4);
    expect(JSON.stringify(seed.waiters)).not.toMatch(/\d{10}/);
  });

  it("converts service rate and hours", () => {
    expect(seed.venue.serviceRateBp).toBe(1500);
    expect(seed.venue.hours[0]).toEqual({ open: "12:00", close: "02:00" });
  });

  it("localizes measures", () => {
    expect(localizeMeasure("180 г").value).toEqual({ ru: "180 г", kk: "180 г", en: "180 g" });
    expect(localizeMeasure("на 3–4 чел.").value).toEqual({
      ru: "на 3–4 чел.",
      kk: "3–4 адамға",
      en: "for 3–4",
    });
    expect(localizeMeasure("бронь").value?.en).toBe("by booking");
    expect(localizeMeasure("что-то").known).toBe(false);
    expect(localizeMeasure(undefined).value).toBeNull();
  });
});
