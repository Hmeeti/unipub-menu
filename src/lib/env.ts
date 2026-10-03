import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_ENV: z.enum(["local", "staging", "production", "test"]).default("local"),
  APP_URL: z.url().default("http://localhost:3000"),
  ALLOWED_ORIGINS: optionalString,
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  DATABASE_URL: optionalString,
  PGLITE_DIR: z.string().default(".data/pglite"),
  REDIS_URL: optionalString,
  AUTO_MIGRATE: bool,
  DEPLOYMENT_VERSION: optionalString,

  APP_SECRET: z.string().min(32).optional(),
  TABLE_TOKEN_SECRET: z.string().min(32).optional(),
  DATA_ENCRYPTION_KEY: optionalString,

  TELEGRAM_BOT_TOKEN: optionalString,
  TELEGRAM_CHAT_ID: optionalString,
  TELEGRAM_WEBHOOK_SECRET: optionalString,
  TELEGRAM_API_ROOT: optionalString,

  WORKER_MODE: z.enum(["inline", "external"]).default("inline"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
  /** Caddy sets X-Real-IP; platforms like Render only append to X-Forwarded-For. */
  CLIENT_IP_HEADER: z.enum(["x-real-ip", "x-forwarded-for"]).default("x-real-ip"),

  S3_ENDPOINT: optionalString,
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  S3_PUBLIC_URL: optionalString,
  S3_FORCE_PATH_STYLE: bool,

  TRANSLATE_PROVIDER: z.enum(["none", "deepl", "google"]).default("none"),
  DEEPL_API_KEY: optionalString,
  DEEPL_API_URL: z.url().default("https://api-free.deepl.com"),
  GOOGLE_TRANSLATE_API_KEY: optionalString,

  TURNSTILE_SITE_KEY: optionalString,
  TURNSTILE_SECRET_KEY: optionalString,

  ANALYTICS_PROVIDER: z.enum(["none", "goatcounter", "plausible"]).default("none"),
  GOATCOUNTER_ENDPOINT: optionalString,
  PLAUSIBLE_DOMAIN: optionalString,
  PLAUSIBLE_SCRIPT: optionalString,

  FEATURE_BOOKING: z.enum(["on", "off"]).default("on"),
  FEATURE_SONGS: z.enum(["on", "off"]).default("on"),
  FEATURE_PROMOS: z.enum(["on", "off"]).default("on"),

  E2E_TEST_HOOKS: bool,

  // Hosts without a shell (Render Free): first-run setup happens on server start.
  SEED_IF_EMPTY: bool,
  ADMIN_LOGIN: optionalString,
  ADMIN_PASSWORD: optionalString,
  TELEGRAM_AUTO_WEBHOOK: bool,
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

const DEV_SECRET = "dev-only-secret-change-me-dev-only-secret-change-me";

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse({
    ...process.env,
    // Render sets RENDER_EXTERNAL_URL (https://<service>.onrender.com) for every web service.
    APP_URL: process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || undefined,
  });
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`);
  }
  const value = parsed.data;
  const isProdLike = value.APP_ENV === "production" || value.APP_ENV === "staging";
  if (isProdLike) {
    const missing = (
      [
        "APP_SECRET",
        "TABLE_TOKEN_SECRET",
        "DATABASE_URL",
        "REDIS_URL",
        "DATA_ENCRYPTION_KEY",
      ] as const
    ).filter((k) => !value[k]);
    if (missing.length)
      throw new Error(`Missing required env in ${value.APP_ENV}: ${missing.join(", ")}`);
  }
  if (value.E2E_TEST_HOOKS && value.APP_ENV === "production") {
    throw new Error("E2E_TEST_HOOKS must never be enabled in production");
  }
  cached = {
    ...value,
    // Telegram accepts only A-Z a-z 0-9 _ -; generated base64 secrets are mapped to base64url.
    TELEGRAM_WEBHOOK_SECRET: value.TELEGRAM_WEBHOOK_SECRET?.replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, ""),
    APP_SECRET: value.APP_SECRET ?? DEV_SECRET,
    TABLE_TOKEN_SECRET: value.TABLE_TOKEN_SECRET ?? value.APP_SECRET ?? DEV_SECRET,
  };
  return cached;
}

export function allowedOrigins(): string[] {
  const e = env();
  const list = [new URL(e.APP_URL).origin];
  for (const raw of (e.ALLOWED_ORIGINS ?? "").split(",")) {
    const v = raw.trim();
    if (!v) continue;
    try {
      list.push(new URL(v).origin);
    } catch {
      /* ignore malformed */
    }
  }
  return [...new Set(list)];
}

export function telegramConfigured(): boolean {
  const e = env();
  return Boolean(e.TELEGRAM_BOT_TOKEN && e.TELEGRAM_CHAT_ID);
}

/** Test-only: reset memoized env between test cases. */
export function __resetEnvForTests() {
  cached = null;
}
