import { describe, expect, it } from "vitest";
import { effectivePrice, isOnSale } from "@/lib/domain/pricing";
import {
  businessDay,
  formatHm,
  isScheduleActive,
  openStatus,
  parseHm,
  zonedParts,
} from "@/lib/domain/schedule";
import type { WeeklyHours } from "@/lib/domain/types";

/** Build a UTC instant from Almaty local time (UTC+5 since 2024-03-01). */
const almaty = (local: string) => new Date(`${local}+05:00`);

const daily: WeeklyHours = Array.from({ length: 7 }, () => ({ open: "12:00", close: "02:00" }));

describe("zonedParts", () => {
  it("converts to Asia/Almaty", () => {
    // 2026-10-02 is a Friday; 20:00 UTC is Saturday 01:00 in Almaty
    const p = zonedParts(new Date("2026-10-02T20:00:00Z"));
    expect(p).toMatchObject({ weekday: 6, hour: 1, minute: 0, ymd: "2026-10-03" });
  });
});

describe("parseHm / formatHm", () => {
  it("parses and formats", () => {
    expect(parseHm("02:00")).toBe(120);
    expect(parseHm("24:00")).toBe(1440);
    expect(parseHm("25:00")).toBeNull();
    expect(parseHm("12:60")).toBeNull();
    expect(parseHm("")).toBeNull();
    expect(formatHm(1500)).toBe("01:00");
  });
});

describe("openStatus with a shift crossing midnight", () => {
  it("is open in the evening and says until 02:00", () => {
    expect(openStatus(daily, almaty("2026-10-02T21:30:00"))).toEqual({
      open: true,
      closesAt: "02:00",
    });
  });
  it("is still open at 01:30 (yesterday's shift)", () => {
    expect(openStatus(daily, almaty("2026-10-03T01:30:00"))).toEqual({
      open: true,
      closesAt: "02:00",
    });
  });
  it("is closed at 02:00 sharp and opens at 12:00 the same day", () => {
    expect(openStatus(daily, almaty("2026-10-03T02:00:00"))).toEqual({
      open: false,
      opensAt: "12:00",
      opensWeekday: 6,
    });
  });
  it("is closed at 11:59 and opens at noon", () => {
    expect(openStatus(daily, almaty("2026-10-03T11:59:00"))).toMatchObject({
      open: false,
      opensAt: "12:00",
    });
  });
  it("handles a day off (Monday closed) and finds the next opening", () => {
    const hours: WeeklyHours = [...daily];
    hours[1] = null; // Monday
    // Monday 2026-10-05 15:00: closed; Sunday's shift ended at 02:00
    expect(openStatus(hours, almaty("2026-10-05T15:00:00"))).toEqual({
      open: false,
      opensAt: "12:00",
      opensWeekday: 2,
    });
    // Monday 01:00 still belongs to Sunday's shift
    expect(openStatus(hours, almaty("2026-10-05T01:00:00"))).toEqual({
      open: true,
      closesAt: "02:00",
    });
  });
  it("supports same-day hours", () => {
    const hours: WeeklyHours = Array.from({ length: 7 }, () => ({ open: "10:00", close: "22:00" }));
    expect(openStatus(hours, almaty("2026-10-03T22:00:00"))).toMatchObject({
      open: false,
      opensAt: "10:00",
    });
    expect(openStatus(hours, almaty("2026-10-03T21:59:00"))).toEqual({
      open: true,
      closesAt: "22:00",
    });
  });
  it("returns no opening when always closed", () => {
    expect(
      openStatus(
        Array.from({ length: 7 }, () => null),
        new Date(),
      ),
    ).toEqual({
      open: false,
      opensAt: null,
      opensWeekday: null,
    });
  });
});

describe("isScheduleActive (promotions, happy hours)", () => {
  const fridayNight = { days: [5], from: "22:00", to: "02:00" };
  it("belongs to the start day when crossing midnight", () => {
    expect(isScheduleActive(fridayNight, almaty("2026-10-02T23:00:00"))).toBe(true); // Fri 23:00
    expect(isScheduleActive(fridayNight, almaty("2026-10-03T01:59:00"))).toBe(true); // Sat 01:59
    expect(isScheduleActive(fridayNight, almaty("2026-10-03T02:00:00"))).toBe(false);
    expect(isScheduleActive(fridayNight, almaty("2026-10-03T23:00:00"))).toBe(false); // Sat 23:00
    expect(isScheduleActive(fridayNight, almaty("2026-10-02T01:00:00"))).toBe(false); // Fri 01:00 = Thu shift
  });
  it("respects date ranges, including the after-midnight tail of the last day", () => {
    const s = { from: "22:00", to: "02:00", startDate: "2026-10-01", endDate: "2026-10-02" };
    expect(isScheduleActive(s, almaty("2026-10-03T01:00:00"))).toBe(true);
    expect(isScheduleActive(s, almaty("2026-10-03T23:00:00"))).toBe(false);
    expect(isScheduleActive(s, almaty("2026-09-30T23:00:00"))).toBe(false);
  });
  it("treats missing times as all-day", () => {
    expect(isScheduleActive({ days: [6] }, almaty("2026-10-03T09:00:00"))).toBe(true);
    expect(isScheduleActive({ days: [0] }, almaty("2026-10-03T09:00:00"))).toBe(false);
    expect(isScheduleActive({}, new Date())).toBe(true);
    expect(isScheduleActive(null, new Date())).toBe(false);
  });
  it("handles same-day windows", () => {
    const lunch = { days: [1, 2, 3, 4, 5], from: "12:00", to: "16:00" };
    expect(isScheduleActive(lunch, almaty("2026-10-02T12:00:00"))).toBe(true);
    expect(isScheduleActive(lunch, almaty("2026-10-02T16:00:00"))).toBe(false);
    expect(isScheduleActive(lunch, almaty("2026-10-03T13:00:00"))).toBe(false);
  });
});

describe("sale price", () => {
  const item = {
    price: 3900,
    salePrice: 2900,
    saleSchedule: { days: [5], from: "18:00", to: "02:00" },
  };
  it("applies only inside its schedule", () => {
    expect(effectivePrice(item, almaty("2026-10-02T19:00:00"))).toBe(2900);
    expect(effectivePrice(item, almaty("2026-10-03T01:00:00"))).toBe(2900);
    expect(effectivePrice(item, almaty("2026-10-03T19:00:00"))).toBe(3900);
  });
  it("ignores invalid sale prices", () => {
    expect(isOnSale({ price: 1000, salePrice: 1200, saleSchedule: null }, new Date())).toBe(false);
    expect(isOnSale({ price: 1000, salePrice: 0, saleSchedule: null }, new Date())).toBe(false);
    expect(isOnSale({ price: 1000, salePrice: 800, saleSchedule: null }, new Date())).toBe(true);
  });
});

describe("businessDay", () => {
  it("keeps after-midnight orders in the previous evening", () => {
    expect(businessDay(almaty("2026-10-03T01:30:00"))).toBe("2026-10-02");
    expect(businessDay(almaty("2026-10-03T06:00:00"))).toBe("2026-10-03");
    expect(businessDay(almaty("2026-10-03T23:59:00"))).toBe("2026-10-03");
    expect(businessDay(almaty("2026-01-01T03:00:00"))).toBe("2025-12-31");
  });
});
