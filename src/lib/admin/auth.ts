import { randomBytes } from "node:crypto";
import { and, eq, lt, ne, or } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { adminSessions, adminUsers, type AdminRole } from "@/lib/db/schema";
import type { Kv } from "@/lib/kv/kv";
import { checkLimits, LOGIN_LIMITS, peekCount } from "@/lib/security/rate-limit";
import {
  burnPasswordCheck,
  hashPassword,
  MIN_PASSWORD_LENGTH,
  verifyPassword,
} from "@/lib/security/password";
import { seal, sha256, unseal } from "@/lib/security/crypto";
import { generateTotpSecret, verifyTotp } from "@/lib/security/totp";

export { hasRole, ROLE_LABEL, ROLE_RANK } from "./roles";

/** Absolute lifetime and idle timeout of an admin session. */
export const SESSION_TTL_MS = 12 * 60 * 60_000;
export const SESSION_IDLE_MS = 2 * 60 * 60_000;
const TOUCH_EVERY_MS = 5 * 60_000;

export type AdminUser = {
  id: number;
  login: string;
  name: string;
  role: AdminRole;
  totpEnabled: boolean;
  telegramUserId: number | null;
};

export type AdminSession = { sessionId: string; user: AdminUser };

export type LoginError = "invalid" | "totp_required" | "totp_invalid" | "rate_limited";
export type LoginResult =
  | { ok: true; token: string; user: AdminUser }
  | { ok: false; error: LoginError; retryAfterSec?: number };

type Deps = { db: Db; kv: Kv; now: Date };

const toUser = (u: typeof adminUsers.$inferSelect): AdminUser => ({
  id: u.id,
  login: u.login,
  name: u.name,
  role: u.role,
  totpEnabled: u.totpEnabled,
  telegramUserId: u.telegramUserId,
});

export const normalizeLogin = (login: string) => login.trim().toLowerCase();

/**
 * Password (+ TOTP when enabled). Only failures count towards the limit, so a manager who logs in
 * often is never locked out; the limit is per login and (looser) per IP, 15 minutes.
 */
export async function login(
  deps: Deps,
  input: { login: string; password: string; totp?: string; ipHash: string; userAgent?: string },
): Promise<LoginResult> {
  const loginKey = normalizeLogin(input.login).slice(0, 64);
  const rules = LOGIN_LIMITS({ login: loginKey, ip: input.ipHash });
  for (const r of rules) {
    if ((await peekCount(deps.kv, r.key)) >= r.limit) {
      return { ok: false, error: "rate_limited", retryAfterSec: Math.ceil(r.windowMs / 1000) };
    }
  }
  const fail = async (error: LoginError): Promise<LoginResult> => {
    await checkLimits(deps.kv, rules);
    return { ok: false, error };
  };

  const [user] = await deps.db.select().from(adminUsers).where(eq(adminUsers.login, loginKey));
  if (!user || !user.isActive) {
    await burnPasswordCheck(input.password);
    return fail("invalid");
  }
  if (!(await verifyPassword(user.passwordHash, input.password))) return fail("invalid");

  if (user.totpEnabled) {
    if (!input.totp) return { ok: false, error: "totp_required" };
    const secret = user.totpSecret ? unseal(user.totpSecret) : null;
    const code = input.totp.replace(/\s+/g, "");
    if (!secret || !verifyTotp(secret, code, deps.now.getTime())) return fail("totp_invalid");
    // a code is valid for ~90 s; never accept the same one twice
    if (!(await deps.kv.setNx(`totp:used:${user.id}:${code}`, "1", 120_000)))
      return fail("totp_invalid");
  }

  await deps.kv.del(`rl:${rules[0]!.key}`);
  const token = randomBytes(32).toString("base64url");
  await deps.db.insert(adminSessions).values({
    id: sha256(token),
    userId: user.id,
    createdAt: deps.now,
    lastSeenAt: deps.now,
    expiresAt: new Date(deps.now.getTime() + SESSION_TTL_MS),
    ipHash: input.ipHash,
    userAgent: input.userAgent?.slice(0, 200) ?? null,
  });
  await deps.db.update(adminUsers).set({ lastLoginAt: deps.now }).where(eq(adminUsers.id, user.id));
  // opportunistic cleanup of expired sessions
  await deps.db
    .delete(adminSessions)
    .where(
      or(
        lt(adminSessions.expiresAt, deps.now),
        lt(adminSessions.lastSeenAt, new Date(deps.now.getTime() - SESSION_IDLE_MS)),
      ),
    );
  return { ok: true, token, user: toUser(user) };
}

