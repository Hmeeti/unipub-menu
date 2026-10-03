import { PAGES_ORIGIN } from "@/lib/site";

/** Guest endpoints the static menu calls; bot webhook, test hooks and the admin stay same-origin. */
const GUEST_API = /^\/api\/(orders|requests|menu\/live)(\/|$)/;

/**
 * CORS headers for a guest API request from the static menu, or null when none apply.
 * No credentials: the static menu never sends cookies to the backend.
 */
export function guestCorsHeaders(pathname: string, origin: string | null): Headers | null {
  if (origin !== PAGES_ORIGIN || !GUEST_API.test(pathname)) return null;
  return new Headers({
    "access-control-allow-origin": PAGES_ORIGIN,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, idempotency-key",
    "access-control-max-age": "600",
    vary: "Origin",
  });
}
