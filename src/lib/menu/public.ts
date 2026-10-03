import "server-only";
import { unstable_cache } from "next/cache";
import { getDb } from "@/lib/db/client";
import type { PublicMenu } from "@/lib/domain/types";
import { composePublicMenu } from "./repository";

export const MENU_TAG = "menu";

/**
 * Published snapshot + live state (stop-list, promos, staff). Pages are dynamic because of the
 * CSP nonce, so caching happens here; admin actions call `revalidateTag(MENU_TAG, { expire: 0 })`.
 */
export const getPublicMenu = unstable_cache(
  async (): Promise<PublicMenu | null> => composePublicMenu(await getDb()),
  ["public-menu-v1"],
  { tags: [MENU_TAG], revalidate: 300 },
);
