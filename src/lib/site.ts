/**
 * The guest menu is built in two shapes:
 * - server (default): Next server on the backend domain, API on the same origin;
 * - static export for GitHub Pages: everything lives under `/unipub-menu/`, the API is on
 *   `NEXT_PUBLIC_API_URL` (empty = no backend: ordering falls back to "call the waiter").
 * All values are inlined at build time.
 */
export const STATIC_EXPORT = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";
/** Origin of the static build; the backend lets it (and only it) call the guest API cross-origin. */
export const PAGES_ORIGIN = "https://hmeeti.github.io";
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const API_BASE = STATIC_EXPORT
  ? (process.env.NEXT_PUBLIC_API_URL ?? "").trim().replace(/\/+$/, "")
  : "";

/** False only on a static build without a backend URL. */
export const BACKEND_AVAILABLE = !STATIC_EXPORT || API_BASE !== "";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/** Link to a page of this site for plain `<a>` (Next `<Link>` adds the base path by itself). */
export function sitePath(path: string): string {
  const full = `${BASE_PATH}${path}`;
  return STATIC_EXPORT && !full.endsWith("/") ? `${full}/` : full;
}
