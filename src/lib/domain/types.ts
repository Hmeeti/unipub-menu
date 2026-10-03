export const NATIVE_LOCALES = ["ru", "kk", "en"] as const;
export type NativeLocale = (typeof NATIVE_LOCALES)[number];

export type I18nText = { ru: string; kk?: string; en?: string };
export type I18nList = { ru: string[]; kk?: string[]; en?: string[] };

export const ITEM_FLAGS = ["hit", "new", "spicy", "veg", "gf", "share"] as const;
export type ItemFlag = (typeof ITEM_FLAGS)[number];

/** Image stored on the CDN as pre-rendered variants `${src}-${w}.webp|.avif`, or an external URL. */
export type ImageAsset = {
  src: string;
  width: number;
  height: number;
  blur?: string;
  /** true when `src` is a variant base on our storage (see image loader) */
  variants?: boolean;
};

/**
 * Time window in venue timezone. `from > to` means the window crosses midnight and
 * belongs to the day it starts on (Fri 22:00–02:00 is still "Friday").
 */
export type Schedule = {
  days?: number[];
  from?: string;
  to?: string;
  startDate?: string;
  endDate?: string;
};

export type DayHours = { open: string; close: string } | null;
/** index 0 = Sunday … 6 = Saturday (JS getDay convention) */
export type WeeklyHours = DayHours[];

export type VenueContacts = {
  phone: string;
  phoneDisplay: string;
  whatsapp?: string;
  instagram?: string;
  telegram?: string;
  map2gis?: string;
  mapYandex?: string;
  review2gis?: string;
  rating?: string;
  reviewsCount?: string;
  address: I18nText;
};

export type VenueContent = {
  tagline: I18nText;
  rules: I18nList;
  karaokeRules: I18nList;
  popularQueries: I18nList;
};

export type VenueFeatures = {
  orders: boolean;
  booking: boolean;
  songs: boolean;
  promos: boolean;
};

export type VenueAnalytics = { goatcounterCode?: string };

export type PublicVenue = {
  name: string;
  timezone: string;
  serviceRateBp: number;
  hours: WeeklyHours;
  contacts: VenueContacts;
  content: VenueContent;
};

export type PublicCategory = { id: string; icon: string; title: I18nText; sort: number };
export type PublicAllergen = { id: string; icon: string; title: I18nText };

export type PublicItem = {
  id: string;
  categoryId: string;
  name: I18nText;
  description: I18nText;
  ingredients: I18nText;
  price: number;
  salePrice: number | null;
  saleSchedule: Schedule | null;
  flags: ItemFlag[];
  spicyLevel: number;
  weight: I18nText | null;
  cookTime: I18nText | null;
  images: ImageAsset[];
  pairWith: string[];
  allergens: string[];
  sort: number;
};

export type MenuSnapshot = {
  venue: PublicVenue;
  categories: PublicCategory[];
  allergens: PublicAllergen[];
  items: PublicItem[];
};

export type PublicPromotion = {
  id: number;
  kind: "banner" | "dish_of_day";
  title: I18nText;
  body: I18nText;
  itemId: string | null;
  image: ImageAsset | null;
  link: string | null;
  schedule: Schedule;
};

export type PublicWaiter = { id: string; name: string };
export type PublicRoom = { id: string; name: I18nText; capacity: number | null };

/** Everything the guest menu needs; composed from the published snapshot + live operational state. */
export type PublicMenu = MenuSnapshot & {
  version: number;
  soldOut: string[];
  promotions: PublicPromotion[];
  waiters: PublicWaiter[];
  rooms: PublicRoom[];
  features: VenueFeatures;
};

export type OrderLine = {
  itemId: string;
  nameRu: string;
  nameGuest: string;
  qty: number;
  unitPrice: number;
  basePrice: number;
  lineTotal: number;
};
