"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import {
  beginTotp,
  changePassword,
  confirmTotp,
  destroySession,
  disableTotp,
  revokeSessions,
} from "@/lib/admin/auth";
import { importBackup } from "@/lib/admin/backup";
import { AdminError } from "@/lib/admin/errors";
import { qrSvg } from "@/lib/admin/qr";
import { retryDead } from "@/lib/admin/reports";
import { userSchema, type UserInput } from "@/lib/admin/schemas";
import { clearAdminCookie, getAdminSession, readAdminToken, runAction } from "@/lib/admin/session";
import { saveUser } from "@/lib/admin/users";
import { getDb } from "@/lib/db/client";
import { formatVenueDateTime } from "@/lib/domain/schedule";
import { OUTBOX_WAKE } from "@/lib/orders/service";
import { otpauthUrl } from "@/lib/security/totp";
import { botSender } from "@/lib/outbox/worker";
import { getBot } from "@/lib/telegram/bot";

export async function logoutAction() {
  const db = await getDb();
  const session = await getAdminSession();
  if (session) await audit(db, { id: session.user.id, login: session.user.login }, "auth.logout");
  await destroySession(db, await readAdminToken());
  await clearAdminCookie();
  redirect("/admin/login");
}

export async function changePasswordAction(current: string, next: string) {
  return runAction(
    "waiter",
    async ({ db, session, actor }) => {
      const problem = await changePassword(db, session, String(current), String(next));
      if (problem) throw new AdminError(problem);
      await audit(db, actor, "auth.password", { type: "admin_user", id: actor.id });
      return null;
    },
    { message: "Пароль изменён, другие сессии завершены" },
  );
}

export async function beginTotpAction() {
  return runAction("waiter", async ({ db, session }) => {
    const secret = await beginTotp(db, session.user.id);
    const url = otpauthUrl(secret, session.user.login);
    return { secret, svg: qrSvg(url, "QR для приложения-аутентификатора") };
  });
}

export async function confirmTotpAction(code: string) {
  return runAction(
    "waiter",
    async ({ db, session, actor, now }) => {
      if (!(await confirmTotp(db, session.user.id, String(code), now)))
        throw new AdminError("Код не подошёл");
      await audit(db, actor, "auth.totp_on", { type: "admin_user", id: actor.id });
      return null;
    },
    { message: "Двухфакторный вход включён" },
  );
}

export async function disableTotpAction(password: string) {
  return runAction(
    "waiter",
    async ({ db, session, actor }) => {
      if (!(await disableTotp(db, session.user.id, String(password))))
        throw new AdminError("Неверный пароль");
      await audit(db, actor, "auth.totp_off", { type: "admin_user", id: actor.id });
      return null;
    },
    { message: "Двухфакторный вход выключен" },
  );
}

export async function saveUserAction(raw: UserInput) {
  return runAction(
    "owner",
    async ({ db, actor }) => {
      const input = userSchema.parse(raw);
      const id = await saveUser(db, input, actor.id);
      await audit(
        db,
        actor,
        input.password ? "user.password_reset" : "user.save",
        { type: "admin_user", id },
        {
          login: input.login,
          role: input.role,
          isActive: input.isActive,
        },
      );
      return { id };
    },
    { message: "Пользователь сохранён" },
  );
}

export async function revokeUserSessionsAction(userId: number) {
  return runAction("owner", async ({ db, actor, session }) => {
    const id = z.int().positive().parse(userId);
    await revokeSessions(db, id, id === actor.id ? session.sessionId : undefined);
    await audit(db, actor, "user.sessions_revoked", { type: "admin_user", id });
    return null;
  });
}

export async function importAction(form: FormData) {
  return runAction(
    "owner",
    async ({ db, actor }) => {
      const file = form.get("file");
      if (!(file instanceof File) || !file.size) throw new AdminError("Выберите файл JSON");
      if (file.size > 5 * 1024 * 1024) throw new AdminError("Файл больше 5 МБ");
      let data: unknown;
      try {
        data = JSON.parse(await file.text());
      } catch {
        throw new AdminError("Это не JSON");
      }
      const summary = await importBackup(db, data);
      await audit(db, actor, "menu.import", { type: "menu" }, summary);
      return summary;
    },
    { menu: true, message: "Импортировано в черновик — проверьте и опубликуйте" },
  );
}

/** Sends a message to the staff group right now (bypassing the outbox) and reports the outcome. */
export async function botTestAction() {
  return runAction("manager", async ({ db, kv, actor, now }) => {
    const holder = getBot(async () => ({ db, kv }));
    try {
      await botSender(holder).send(
        `✅ Проверка связи из админки UNIPUB\n${actor.login} · ${formatVenueDateTime(now)}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new AdminError(
        `Telegram не принял сообщение: ${msg.replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot<скрыто>").slice(0, 200)}`,
      );
    } finally {
      await audit(db, actor, "system.bot_test", { type: "telegram" });
    }
    return { mock: holder.mock };
  });
}

export async function retryOutboxAction(ids: number[] | "all") {
  return runAction("manager", async ({ db, kv, actor }) => {
    const list = ids === "all" ? "all" : z.array(z.int().positive()).max(100).parse(ids);
    const n = await retryDead(db, list);
    await kv.publish(OUTBOX_WAKE, "admin");
    await audit(db, actor, "system.outbox_retry", { type: "outbox" }, { count: n });
    return { count: n };
  });
}
