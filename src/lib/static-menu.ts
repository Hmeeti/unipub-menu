import { readFileSync } from "node:fs";
import path from "node:path";
import type { PublicMenu } from "@/lib/domain/types";
import { BASE_PATH } from "@/lib/site";

export { PAGES_ORIGIN } from "@/lib/site";

export const STATIC_ASSETS = {
  icon: `${BASE_PATH}/assets/favicon.svg`,
  logo: `${BASE_PATH}/image/logo_unipab.JPG`,
  manifest: `${BASE_PATH}/manifest.webmanifest`,
};

let cached: PublicMenu | undefined;

/** Written by `scripts/menu-snapshot.ts` right before `next build` of the static target. */
export function staticMenu(): PublicMenu {
  cached ??= JSON.parse(
    readFileSync(path.join(process.cwd(), ".menu-snapshot.json"), "utf8"),
  ) as PublicMenu;
  return cached;
}
