/**
 * Registers the Telegram webhook with the secret token (Telegram sends it back in
 * X-Telegram-Bot-Api-Secret-Token on every update).
 *   npm run telegram:webhook          → set
 *   npm run telegram:webhook -- info  → show current state
 *   npm run telegram:webhook -- delete
 */
import { Api } from "grammy";
import { env } from "@/lib/env";

async function main() {
  const e = env();
  if (!e.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const api = new Api(
    e.TELEGRAM_BOT_TOKEN,
    e.TELEGRAM_API_ROOT ? { apiRoot: e.TELEGRAM_API_ROOT } : {},
  );
  const action = process.argv[2] ?? "set";

  if (action === "info") {
    const info = await api.getWebhookInfo();
    console.log(JSON.stringify({ ...info, url: info.url || "(none)" }, null, 2));
    return;
  }
  if (action === "delete") {
    await api.deleteWebhook({ drop_pending_updates: false });
    console.log("webhook deleted");
    return;
  }
  if (!e.TELEGRAM_WEBHOOK_SECRET || !/^[A-Za-z0-9_-]{16,256}$/.test(e.TELEGRAM_WEBHOOK_SECRET)) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET must be 16–256 chars of A-Z a-z 0-9 _ -");
  }
  const url = new URL("/api/telegram/webhook", e.APP_URL);
  if (url.protocol !== "https:") throw new Error(`APP_URL must be https for webhooks (got ${url})`);
  await api.setWebhook(url.toString(), {
    secret_token: e.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  const me = await api.getMe();
  console.log(`webhook set for @${me.username} → ${url}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
