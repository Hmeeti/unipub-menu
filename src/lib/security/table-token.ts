import { createHmac, timingSafeEqual } from "node:crypto";
import { TABLE_CODE_RE, normalizeTableCode } from "@/lib/domain/limits";

export { TABLE_CODE_RE, normalizeTableCode };

function sign(secret: string, code: string, version: number) {
  return createHmac("sha256", secret)
    .update(`table:${code}:${version}`)
    .digest("base64url")
    .slice(0, 22);
}

export function createTableToken(secret: string, code: string, version: number): string {
  const c = normalizeTableCode(code);
  if (!c) throw new Error("invalid table code");
  if (!Number.isInteger(version) || version < 1) throw new Error("invalid token version");
  return `${c}.${version}.${sign(secret, c, version)}`;
}

export type ParsedTableToken = { code: string; version: number };

/** Signature check only; the caller must still confirm the table exists and the version matches. */
export function verifyTableToken(secret: string, token: unknown): ParsedTableToken | null {
  if (typeof token !== "string" || token.length > 64) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [rawCode, rawVersion, sig] = parts as [string, string, string];
  const code = normalizeTableCode(rawCode);
  const version = Number(rawVersion);
  if (!code || code !== rawCode || !Number.isInteger(version) || version < 1) return null;
  const expected = Buffer.from(sign(secret, code, version));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { code, version };
}
