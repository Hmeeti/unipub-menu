import "server-only";
import { refresh, revalidateTag } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ZodError } from "zod";
import { getDb, type Db } from "@/lib/db/client";
import type { AdminRole } from "@/lib/db/schema";
import { allowedOrigins, env } from "@/lib/env";
import { clientIp, hashId } from "@/lib/http/request";
import { getKv, type Kv } from "@/lib/kv/kv";
import { log } from "@/lib/log";
import { MENU_TAG } from "@/lib/menu/public";
import type { Actor } from "./audit";
import { hasRole, SESSION_TTL_MS, validateSession, type AdminSession } from "./auth";
import { AdminError } from "./errors";

/** `__Host-` pins the cookie to this exact host over HTTPS (no Domain, Path=/, Secure). */
export function adminCookieName() {
  return env().APP_URL.startsWith("https://") ? "__Host-unipub_admin" : "unipub_admin";
}

export async function setAdminCookie(token: string) {
  (await cookies()).set(adminCookieName(), token, {
    httpOnly: true,
    sameSite: "strict",
    secure: env().APP_URL.startsWith("https://"),
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function clearAdminCookie() {
  (await cookies()).delete(adminCookieName());
}

export async function readAdminToken() {
  return (await cookies()).get(adminCookieName())?.value;
}

/** Memoized per request so layouts and pages share one lookup. */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  return validateSession(await getDb(), await readAdminToken(), new Date());
});

/** Pages: redirect to login, or back to the dashboard when the role is too low. */
export async function requireAdmin(min: AdminRole = "waiter"): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!hasRole(session.user.role, min)) redirect("/admin?denied=1");
  return session;
}

export type ActionResult<T = null> =
  { ok: true; data: T; message?: string } | { ok: false; error: string };

export type ActionCtx = { db: Db; kv: Kv; session: AdminSession; actor: Actor; now: Date };

export async function requestIpHash() {
  return hashId("ip", clientIp(await headers()));
}

/**
 * Next.js already rejects cross-host Server Action calls but lets requests without Origin through;
 * admin mutations require an exact allowed Origin (plus SameSite=Strict cookie) as CSRF defence.
 */
async function sameOrigin() {
  const h = await headers();
  const site = h.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = h.get("origin");
  return Boolean(origin && allowedOrigins().includes(origin));
}

export async function runAction<T = null>(
  min: AdminRole,
  fn: (ctx: ActionCtx) => Promise<T>,
  opts: { menu?: boolean; message?: string } = {},
): Promise<ActionResult<T>> {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён: неверный источник" };
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Сессия истекла — войдите снова" };
  if (!hasRole(session.user.role, min)) return { ok: false, error: "Недостаточно прав" };
  try {
    const ctx: ActionCtx = {
      db: await getDb(),
      kv: await getKv(),
      session,
      actor: { id: session.user.id, login: session.user.login, ipHash: await requestIpHash() },
      now: new Date(),
    };
    const data = await fn(ctx);
    if (opts.menu) revalidateTag(MENU_TAG, { expire: 0 });
    refresh();
    return { ok: true, data, ...(opts.message ? { message: opts.message } : {}) };
  } catch (err) {
    if (err instanceof AdminError) return { ok: false, error: err.message };
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return {
        ok: false,
        error: first
          ? `Проверьте поле «${first.path.join(".") || "форма"}»: ${first.message}`
          : "Неверные данные",
      };
    }
    log.error({ err }, "admin action failed");
    return { ok: false, error: "Не удалось выполнить действие. Попробуйте ещё раз." };
  }
}
