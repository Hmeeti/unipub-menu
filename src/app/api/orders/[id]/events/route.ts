import { getDb } from "@/lib/db/client";
import { json } from "@/lib/http/request";
import { getKv } from "@/lib/kv/kv";
import { log } from "@/lib/log";
import { findByPublicId, orderChannel, toStatusView } from "@/lib/orders/service";
import { PUBLIC_ID_RE } from "@/lib/orders/types";

const PING_MS = 20_000;
const MAX_STREAM_MS = 30 * 60_000;

/** Server-Sent Events: current status immediately, then every change published by the bot/worker. */
export async function GET(req: Request, ctx: RouteContext<"/api/orders/[id]/events">) {
  const { id } = await ctx.params;
  if (!PUBLIC_ID_RE.test(id)) return json({ ok: false, error: "not_found" }, { status: 404 });
  let db, kv, order;
  try {
    db = await getDb();
    kv = await getKv();
    order = await findByPublicId(db, id);
  } catch (err) {
    log.error({ err }, "order events failed");
    return json({ ok: false, error: "server" }, { status: 500 });
  }
  if (!order) return json({ ok: false, error: "not_found" }, { status: 404 });

  const encoder = new TextEncoder();
  let close: () => Promise<void> = async () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          void close();
        }
      };
      const unsubscribe = await kv.subscribe(orderChannel(id), (message) =>
        write(`event: status\ndata: ${message}\n\n`),
      );
      const ping = setInterval(() => write(": ping\n\n"), PING_MS);
      const limit = setTimeout(() => void close(), MAX_STREAM_MS);
      close = async () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        clearTimeout(limit);
        await unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed by the client */
        }
      };
      req.signal.addEventListener("abort", () => void close());
      write("retry: 3000\n\n");
      write(`event: status\ndata: ${JSON.stringify(await toStatusView(db, order))}\n\n`);
    },
    cancel() {
      void close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
