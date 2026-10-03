export type CspOptions = {
  nonce: string;
  dev: boolean;
  /** extra origins for images (object storage CDN) */
  imageOrigins?: string[];
  /** analytics collector origins (script + beacon) */
  analyticsOrigins?: string[];
  turnstile?: boolean;
};

const TURNSTILE = "https://challenges.cloudflare.com";

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

export function cspOrigins(urls: Array<string | undefined>): string[] {
  return [...new Set(urls.map(originOf).filter((o): o is string => Boolean(o)))];
}

export function buildCsp(o: CspOptions): string {
  const img = [
    "'self'",
    "data:",
    "blob:",
    "https://images.unsplash.com",
    ...(o.imageOrigins ?? []),
  ];
  const connect = ["'self'", ...(o.analyticsOrigins ?? [])];
  if (o.turnstile) connect.push(TURNSTILE);
  if (o.dev) connect.push("ws:");
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${o.nonce}'`,
      "'strict-dynamic'",
      ...(o.dev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", `'nonce-${o.nonce}'`],
    // React and Radix set positional `style` attributes; scripts stay nonce-only.
    "style-src-attr": ["'unsafe-inline'"],
    "img-src": img,
    "font-src": ["'self'"],
    "connect-src": connect,
    "frame-src": o.turnstile ? [TURNSTILE] : ["'none'"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "media-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!o.dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
