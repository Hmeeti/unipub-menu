import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";
import { env } from "@/lib/env";
import { guestCorsHeaders } from "@/lib/http/cors";
import { buildCsp, createNonce, cspOrigins } from "@/lib/security/csp";

const intl = createMiddleware(routing);

function cspFor(nonce: string): string {
  const e = env();
  const analytics =
    e.ANALYTICS_PROVIDER === "goatcounter"
      ? cspOrigins([e.GOATCOUNTER_ENDPOINT, "https://gc.zgo.at"])
      : e.ANALYTICS_PROVIDER === "plausible"
        ? cspOrigins([e.PLAUSIBLE_SCRIPT ?? "https://plausible.io/js/script.js"])
        : [];
  return buildCsp({
    nonce,
    dev: e.NODE_ENV === "development",
    imageOrigins: cspOrigins([e.S3_PUBLIC_URL]),
    analyticsOrigins: analytics,
    turnstile: Boolean(e.TURNSTILE_SITE_KEY),
  });
}

function api(request: NextRequest) {
  const cors = guestCorsHeaders(request.nextUrl.pathname, request.headers.get("origin"));
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: cors ? 204 : 403, headers: cors ?? undefined });
  }
  const response = NextResponse.next();
  cors?.forEach((value, key) => response.headers.set(key, value));
  if (!cors) response.headers.set("vary", "Origin");
  return response;
}

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) return api(request);
  const nonce = createNonce();
  const csp = cspFor(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  const isAdmin =
    request.nextUrl.pathname === "/admin" || request.nextUrl.pathname.startsWith("/admin/");
  const response = isAdmin
    ? NextResponse.next({ request: { headers } })
    : intl(new NextRequest(request, { headers }));

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|serwist|~offline|.*\\..*).*)", "/api/:path*"],
};
