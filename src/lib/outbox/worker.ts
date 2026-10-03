import { log } from "@/lib/log";

const g = globalThis as unknown as { __unipubWorker?: NodeJS.Timeout };

/** Phase 0 placeholder: the outbox processor is implemented together with orders (phase 2). */
export function startInlineWorker() {
  if (g.__unipubWorker) return;
  g.__unipubWorker = setInterval(() => {}, 60_000);
  g.__unipubWorker.unref();
  log.info("inline worker started");
}