export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export async function validateSession(
  db: Db,
  token: string | undefined,
  now: Date,
): Promise<AdminSession | null> {
  if (!token || !TOKEN_RE.test(token)) return null;
  const id = sha256(token);
  const [row] = await db
    .select({ session: adminSessions, user: adminUsers })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.userId))
    .where(eq(adminSessions.id, id));
  if (!row || !row.user.isActive) return null;
  const idleFor = now.getTime() - row.session.lastSeenAt.getTime();
  if (row.session.expiresAt <= now || idleFor > SESSION_IDLE_MS) {
    await db.delete(adminSessions).where(eq(adminSessions.id, id));
    return null;
  }
  if (idleFor > TOUCH_EVERY_MS) {
    await db.update(adminSessions).set({ lastSeenAt: now }).where(eq(adminSessions.id, id));
  }
  return { sessionId: id, user: toUser(row.user) };
}

export async function destroySession(db: Db, token: string | undefined) {
  if (!token || !TOKEN_RE.test(token)) return;
  await db.delete(adminSessions).where(eq(adminSessions.id, sha256(token)));
}

export async function revokeSessions(db: Db, userId: number, exceptSessionId?: string) {
  await db
    .delete(adminSessions)
    .where(
      exceptSessionId
        ? and(eq(adminSessions.userId, userId), ne(adminSessions.id, exceptSessionId))
        : eq(adminSessions.userId, userId),
    );
}

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH)
    return `Пароль — не короче ${MIN_PASSWORD_LENGTH} символов`;
  if (password.length > 200) return "Слишком длинный пароль";
  return null;
}

/** Self-service: requires the current password; other sessions of the user are revoked. */
export async function changePassword(
  db: Db,
  session: AdminSession,
  current: string,
  next: string,
): Promise<string | null> {
  const problem = passwordProblem(next);
  if (problem) return problem;
  const [u] = await db.select().from(adminUsers).where(eq(adminUsers.id, session.user.id));
  if (!u || !(await verifyPassword(u.passwordHash, current))) return "Текущий пароль неверный";
  await db
    .update(adminUsers)
    .set({ passwordHash: await hashPassword(next) })
    .where(eq(adminUsers.id, u.id));
  await revokeSessions(db, u.id, session.sessionId);
  return null;
}

/** Stores a fresh (not yet enabled) secret; the user confirms it with a code from the app. */
export async function beginTotp(db: Db, userId: number): Promise<string> {
  const secret = generateTotpSecret();
  await db
    .update(adminUsers)
    .set({ totpSecret: seal(secret), totpEnabled: false })
    .where(eq(adminUsers.id, userId));
  return secret;
}

export async function confirmTotp(db: Db, userId: number, code: string, now: Date) {
  const [u] = await db.select().from(adminUsers).where(eq(adminUsers.id, userId));
  const secret = u?.totpSecret ? unseal(u.totpSecret) : null;
  if (!secret || !verifyTotp(secret, code.replace(/\s+/g, ""), now.getTime())) return false;
  await db.update(adminUsers).set({ totpEnabled: true }).where(eq(adminUsers.id, userId));
  return true;
}

export async function disableTotp(db: Db, userId: number, password: string) {
  const [u] = await db.select().from(adminUsers).where(eq(adminUsers.id, userId));
  if (!u || !(await verifyPassword(u.passwordHash, password))) return false;
  await db
    .update(adminUsers)
    .set({ totpEnabled: false, totpSecret: null })
    .where(eq(adminUsers.id, userId));
  return true;
}
