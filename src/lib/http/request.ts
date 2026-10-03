import { createHmac, randomBytes } from "node:crypto";
import { allowedOrigins, env } from "@/lib/env";
import { PAGES_ORIGIN } from "@/lib/site";

/**
 * Client IP as seen by the last trusted proxy. Caddy (behind Cloudflare) sets X-Real-IP to its
 * {client_ip}, i.e. CF-Connecting-IP from Cloudflare ranges only; without trusted proxies
 * everyone shares one key.
 */
export function clientIp(headers: Headers): string {
  const hops = env().TRUST_PROXY_HOPS;
  if (hops > 0) {
    const real = headers.get("x-real-ip")?.trim();
    if (real) return real;
    const chain = (headers.get("x-forwarded-for") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (chain.length) return chain[Math.max(0, chain.length - hops)]!;
  }
  return "direct";
}

/** Stable pseudonymous id: raw IPs and session ids never reach the database or Redis keys. */
export function hashId(kind: string, value: string): string {
  return createHmac("sha256", env().APP_SECRET!)
    .update(`${kind}:${value}`)
    .digest("base64url")
    .slice(0, 22);
}

/**
 * Guest API: exact origin match (no patterns); browsers always send Origin on cross-site and POST
 * fetches. The static menu on GitHub Pages is the only foreign origin (CORS in `proxy.ts`).
 */
export function isAllowedOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (!origin) return false;
  return origin === PAGES_ORIGIN || allowedOrigins().includes(origin);
}

export const SESSION_COOKIE = "unipub_sid";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export function readSession(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) {
      const value = v.join("=");
      return /^[A-Za-z0-9_-]{22,64}$/.test(value) ? value : null;
    }
  }
  return null;
}

export function newSessionId(): string {
  return randomBytes(18).toString("base64url");
}

export function sessionCookie(id: string): string {
  const secure = env().APP_URL.startsWith("https://") ? "; Secure" : "";
  return `${SESSION_COOKIE}=${id}; Path=/api; Max-Age=${SESSION_MAX_AGE}; HttpOnly; SameSite=Lax${secure}`;
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { ...init, headers });
}

/** Reads a JSON body with a hard size cap; returns undefined on anything malformed. */
export async function readJson(req: Request, maxBytes = 16_384): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) return undefined;
  try {
    const text = await req.text();
    if (text.length > maxBytes) return undefined;
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
