import { json } from "@/lib/http/request";
import { log } from "@/lib/log";
import { getPublicMenu } from "@/lib/menu/public";

/**
 * Tiny poll target for open pages: stop-list changes apply without a reload, a new published
 * version tells the client to refresh. Served from the tagged menu cache, so it is cheap.
 */
export async function GET() {
  try {
    const menu = await getPublicMenu();
    if (!menu) return json({ ok: false, error: "not_found" }, { status: 404 });
    return json({ ok: true, version: menu.version, soldOut: menu.soldOut });
  } catch (err) {
    log.error({ err }, "menu live state failed");
    return json({ ok: false, error: "server" }, { status: 500 });
  }
}
