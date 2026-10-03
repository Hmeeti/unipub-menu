import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const VERSION = "v1";

/** 32-byte key: DATA_ENCRYPTION_KEY as base64 when it decodes to 32 bytes, otherwise sha256 of it. */
function key(): Buffer {
  const e = env();
  const raw = e.DATA_ENCRYPTION_KEY ?? `dev:${e.APP_SECRET}`;
  const decoded = Buffer.from(raw, "base64");
  return decoded.length === 32 ? decoded : createHash("sha256").update(raw).digest();
}

/** AES-256-GCM: `v1.<iv>.<tag>.<ciphertext>` (base64url). */
export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, data]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function unseal(sealed: string): string | null {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== VERSION || !iv || !tag || data === undefined) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
