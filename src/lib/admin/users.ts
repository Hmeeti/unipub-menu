import { and, asc, count, eq, ne } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { adminSessions, adminUsers } from "@/lib/db/schema";
import { hashPassword } from "@/lib/security/password";
import { passwordProblem, revokeSessions } from "./auth";
import { AdminError } from "./errors";
import type { UserInput } from "./schemas";

export async function listUsers(db: Db) {
  const users = await db.select().from(adminUsers).orderBy(asc(adminUsers.id));
  const sessions = await db
    .select({ userId: adminSessions.userId, n: count() })
    .from(adminSessions)
    .groupBy(adminSessions.userId);
  const byUser = new Map(sessions.map((s) => [s.userId, Number(s.n)]));
  return users.map((u) => ({
    id: u.id,
    login: u.login,
    name: u.name,
    role: u.role,
    telegramUserId: u.telegramUserId,
    isActive: u.isActive,
    totpEnabled: u.totpEnabled,
    lastLoginAt: u.lastLoginAt,
    sessions: byUser.get(u.id) ?? 0,
  }));
}

async function otherActiveOwners(db: Db, exceptId: number) {
  const [row] = await db
    .select({ n: count() })
    .from(adminUsers)
    .where(
      and(eq(adminUsers.role, "owner"), eq(adminUsers.isActive, true), ne(adminUsers.id, exceptId)),
    );
  return Number(row?.n ?? 0);
}

/** Owner-only. Keeps at least one active owner; a password change revokes the user's sessions. */
export async function saveUser(db: Db, input: UserInput, actorId: number): Promise<number> {
  if (input.telegramUserId) {
    const [taken] = await db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(
        input.id
          ? and(eq(adminUsers.telegramUserId, input.telegramUserId), ne(adminUsers.id, input.id))
          : eq(adminUsers.telegramUserId, input.telegramUserId),
      );
    if (taken) throw new AdminError("Этот Telegram ID уже у другого пользователя");
  }
  const password = input.password?.trim() ? input.password : undefined;
  if (password) {
    const problem = passwordProblem(password);
    if (problem) throw new AdminError(problem);
  }
  if (!input.id) {
    if (!password) throw new AdminError("Задайте пароль для нового пользователя");
    const [dup] = await db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(eq(adminUsers.login, input.login));
    if (dup) throw new AdminError(`Логин «${input.login}» занят`);
    const [row] = await db
      .insert(adminUsers)
      .values({
        login: input.login,
        name: input.name,
        role: input.role,
        telegramUserId: input.telegramUserId,
        isActive: input.isActive,
        passwordHash: await hashPassword(password),
      })
      .returning({ id: adminUsers.id });
    return row!.id;
  }
  const [current] = await db.select().from(adminUsers).where(eq(adminUsers.id, input.id));
  if (!current) throw new AdminError("Пользователь не найден");
  if (input.id === actorId && (!input.isActive || input.role !== current.role)) {
    throw new AdminError("Нельзя отключить себя или сменить себе роль");
  }
  const losesOwner =
    current.role === "owner" && current.isActive && (input.role !== "owner" || !input.isActive);
  if (losesOwner && (await otherActiveOwners(db, current.id)) === 0) {
    throw new AdminError("Должен остаться хотя бы один активный владелец");
  }
  await db
    .update(adminUsers)
    .set({
      name: input.name,
      role: input.role,
      telegramUserId: input.telegramUserId,
      isActive: input.isActive,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    })
    .where(eq(adminUsers.id, input.id));
  if (password || !input.isActive || input.role !== current.role)
    await revokeSessions(db, input.id);
  return input.id;
}
