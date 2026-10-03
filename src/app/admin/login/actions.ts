"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { audit } from "@/lib/admin/audit";
import { login } from "@/lib/admin/auth";
import { requestIpHash, setAdminCookie } from "@/lib/admin/session";
import { getDb } from "@/lib/db/client";
import { allowedOrigins } from "@/lib/env";
import { getKv } from "@/lib/kv/kv";
import { log } from "@/lib/log";

export type LoginState = { error?: string; needTotp?: boolean; login?: string };

const MESSAGES: Record<string, string> = {
  invalid: "Неверный логин или пароль",
  totp_invalid: "Код из приложения не подошёл",
  totp_required: "Введите код из приложения-аутентификатора",
};

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const h = await headers();
  const origin = h.get("origin");
  if (!origin || !allowedOrigins().includes(origin))
    return { error: "Запрос отклонён: неверный источник" };
  const loginValue = String(form.get("login") ?? "").slice(0, 64);
  const password = String(form.get("password") ?? "").slice(0, 200);
  const totp = String(form.get("totp") ?? "").slice(0, 12) || undefined;
  if (!loginValue || !password) return { error: "Введите логин и пароль", login: loginValue };

  let ok = false;
  try {
    const db = await getDb();
    const ipHash = await requestIpHash();
    const res = await login(
      { db, kv: await getKv(), now: new Date() },
      { login: loginValue, password, totp, ipHash, userAgent: h.get("user-agent") ?? undefined },
    );
    if (!res.ok) {
      if (res.error === "rate_limited") {
        return { error: "Слишком много попыток. Подождите 15 минут.", login: loginValue };
      }
      if (res.error !== "totp_required")
        await audit(db, null, "auth.login_failed", {
          type: "admin_user",
          id: loginValue.toLowerCase(),
        });
      return {
        error: MESSAGES[res.error],
        needTotp: res.error === "totp_required" || res.error === "totp_invalid",
        login: loginValue,
      };
    }
    await setAdminCookie(res.token);
    await audit(db, { id: res.user.id, login: res.user.login, ipHash }, "auth.login", {
      type: "admin_user",
      id: res.user.id,
    });
    ok = true;
  } catch (err) {
    log.error({ err }, "admin login failed");
    return { error: "Сервер недоступен, попробуйте ещё раз", login: loginValue };
  }
  if (ok) redirect("/admin");
  return {};
}
