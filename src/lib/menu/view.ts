import { effectivePrice, isOnSale } from "@/lib/domain/pricing";
import type {
  ImageAsset,
  ItemFlag,
  NativeLocale,
  PublicMenu,
  PublicPromotion,
} from "@/lib/domain/types";
import { NATIVE_LOCALES } from "@/lib/domain/types";
import { isScheduleActive } from "@/lib/domain/schedule";
import { pick, pickList } from "@/lib/i18n/text";

/** Localized, price-resolved item as sent to the client (one language, no schedules). */
export type ItemView = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  ingredients: string;
  weight: string | null;
  cookTime: string | null;
  /** effective price right now (sale applied) */
  price: number;
  /** regular price when a sale is active, otherwise null */
  oldPrice: number | null;
  flags: ItemFlag[];
  spicyLevel: number;
  images: ImageAsset[];
  pairWith: string[];
  allergens: string[];
  sort: number;
  /** names/ingredients in the other native languages, for cross-language search */
  alt: string;
};

export type CategoryView = { id: string; icon: string; title: string };
export type AllergenView = { id: string; icon: string; title: string };
export type PromoView = {
  id: number;
  kind: PublicPromotion["kind"];
  title: string;
  body: string;
  itemId: string | null;
  image: ImageAsset | null;
  link: string | null;
};

export type MenuView = {
  version: number;
  serviceRateBp: number;
  categories: CategoryView[];
  allergens: AllergenView[];
  items: ItemView[];
  soldOut: string[];
  waiters: { id: string; name: string }[];
  features: PublicMenu["features"];
  popularQueries: string[];
};

export function toMenuView(menu: PublicMenu, locale: NativeLocale, now: Date): MenuView {
  const tz = menu.venue.timezone;
  const others = NATIVE_LOCALES.filter((l) => l !== locale);
  return {
    version: menu.version,
    serviceRateBp: menu.venue.serviceRateBp,
    categories: menu.categories.map((c) => ({
      id: c.id,
      icon: c.icon,
      title: pick(c.title, locale),
    })),
    allergens: menu.allergens.map((a) => ({
      id: a.id,
      icon: a.icon,
      title: pick(a.title, locale),
    })),
    items: menu.items.map((it) => {
      const sale = isOnSale(it, now, tz);
      return {
        id: it.id,
        categoryId: it.categoryId,
        name: pick(it.name, locale),
        description: pick(it.description, locale),
        ingredients: pick(it.ingredients, locale),
        weight: it.weight ? pick(it.weight, locale) : null,
        cookTime: it.cookTime ? pick(it.cookTime, locale) : null,
        price: effectivePrice(it, now, tz),
        oldPrice: sale ? it.price : null,
        flags: it.flags,
        spicyLevel: it.spicyLevel,
        images: it.images,
        pairWith: it.pairWith,
        allergens: it.allergens,
        sort: it.sort,
        alt: others
          .flatMap((l) => [it.name[l], it.ingredients[l]])
          .filter(Boolean)
          .join(" "),
      };
    }),
    soldOut: menu.soldOut,
    waiters: menu.waiters,
    features: menu.features,
    popularQueries: pickList(menu.venue.content.popularQueries, locale),
  };
}

export function activePromotions(menu: PublicMenu, locale: NativeLocale, now: Date): PromoView[] {
  if (!menu.features.promos) return [];
  const itemIds = new Set(menu.items.map((i) => i.id));
  return menu.promotions
    .filter((p) => isScheduleActive(p.schedule, now, menu.venue.timezone))
    .filter((p) => !p.itemId || itemIds.has(p.itemId))
    .map((p) => ({
      id: p.id,
      kind: p.kind,
      title: pick(p.title, locale),
      body: pick(p.body, locale),
      itemId: p.itemId,
      image: p.image,
      link: p.link && p.link.startsWith("https://") ? p.link : null,
    }));
}
