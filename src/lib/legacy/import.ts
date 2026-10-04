import type {
  I18nList,
  I18nText,
  ImageAsset,
  ItemFlag,
  VenueContacts,
  VenueContent,
  WeeklyHours,
} from "@/lib/domain/types";
import { ITEM_FLAGS } from "@/lib/domain/types";

/** Shape of window.UNIPUB_DATA in the legacy repo (js/menu-data.js and data/menu.json). */
type LegacyText = { ru?: string; kz?: string; en?: string } | string | undefined;
type LegacyItem = {
  id: string;
  category: string;
  name: LegacyText;
  desc?: LegacyText;
  ingredients?: LegacyText;
  price: number;
  weight?: string;
  cookTime?: string;
  allergens?: string[];
  flags?: string[];
  image?: string;
  imageAlt?: string;
};
export type LegacyData = {
  venue: Record<string, unknown>;
  categories: Array<{ id: string; title: LegacyText }>;
  filters?: unknown[];
  items: LegacyItem[];
  rules?: { ru?: string[]; kz?: string[]; en?: string[] };
  popularQueries?: { ru?: string[]; kz?: string[]; en?: string[] };
  serviceRate?: number;
  waiters?: Array<{ id: string; name: string; phone?: string }>;
};

export function parseLegacyMenuJs(source: string): LegacyData {
  const json = source
    .replace(/^\uFEFF/, "")
    .replace(/^[\s\S]*?window\.UNIPUB_DATA\s*=\s*/, "")
    .replace(/;\s*$/, "")
    .trim();
  return JSON.parse(json) as LegacyData;
}

export const ALLERGEN_DIRECTORY: Array<{ id: string; icon: string; title: I18nText }> = [
  { id: "gluten", icon: "wheat", title: { ru: "Глютен", kk: "Глютен", en: "Gluten" } },
  { id: "crustaceans", icon: "shrimp", title: { ru: "Ракообразные", kk: "Шаянтәрізділер", en: "Crustaceans" } },
  { id: "eggs", icon: "egg", title: { ru: "Яйца", kk: "Жұмыртқа", en: "Eggs" } },
  { id: "fish", icon: "fish", title: { ru: "Рыба", kk: "Балық", en: "Fish" } },
  { id: "peanuts", icon: "nut", title: { ru: "Арахис", kk: "Жержаңғақ", en: "Peanuts" } },
  { id: "soy", icon: "bean", title: { ru: "Соя", kk: "Соя", en: "Soy" } },
  { id: "milk", icon: "milk", title: { ru: "Молоко", kk: "Сүт", en: "Milk" } },
  { id: "nuts", icon: "nut", title: { ru: "Орехи", kk: "Жаңғақтар", en: "Tree nuts" } },
  { id: "celery", icon: "leaf", title: { ru: "Сельдерей", kk: "Балдыркөк", en: "Celery" } },
  { id: "mustard", icon: "droplet", title: { ru: "Горчица", kk: "Қыша", en: "Mustard" } },
  { id: "sesame", icon: "seed", title: { ru: "Кунжут", kk: "Күнжіт", en: "Sesame" } },
  { id: "sulphites", icon: "wine", title: { ru: "Сульфиты", kk: "Сульфиттер", en: "Sulphites" } },
  { id: "lupin", icon: "flower", title: { ru: "Люпин", kk: "Люпин", en: "Lupin" } },
  { id: "molluscs", icon: "shell", title: { ru: "Моллюски", kk: "Моллюскалар", en: "Molluscs" } },
];

const ALLERGEN_ALIASES: Record<string, string[]> = {
  глютен: ["gluten"],
  молоко: ["milk"],
  яйцо: ["eggs"],
  яйца: ["eggs"],
  рыба: ["fish"],
  морепродукты: ["crustaceans", "molluscs"],
  орехи: ["nuts"],
  арахис: ["peanuts"],
  соя: ["soy"],
  кунжут: ["sesame"],
  горчица: ["mustard"],
  сельдерей: ["celery"],
  люпин: ["lupin"],
  моллюски: ["molluscs"],
  ракообразные: ["crustaceans"],
  сульфиты: ["sulphites"],
};

const CATEGORY_ICONS: Record<string, string> = {
  starters: "salad",
  mains: "utensils",
  grill: "flame",
  sets: "layers",
  cocktails: "martini",
  drinks: "cup",
  karaoke: "mic",
  desserts: "cake",
};

function text(v: LegacyText): I18nText {
  if (v == null) return { ru: "" };
  if (typeof v === "string") return { ru: v };
  const out: I18nText = { ru: v.ru ?? v.en ?? v.kz ?? "" };
  if (v.kz) out.kk = v.kz;
  if (v.en) out.en = v.en;
  return out;
}

