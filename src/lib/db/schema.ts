import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  I18nText,
  ImageAsset,
  Schedule,
  VenueContacts,
  VenueContent,
  VenueFeatures,
  VenueAnalytics,
  WeeklyHours,
  OrderLine,
  MenuSnapshot,
} from "@/lib/domain/types";
import type { SplitPart } from "@/lib/domain/split";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const venue = pgTable("venue", {
  id: smallint("id").primaryKey().default(1),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("Asia/Almaty"),
  serviceRateBp: integer("service_rate_bp").notNull().default(1500),
  hours: jsonb("hours").$type<WeeklyHours>().notNull(),
  contacts: jsonb("contacts").$type<VenueContacts>().notNull(),
  content: jsonb("content").$type<VenueContent>().notNull(),
  features: jsonb("features").$type<VenueFeatures>().notNull(),
  analytics: jsonb("analytics").$type<VenueAnalytics>().notNull().default({}),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  icon: text("icon").notNull().default("utensils"),
  sort: integer("sort").notNull().default(0),
  title: jsonb("title").$type<I18nText>().notNull(),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const allergens = pgTable("allergens", {
  id: text("id").primaryKey(),
  title: jsonb("title").$type<I18nText>().notNull(),
  icon: text("icon").notNull().default("alert"),
  sort: integer("sort").notNull().default(0),
});

export const items = pgTable(
  "items",
  {
    id: text("id").primaryKey(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onUpdate: "cascade" }),
    name: jsonb("name").$type<I18nText>().notNull(),
    description: jsonb("description").$type<I18nText>().notNull().default({ ru: "" }),
    ingredients: jsonb("ingredients").$type<I18nText>().notNull().default({ ru: "" }),
    price: integer("price").notNull(),
    salePrice: integer("sale_price"),
    saleSchedule: jsonb("sale_schedule").$type<Schedule | null>(),
    soldOut: boolean("sold_out").notNull().default(false),
    flags: text("flags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    spicyLevel: smallint("spicy_level").notNull().default(0),
    weight: jsonb("weight").$type<I18nText | null>(),
    cookTime: jsonb("cook_time").$type<I18nText | null>(),
    images: jsonb("images").$type<ImageAsset[]>().notNull().default([]),
    pairWith: text("pair_with")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    sort: integer("sort").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("items_category_sort_idx").on(t.categoryId, t.sort)],
);

export const itemAllergens = pgTable(
  "item_allergens",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade", onUpdate: "cascade" }),
    allergenId: text("allergen_id")
      .notNull()
      .references(() => allergens.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.allergenId] })],
);

