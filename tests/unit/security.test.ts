import { describe, expect, it } from "vitest";
import { MemoryKv } from "@/lib/kv/kv";
import { checkLimits, ORDER_LIMITS } from "@/lib/security/rate-limit";
import { createTableToken, normalizeTableCode, verifyTableToken } from "@/lib/security/table-token";
import { base32Decode, base32Encode, hotp, totp, verifyTotp } from "@/lib/security/totp";

const SECRET = "x".repeat(40);

describe("table tokens", () => {
  it("round-trips and normalizes codes", () => {
    const token = createTableToken(SECRET, "vip1", 1);
    expect(token.startsWith("VIP1.1.")).toBe(true);
    expect(verifyTableToken(SECRET, token)).toEqual({ code: "VIP1", version: 1 });
  });
  it("rejects tampering: other table, other version, other secret", () => {
    const token = createTableToken(SECRET, "12", 3);
    const [, , sig] = token.split(".");
    expect(verifyTableToken(SECRET, `13.3.${sig}`)).toBeNull();
    expect(verifyTableToken(SECRET, `12.4.${sig}`)).toBeNull();
    expect(verifyTableToken("y".repeat(40), token)).toBeNull();
    expect(verifyTableToken(SECRET, "12")).toBeNull();
    expect(verifyTableToken(SECRET, `12.3.${sig}x`)).toBeNull();
    expect(verifyTableToken(SECRET, null)).toBeNull();
    expect(verifyTableToken(SECRET, "a".repeat(100))).toBeNull();
  });
  it("only accepts 1–8 latin letters/digits", () => {
    expect(normalizeTableCode(" v2 ")).toBe("V2");
    expect(normalizeTableCode("VIP12345")).toBe("VIP12345");
    expect(normalizeTableCode("VIP123456")).toBeNull();
    expect(normalizeTableCode("стол1")).toBeNull();
    expect(normalizeTableCode("1;drop")).toBeNull();
    expect(normalizeTableCode("")).toBeNull();
    expect(() => createTableToken(SECRET, "bad code", 1)).toThrow();
  });
});

describe("rate limiter", () => {
  it("allows up to the limit then blocks with a retry hint, and resets after the window", async () => {
    let now = 1_000_000;
    const kv = new MemoryKv(() => now);
    const rules = [{ name: "t", key: "k", limit: 3, windowMs: 60_000 }];
    for (let i = 0; i < 3; i += 1) expect((await checkLimits(kv, rules)).ok).toBe(true);
    const blocked = await checkLimits(kv, rules);
    expect(blocked).toMatchObject({ ok: false, rule: "t" });
    if (!blocked.ok) expect(blocked.retryAfterMs).toBeLessThanOrEqual(60_000);
    now += 60_001;
    expect((await checkLimits(kv, rules)).ok).toBe(true);
  });

  it("limits a table even when sessions rotate, but keeps the shared IP soft", async () => {
    const kv = new MemoryKv();
    let lastFail: string | null = null;
    for (let i = 0; i < 9; i += 1) {
      const r = await checkLimits(
        kv,
        ORDER_LIMITS.verified({ table: "12", session: `s${i}`, ip: "bar-wifi" }),
      );
      if (!r.ok) lastFail = r.rule;
    }
    expect(lastFail).toBe("table");
    // other tables on the same Wi-Fi are unaffected
    const other = await checkLimits(
      kv,
      ORDER_LIMITS.verified({ table: "5", session: "z", ip: "bar-wifi" }),
    );
    expect(other.ok).toBe(true);
  });

  it("is stricter for orders without a QR token", async () => {
    const kv = new MemoryKv();
    const ids = { table: "7", session: "s", ip: "ip" };
    expect((await checkLimits(kv, ORDER_LIMITS.unverified(ids))).ok).toBe(true);
    expect((await checkLimits(kv, ORDER_LIMITS.unverified(ids))).ok).toBe(true);
    const third = await checkLimits(kv, ORDER_LIMITS.unverified(ids));
    expect(third).toMatchObject({ ok: false, rule: "session" });
  });

  it("setNx is exclusive until expiry", async () => {
    let now = 0;
    const kv = new MemoryKv(() => now);
    expect(await kv.setNx("idem", "1", 1000)).toBe(true);
    expect(await kv.setNx("idem", "2", 1000)).toBe(false);
    now = 1001;
    expect(await kv.setNx("idem", "3", 1000)).toBe(true);
  });
});

describe("TOTP (RFC 6238 / RFC 4226 vectors)", () => {
  const rfcSecret = Buffer.from("12345678901234567890");
  it("matches RFC 4226 HOTP values", () => {
    expect(hotp(rfcSecret, 0)).toBe("755224");
    expect(hotp(rfcSecret, 1)).toBe("287082");
    expect(hotp(rfcSecret, 9)).toBe("520489");
  });
  it("matches RFC 6238 SHA-1 values (6 digits)", () => {
    const b32 = base32Encode(rfcSecret);
    expect(totp(b32, 59_000)).toBe("287082");
    expect(totp(b32, 1_111_111_109_000)).toBe("081804");
    expect(totp(b32, 1_234_567_890_000)).toBe("005924");
  });
  it("verifies with ±1 step drift and rejects garbage", () => {
    const b32 = base32Encode(rfcSecret);
    const t = 1_234_567_890_000;
    expect(verifyTotp(b32, totp(b32, t - 30_000), t)).toBe(true);
    expect(verifyTotp(b32, totp(b32, t - 90_000), t)).toBe(false);
    expect(verifyTotp(b32, "abc", t)).toBe(false);
  });
  it("base32 round-trips", () => {
    const buf = Buffer.from("hello world!");
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });
});
