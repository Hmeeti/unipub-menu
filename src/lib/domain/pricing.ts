import { isScheduleActive, VENUE_TZ } from "./schedule";
import type { PublicItem } from "./types";

export type PricedItem = Pick<PublicItem, "price" | "salePrice" | "saleSchedule">;

/** Sale price applies only while its schedule is active (or always, when no schedule is set). */
export function isOnSale(item: PricedItem, now: Date, tz: string = VENUE_TZ): boolean {
  if (item.salePrice == null || item.salePrice <= 0 || item.salePrice >= item.price) return false;
  if (!item.saleSchedule) return true;
  return isScheduleActive(item.saleSchedule, now, tz);
}

export function effectivePrice(item: PricedItem, now: Date, tz: string = VENUE_TZ): number {
  return isOnSale(item, now, tz) ? (item.salePrice as number) : item.price;
}
