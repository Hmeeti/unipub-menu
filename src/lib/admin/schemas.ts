import { z } from "zod";
import { TABLE_CODE_RE } from "@/lib/domain/limits";
import { ITEM_FLAGS } from "@/lib/domain/types";

// Admin forms show zod messages to the manager; guest APIs only return codes.
z.config(z.locales.ru());

const trimmed = (max: number) => z.string().trim().max(max);

export const i18nText = (max = 200, required = true) =>
  z.object({
    ru: required ? trimmed(max).min(1) : trimmed(max),
    kk: trimmed(max).optional(),
    en: trimmed(max).optional(),
  });

export const i18nList = z.object({
  ru: z.array(trimmed(300)).max(40),
  kk: z.array(trimmed(300)).max(40).optional(),
  en: z.array(trimmed(300)).max(40).optional(),
});

export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, "латиница, цифры, - и _, до 40 символов");

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "время ЧЧ:ММ");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "дата ГГГГ-ММ-ДД");

export const scheduleSchema = z
  .object({
    days: z.array(z.int().min(0).max(6)).max(7).optional(),
    from: hm.optional(),
    to: hm.optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
  })
  .refine((s) => !s.startDate || !s.endDate || s.startDate <= s.endDate, {
    message: "дата окончания раньше начала",
    path: ["endDate"],
  })
  .refine((s) => Boolean(s.from) === Boolean(s.to), {
    message: "укажите и начало, и конец",
    path: ["to"],
  });

export const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    try {
      return new URL(v).protocol === "https:";
    } catch {
      return false;
    }
  }, "только https-ссылки");

const optionalUrl = httpsUrl.optional().or(z.literal("").transform(() => undefined));

export const imageAssetSchema = z.object({
  src: z.string().max(500),
  width: z.int().min(1).max(10000),
  height: z.int().min(1).max(10000),
  blur: z.string().max(4000).optional(),
  variants: z.boolean().optional(),
});

const money = z.int().min(0).max(10_000_000);

export const itemSchema = z
  .object({
    id: slug,
    categoryId: slug,
    name: i18nText(120),
    description: i18nText(600, false),
    ingredients: i18nText(600, false),
    price: money,
    salePrice: money.nullable(),
    saleSchedule: scheduleSchema.nullable(),
    flags: z.array(z.enum(ITEM_FLAGS)).max(ITEM_FLAGS.length),
    spicyLevel: z.int().min(0).max(3),
    weight: i18nText(60, false).nullable(),
    cookTime: i18nText(60, false).nullable(),
    images: z.array(imageAssetSchema).max(6),
    pairWith: z.array(slug).max(8),
    allergens: z.array(slug).max(20),
    isActive: z.boolean(),
  })
  .refine((v) => v.salePrice === null || v.salePrice < v.price, {
    message: "цена по акции должна быть ниже обычной",
    path: ["salePrice"],
  });
export type ItemInput = z.infer<typeof itemSchema>;

export const categorySchema = z.object({
  id: slug,
  icon: z.string().regex(/^[a-z-]{1,24}$/),
  title: i18nText(60),
  isActive: z.boolean(),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const promotionSchema = z.object({
  id: z.int().positive().nullable(),
  kind: z.enum(["banner", "dish_of_day"]),
  title: i18nText(120),
  body: i18nText(400, false),
  itemId: slug.nullable(),
  image: imageAssetSchema.nullable(),
  link: httpsUrl.nullable(),
  schedule: scheduleSchema,
  sort: z.int().min(0).max(100_000),
  isActive: z.boolean(),
});
export type PromotionInput = z.infer<typeof promotionSchema>;

export const roomSchema = z.object({
  id: slug,
  name: i18nText(60),
  description: i18nText(300, false),
  capacity: z.int().min(1).max(500).nullable(),
  sort: z.int().min(0).max(100_000),
  isActive: z.boolean(),
});
export type RoomInput = z.infer<typeof roomSchema>;

export const tableSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(TABLE_CODE_RE, "латиница и цифры, до 8 символов (12, VIP1)"),
  roomId: slug.nullable(),
  label: trimmed(60).nullable(),
  sort: z.int().min(0).max(100_000),
  isActive: z.boolean(),
});
export type TableInput = z.infer<typeof tableSchema>;

export const telegramId = z.int().min(1).max(Number.MAX_SAFE_INTEGER);

export const waiterSchema = z.object({
  id: slug,
  name: trimmed(40).min(1),
  telegramUserId: telegramId.nullable(),
  sort: z.int().min(0).max(100_000),
  isActive: z.boolean(),
});
export type WaiterInput = z.infer<typeof waiterSchema>;

const dayHours = z.object({ open: hm, close: hm }).nullable();

export const venueSchema = z.object({
  name: trimmed(60).min(1),
  servicePercent: z.number().min(0).max(30),
  hours: z.array(dayHours).length(7),
  contacts: z.object({
    phone: z
      .string()
      .trim()
      .regex(/^\+?\d{10,15}$/, "телефон в формате +77001234567")
      .or(z.literal("")),
    phoneDisplay: trimmed(30),
    whatsapp: optionalUrl,
    instagram: optionalUrl,
    telegram: optionalUrl,
    map2gis: optionalUrl,
    mapYandex: optionalUrl,
    review2gis: optionalUrl,
    rating: trimmed(10).optional(),
    reviewsCount: trimmed(10).optional(),
    address: i18nText(200, false),
  }),
  content: z.object({
    tagline: i18nText(200, false),
    rules: i18nList,
    karaokeRules: i18nList,
    popularQueries: i18nList,
  }),
  analytics: z.object({ goatcounterCode: trimmed(60).optional() }),
});
export type VenueInput = z.infer<typeof venueSchema>;

export const featuresSchema = z.object({
  orders: z.boolean(),
  booking: z.boolean(),
  songs: z.boolean(),
  promos: z.boolean(),
});

export const userSchema = z.object({
  id: z.int().positive().nullable(),
  login: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,32}$/, "латиница, цифры, . _ -, 3–32 символа"),
  name: trimmed(60).min(1),
  role: z.enum(["owner", "manager", "waiter"]),
  telegramUserId: telegramId.nullable(),
  isActive: z.boolean(),
  password: z.string().max(200).optional(),
});
export type UserInput = z.infer<typeof userSchema>;

export const bulkSchema = z.object({
  ids: z.array(slug).min(1).max(500),
  action: z.enum(["sold_out", "in_stock", "hide", "show", "move"]),
  categoryId: slug.optional(),
});