function list(v: { ru?: string[]; kz?: string[]; en?: string[] } | undefined): I18nList {
  return { ru: v?.ru ?? [], kk: v?.kz ?? [], en: v?.en ?? [] };
}

/** Localizes known Russian unit/portion patterns; unknown values stay Russian-only and are reported. */
export function localizeMeasure(raw: string | undefined): { value: I18nText | null; known: boolean } {
  if (!raw || !raw.trim()) return { value: null, known: true };
  const ru = raw.trim();
  const rules: Array<[RegExp, (m: RegExpMatchArray) => { kk: string; en: string }]> = [
    [/^([\d–-]+)\s*г$/, (m) => ({ kk: `${m[1]} г`, en: `${m[1]} g` })],
    [/^([\d–-]+)\s*мл$/, (m) => ({ kk: `${m[1]} мл`, en: `${m[1]} ml` })],
    [/^([\d–-]+)\s*мин$/, (m) => ({ kk: `${m[1]} мин`, en: `${m[1]} min` })],
    [/^на\s+([\d–-]+)\s*чел\.?$/, (m) => ({ kk: `${m[1]} адамға`, en: `for ${m[1]}` })],
    [/^до\s+(\d+)\s+гостей$/, (m) => ({ kk: `${m[1]} қонаққа дейін`, en: `up to ${m[1]} guests` })],
    [/^пакет$/, () => ({ kk: "пакет", en: "package" })],
    [/^бронь$/, () => ({ kk: "брондау бойынша", en: "by booking" })],
    [/^сразу$/, () => ({ kk: "бірден", en: "instant" })],
    [/^готово$/, () => ({ kk: "дайын", en: "ready to serve" })],
  ];
  for (const [re, fn] of rules) {
    const m = ru.match(re);
    if (m) return { value: { ru, ...fn(m) }, known: true };
  }
  return { value: { ru }, known: false };
}

function parseDailyHours(hours: LegacyText): { hours: WeeklyHours; parsed: boolean } {
  const ru = typeof hours === "string" ? hours : (hours?.ru ?? "");
  const m = ru.match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
  if (!m) return { hours: Array.from({ length: 7 }, () => ({ open: "12:00", close: "02:00" })), parsed: false };
  const pad = (s: string) => s.padStart(5, "0");
  const week: WeeklyHours = Array.from({ length: 7 }, () => ({
    open: pad(m[1] as string),
    close: pad(m[2] as string),
  }));
  // "…, пт–сб до 03:00": a later closing time for a range of days (index 0 = Sunday)
  const late = ru.match(/(пн|вт|ср|чт|пт|сб|вс)\s*[–-]\s*(пн|вт|ср|чт|пт|сб|вс)\s+до\s+(\d{1,2}:\d{2})/i);
  if (late) {
    const days = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
    const from = days.indexOf((late[1] as string).toLowerCase());
    const to = days.indexOf((late[2] as string).toLowerCase());
    for (let d = from; ; d = (d + 1) % 7) {
      const day = week[d];
      if (day) week[d] = { ...day, close: pad(late[3] as string) };
      if (d === to) break;
    }
  }
  return { hours: week, parsed: true };
}