export const rooms = pgTable("rooms", {
  id: text("id").primaryKey(),
  name: jsonb("name").$type<I18nText>().notNull(),
  description: jsonb("description").$type<I18nText>().notNull().default({ ru: "" }),
  capacity: integer("capacity"),
  sort: integer("sort").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const tables = pgTable("tables", {
  code: text("code").primaryKey(),
  roomId: text("room_id").references(() => rooms.id, { onDelete: "set null" }),
  label: text("label"),
  tokenVersion: integer("token_version").notNull().default(1),
  sort: integer("sort").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const waiters = pgTable("waiters", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  telegramUserId: bigint("telegram_user_id", { mode: "number" }).unique(),
  sort: integer("sort").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const promotions = pgTable("promotions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  kind: text("kind").$type<"banner" | "dish_of_day">().notNull().default("banner"),
  title: jsonb("title").$type<I18nText>().notNull(),
  body: jsonb("body").$type<I18nText>().notNull().default({ ru: "" }),
  itemId: text("item_id").references(() => items.id, { onDelete: "set null" }),
  image: jsonb("image").$type<ImageAsset | null>(),
  link: text("link"),
  schedule: jsonb("schedule").$type<Schedule>().notNull(),
  sort: integer("sort").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const menuVersions = pgTable("menu_versions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  snapshot: jsonb("snapshot").$type<MenuSnapshot>().notNull(),
  note: text("note"),
  restoredFrom: integer("restored_from"),
  createdBy: integer("created_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const orderCounters = pgTable("order_counters", {
  businessDay: date("business_day").primaryKey(),
  last: integer("last").notNull().default(0),
});

export type OrderStatus = "queued" | "sent" | "accepted" | "failed";

export const orders = pgTable(
  "orders",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    publicId: text("public_id").notNull().unique(),
    businessDay: date("business_day").notNull(),
    dayNumber: integer("day_number").notNull(),
    tableCode: text("table_code").notNull(),
    tableVerified: boolean("table_verified").notNull(),
    waiterId: text("waiter_id"),
    waiterName: text("waiter_name").notNull(),
    locale: text("locale").notNull(),
    lines: jsonb("lines").$type<OrderLine[]>().notNull(),
    subtotal: integer("subtotal").notNull(),
    service: integer("service").notNull(),
    total: integer("total").notNull(),
    serviceRateBp: integer("service_rate_bp").notNull(),
    comment: text("comment"),
    /** per-person totals recomputed on the server; null when the bill is not split */
    split: jsonb("split").$type<SplitPart[] | null>(),
    status: text("status").$type<OrderStatus>().notNull().default("queued"),
    acceptedBy: text("accepted_by"),
    acceptedByTg: bigint("accepted_by_tg", { mode: "number" }),
    unavailableItemIds: text("unavailable_item_ids")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    telegramMessageId: bigint("telegram_message_id", { mode: "number" }),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    ipHash: text("ip_hash"),
    sessionHash: text("session_hash"),
    createdAt: ts("created_at").notNull().defaultNow(),
    sentAt: ts("sent_at"),
    acceptedAt: ts("accepted_at"),
    remindedAt: ts("reminded_at"),
  },
  (t) => [
    uniqueIndex("orders_day_number_uq").on(t.businessDay, t.dayNumber),
    index("orders_created_idx").on(t.createdAt),
    index("orders_table_idx").on(t.tableCode),
  ],
);

export type RequestType = "waiter" | "bill" | "song" | "booking";

export const guestRequests = pgTable(
  "requests",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    publicId: text("public_id").notNull().unique(),
    type: text("type").$type<RequestType>().notNull(),
    tableCode: text("table_code"),
    tableVerified: boolean("table_verified").notNull().default(false),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").$type<OrderStatus>().notNull().default("queued"),
    acceptedBy: text("accepted_by"),
    telegramMessageId: bigint("telegram_message_id", { mode: "number" }),
    ipHash: text("ip_hash"),
    createdAt: ts("created_at").notNull().defaultNow(),
    sentAt: ts("sent_at"),
    acceptedAt: ts("accepted_at"),
  },
  (t) => [index("requests_created_idx").on(t.createdAt)],
);

export type OutboxStatus = "pending" | "processing" | "sent" | "dead";

export const outbox = pgTable(
  "outbox",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    kind: text("kind").notNull(),
    refId: bigint("ref_id", { mode: "number" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").$type<OutboxStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    lockedUntil: ts("locked_until"),
    lastError: text("last_error"),
    createdAt: ts("created_at").notNull().defaultNow(),
    sentAt: ts("sent_at"),
  },
  (t) => [index("outbox_due_idx").on(t.status, t.nextAttemptAt)],
);

export const translations = pgTable(
  "translations",
  {
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    field: text("field").notNull(),
    lang: text("lang").notNull(),
    sourceHash: text("source_hash").notNull(),
    text: text("text").notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.entityType, t.entityId, t.field, t.lang] }),
    index("translations_lang_idx").on(t.lang),
  ],
);

export type AdminRole = "owner" | "manager" | "waiter";

export const adminUsers = pgTable("admin_users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  login: text("login").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<AdminRole>().notNull().default("manager"),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  telegramUserId: bigint("telegram_user_id", { mode: "number" }).unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
  lastLoginAt: ts("last_login_at"),
});

export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    csrfSecret: text("csrf_secret").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
  },
  (t) => [index("admin_sessions_user_idx").on(t.userId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id"),
    userLogin: text("user_login"),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    ipHash: text("ip_hash"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)],
);
