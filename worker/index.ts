import { closeDb, getDb } from "@/lib/db/client";
import { env } from "@/lib/env";
import { getKv } from "@/lib/kv/kv";
import { log } from "@/lib/log";
import { botSender, runWorkerLoop } from "@/lib/outbox/worker";
import { getBot } from "@/lib/telegram/bot";

/** WORKER_MODE=external (production): delivers the outbox to Telegram from its own container. */
async function main() {
  env();
  const controller = new AbortController();
  await runWorkerLoop({
    signal: controller.signal,
    getDeps: async () => {
      const db = await getDb();
      const kv = await getKv();
      return { db, kv, sender: botSender(getBot(async () => ({ db, kv }))) };
    },
  });
  log.info("outbox worker started");

  const stop = async (signal: string) => {
    log.info({ signal }, "outbox worker stopping");
    controller.abort();
    await closeDb();
    process.exit(0);
  };
  process.once("SIGTERM", () => void stop("SIGTERM"));
  process.once("SIGINT", () => void stop("SIGINT"));
}

main().catch((err) => {
  log.fatal({ err }, "outbox worker crashed");
  process.exit(1);
});
