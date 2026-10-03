import { effectivePrice, isOnSale, type PricedItem } from "@/lib/domain/pricing";
import { isScheduleActive, openStatus, type OpenStatus } from "@/lib/domain/schedule";
import type { NativeLocale, PublicMenu, Schedule, WeeklyHours } from "@/lib/domain/types";
import { activePromotions, type MenuView, type PromoView } from "./view";

/**
 * The time-dependent part of the menu (sale prices, promotions, opening hours), kept with its
 * schedules so a static page built hours ago can recompute it with the guest's clock.
 */
export type TimedOverlay = {
  tz: string;
  hours: WeeklyHours;
  sales: (PricedItem & { id: string })[];
  promos: (PromoView & { schedule: Schedule })[];
};

export function timedOverlay(menu: PublicMenu, locale: NativeLocale): TimedOverlay {
  const unscheduled = { ...menu, promotions: menu.promotions.map((p) => ({ ...p, schedule: {} })) };
  const views = new Map(activePromotions(unscheduled, locale, new Date()).map((p) => [p.id, p]));
  return {
    tz: menu.venue.timezone,
    hours: menu.venue.hours,
    sales: menu.items
      .filter((i) => i.salePrice != null)
      .map((i) => ({
        id: i.id,
        price: i.price,
        salePrice: i.salePrice,
        saleSchedule: i.saleSchedule,
      })),
    promos: menu.promotions.flatMap((p) => {
      const view = views.get(p.id);
      return view ? [{ ...view, schedule: p.schedule }] : [];
    }),
  };
}

export function applyOverlay(
  menu: MenuView,
  overlay: TimedOverlay,
  now: Date,
): { menu: MenuView; promos: PromoView[]; status: OpenStatus } {
  const sales = new Map(overlay.sales.map((s) => [s.id, s]));
  return {
    menu: {
      ...menu,
      items: menu.items.map((it) => {
        const s = sales.get(it.id);
        if (!s) return it;
        return {
          ...it,
          price: effectivePrice(s, now, overlay.tz),
          oldPrice: isOnSale(s, now, overlay.tz) ? s.price : null,
        };
      }),
    },
    promos: overlay.promos
      .filter((p) => isScheduleActive(p.schedule, now, overlay.tz))
      .map(({ schedule: _schedule, ...p }) => p),
    status: openStatus(overlay.hours, now, overlay.tz),
  };
}
