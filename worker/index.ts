/** Separate worker process (production): outbox delivery to Telegram + periodic jobs. */
import { closeDb, getDb } from "@/lib/db/client";
import { log } from "@/lib/log";
import { startInlineWorker } from "@/lib/outbox/worker";

async function main() {
  await getDb();
  startInlineWorker();
  log.info("worker started");
  const stop = async (signal: string) => {
    log.info({ signal }, "worker stopping");
    await closeDb();
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));
  setInterval(() => {}, 1 << 30);
}

main().catch((err) => {
  log.fatal({ err }, "worker crashed");
  process.exit(1);
});