function legacyImages(it: LegacyItem): ImageAsset[] {
  const urls = [it.image, it.imageAlt].filter((u): u is string => typeof u === "string" && /^https:\/\//.test(u));
  return [...new Set(urls)].map((src) => ({ src, width: 900, height: 675 }));
}

function ingredientCount(s: string | undefined) {
  return s ? s.split(",").map((x) => x.trim()).filter(Boolean).length : 0;
}

export type SeedItem = {
  id: string;
  categoryId: string;
  name: I18nText;
  description: I18nText;
  ingredients: I18nText;
  price: number;
  flags: ItemFlag[];
  spicyLevel: number;
  weight: I18nText | null;
  cookTime: I18nText | null;
  images: ImageAsset[];
  allergens: string[];
  sort: number;
};

export type SeedData = {
  venue: {
    name: string;
    serviceRateBp: number;
    hours: WeeklyHours;
    contacts: VenueContacts;
    content: VenueContent;
  };
  categories: Array<{ id: string; icon: string; title: I18nText; sort: number }>;
  allergens: typeof ALLERGEN_DIRECTORY;
  items: SeedItem[];
  waiters: Array<{ id: string; name: string; sort: number }>;
};

export type ImportReport = {
  counts: { categories: number; items: number; waiters: number; allergenLinks: number; priceSum: number };
  warnings: string[];
  languageMismatches: string[];
  sourceDiffs: string[];
};

const DEFAULT_KARAOKE_RULES: I18nList = {
  ru: [
    "Заявку на песню отправляйте через меню — ведущий ставит её в общую очередь.",
    "Очередь общая для всех столов, порядок — по времени заявки.",
    "Одна песня на стол за раз; следующую можно заказать после исполнения.",
    "VIP-залы поют без общей очереди.",
  ],
  kk: [
    "Әнге өтінімді мәзір арқылы жіберіңіз — жүргізуші оны жалпы кезекке қояды.",
    "Кезек барлық үстелдерге ортақ, реті — өтінім уақыты бойынша.",
    "Бір үстелге бір уақытта бір ән; келесісін орындалғаннан кейін тапсырыңыз.",
    "VIP-залдар жалпы кезексіз шырқайды.",
  ],
  en: [
    "Send song requests from the menu — the host adds them to the shared queue.",
    "The queue is shared by all tables and ordered by request time.",
    "One song per table at a time; request the next one after it is performed.",
    "VIP rooms sing without the shared queue.",
  ],
};

export function transformLegacy(primary: LegacyData, secondary?: LegacyData): { seed: SeedData; report: ImportReport } {
  const warnings: string[] = [];
  const languageMismatches: string[] = [];
  const sourceDiffs: string[] = [];
  const knownAllergens = new Set(ALLERGEN_DIRECTORY.map((a) => a.id));

  const categories = primary.categories
    .filter((c) => c.id !== "all")
    .map((c, i) => ({ id: c.id, icon: CATEGORY_ICONS[c.id] ?? "utensils", title: text(c.title), sort: (i + 1) * 10 }));

  const sortCounters = new Map<string, number>();
  const items: SeedItem[] = primary.items.map((it) => {
    const allergens = new Set<string>();
    for (const raw of it.allergens ?? []) {
      const key = raw.trim().toLowerCase();
      const mapped = ALLERGEN_ALIASES[key] ?? (knownAllergens.has(key) ? [key] : null);
      if (!mapped) warnings.push(`${it.id}: неизвестный аллерген «${raw}» — не импортирован`);
      else mapped.forEach((a) => allergens.add(a));
    }
    const flags = (it.flags ?? []).filter((f): f is ItemFlag => (ITEM_FLAGS as readonly string[]).includes(f));
    for (const f of it.flags ?? []) {
      if (!(ITEM_FLAGS as readonly string[]).includes(f)) warnings.push(`${it.id}: неизвестный флаг «${f}»`);
    }
    const weight = localizeMeasure(it.weight);
    const cook = localizeMeasure(it.cookTime);
    if (!weight.known) warnings.push(`${it.id}: вес «${it.weight}» не переведён автоматически (только RU)`);
    if (!cook.known) warnings.push(`${it.id}: время «${it.cookTime}» не переведено автоматически (только RU)`);
    if (!Number.isInteger(it.price) || it.price <= 0) warnings.push(`${it.id}: подозрительная цена ${it.price}`);

    const name = text(it.name);
    const description = text(it.desc);
    const ingredients = text(it.ingredients);
    const label = `${it.id} «${name.ru}»`;
    for (const [field, value] of [
      ["название", name],
      ["описание", description],
      ["состав", ingredients],
    ] as const) {
      if (value.ru && !value.kk) languageMismatches.push(`${label}: нет KZ для поля «${field}»`);
      if (value.ru && !value.en) languageMismatches.push(`${label}: нет EN для поля «${field}»`);
    }
    const ruN = ingredientCount(ingredients.ru);
    const kkN = ingredientCount(ingredients.kk);
    const enN = ingredientCount(ingredients.en);
    if (ruN && (kkN !== ruN || enN !== ruN)) {
      languageMismatches.push(`${label}: состав различается по числу ингредиентов — RU ${ruN}, KZ ${kkN}, EN ${enN}`);
    }
    const ruLen = description.ru.length;
    const kkLen = description.kk?.length ?? 0;
    if (ruLen > 0 && kkLen > 0 && kkLen < ruLen * 0.6) {
      languageMismatches.push(`${label}: описание KZ заметно короче RU (${kkLen} vs ${ruLen} симв.) — возможно, неполный перевод`);
    }

    const sort = (sortCounters.get(it.category) ?? 0) + 10;
    sortCounters.set(it.category, sort);
    return {
      id: it.id,
      categoryId: it.category,
      name,
      description,
      ingredients,
      price: it.price,
      flags,
      spicyLevel: flags.includes("spicy") ? 2 : 0,
      weight: weight.value,
      cookTime: cook.value,
      images: legacyImages(it),
      allergens: [...allergens].sort(),
      sort,
    };
  });

  const catIds = new Set(categories.map((c) => c.id));
  for (const it of items) if (!catIds.has(it.categoryId)) warnings.push(`${it.id}: категория «${it.categoryId}» не найдена`);
  const ids = items.map((i) => i.id);
  if (new Set(ids).size !== ids.length) warnings.push("Дубликаты id блюд в исходных данных");

  const v = primary.venue as Record<string, LegacyText & string>;
  const hours = parseDailyHours(v.hours);
  if (!hours.parsed) warnings.push("Часы работы не распознаны — выставлено 12:00–02:00");
  const telegram = typeof v.telegram === "string" && /^https:\/\/t\.me\/.+/.test(v.telegram) ? v.telegram : undefined;
  if (!telegram && v.telegram) warnings.push(`Ссылка Telegram «${v.telegram}» пустая — не импортирована`);
  const map2gis = typeof v.map2gis === "string" ? v.map2gis : undefined;

  const waiters = (primary.waiters ?? []).map((w, i) => ({ id: w.id, name: w.name, sort: (i + 1) * 10 }));
  if ((primary.waiters ?? []).some((w) => w.phone)) {
    warnings.push("Личные телефоны официантов НЕ импортированы (по требованиям к ПДн); привяжите Telegram в админке");
  }

  const seed: SeedData = {
    venue: {
      name: String(v.name ?? "UNIPUB"),
      serviceRateBp: Math.round((primary.serviceRate ?? 0.15) * 10000),
      hours: hours.hours,
      contacts: {
        phone: String(v.phone ?? ""),
        phoneDisplay: String(v.phoneDisplay ?? v.phone ?? ""),
        whatsapp: typeof v.whatsapp === "string" ? v.whatsapp : undefined,
        instagram: typeof v.instagram === "string" ? v.instagram : undefined,
        telegram,
        map2gis,
        mapYandex: typeof v.mapYandex === "string" ? v.mapYandex : undefined,
        review2gis: map2gis ? `${map2gis.replace(/\/$/, "")}/tab/reviews` : undefined,
        rating: typeof v.rating === "string" ? v.rating : undefined,
        reviewsCount: typeof v.reviews === "string" ? v.reviews : undefined,
        address: text(v.address),
      },
      content: {
        tagline: text(v.tagline),
        rules: list(primary.rules),
        karaokeRules: DEFAULT_KARAOKE_RULES,
        popularQueries: list(primary.popularQueries),
      },
    },
    categories,
    allergens: ALLERGEN_DIRECTORY,
    items,
    waiters,
  };

  if (secondary) {
    const byId = new Map(secondary.items.map((i) => [i.id, i]));
    for (const a of primary.items) {
      const b = byId.get(a.id);
      if (!b) {
        sourceDiffs.push(`${a.id}: есть в menu-data.js, нет в menu.json`);
        continue;
      }
      for (const key of ["price", "category", "weight", "cookTime", "image", "imageAlt"] as const) {
        if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
          sourceDiffs.push(`${a.id}: ${key} — menu-data.js ${JSON.stringify(a[key])} ≠ menu.json ${JSON.stringify(b[key])}`);
        }
      }
      for (const key of ["name", "desc", "ingredients", "allergens", "flags"] as const) {
        if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) sourceDiffs.push(`${a.id}: поле ${key} отличается между файлами`);
      }
    }
    for (const b of secondary.items) if (!primary.items.some((a) => a.id === b.id)) sourceDiffs.push(`${b.id}: есть только в menu.json`);
  }

  return {
    seed,
    report: {
      counts: {
        categories: categories.length,
        items: items.length,
        waiters: waiters.length,
        allergenLinks: items.reduce((s, i) => s + i.allergens.length, 0),
        priceSum: items.reduce((s, i) => s + i.price, 0),
      },
      warnings,
      languageMismatches,
      sourceDiffs,
    },
  };
}

export function renderReport(report: ImportReport): string {
  const lines = [
    "# Отчёт импорта меню из legacy (Hmeeti/unipub-menu)",
    "",
    "Источник истины: `js/menu-data.js` (его читал живой сайт). `data/menu.json` сверяется как вторичный.",
    "",
    "## Количества",
    "",
    `- Категорий: ${report.counts.categories}`,
    `- Блюд: ${report.counts.items}`,
    `- Официантов: ${report.counts.waiters}`,
    `- Связей блюдо–аллерген: ${report.counts.allergenLinks}`,
    `- Сумма цен (контроль): ${report.counts.priceSum}`,
    "",
    "## Предупреждения",
    "",
    ...(report.warnings.length ? report.warnings.map((w) => `- ${w}`) : ["- нет"]),
    "",
    "## Расхождения между языками",
    "",
    ...(report.languageMismatches.length ? report.languageMismatches.map((w) => `- ${w}`) : ["- нет"]),
    "",
    "## Расхождения menu-data.js ↔ menu.json",
    "",
    ...(report.sourceDiffs.length ? report.sourceDiffs.map((w) => `- ${w}`) : ["- нет"]),
    "",
  ];
  return lines.join("\n");
}
