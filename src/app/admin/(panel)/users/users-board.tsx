"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { revokeUserSessionsAction, saveUserAction } from "@/app/admin/_actions/system";
import {
  Badge,
  Button,
  ConfirmButton,
  Field,
  Input,
  Select,
  SwitchRow,
  useRun,
} from "@/components/admin/ui";
import { Sheet } from "@/components/ui/sheet";
import { ROLE_LABEL } from "@/lib/admin/roles";
import { fmtDateTime } from "@/lib/admin/format";
import type { UserInput } from "@/lib/admin/schemas";

type User = {
  id: number;
  login: string;
  name: string;
  role: UserInput["role"];
  telegramUserId: number | null;
  isActive: boolean;
  totpEnabled: boolean;
  lastLoginAt: string | null;
  sessions: number;
};

export function UsersBoard({ users, selfId }: { users: User[]; selfId: number }) {
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const { pending, run } = useRun();
  return (
    <>
      <div className="mb-3">
        <Button variant="primary" onClick={() => setEditing("new")}>
          <Plus className="size-4" aria-hidden="true" />
          Добавить
        </Button>
      </div>
      <ul className="border-line bg-surface divide-line divide-y overflow-hidden rounded-2xl border">
        {users.map((u) => (
          <li key={u.id}>
            <button
              onClick={() => setEditing(u)}
              className="flex min-h-16 w-full flex-col gap-1 px-4 py-2 text-left"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`font-bold ${u.isActive ? "" : "text-muted line-through"}`}>
                  {u.name}
                </span>
                <span className="text-muted text-[13px]">{u.login}</span>
                <Badge tone={u.role === "owner" ? "accent" : "muted"}>{ROLE_LABEL[u.role]}</Badge>
                {u.totpEnabled ? <Badge tone="ok">2FA</Badge> : null}
                {u.id === selfId ? <Badge>это вы</Badge> : null}
              </div>
              <div className="text-muted text-[13px]">
                вход: {u.lastLoginAt ? fmtDateTime(new Date(u.lastLoginAt)) : "никогда"} · активных
                сессий: {u.sessions}
              </div>
            </button>
          </li>
        ))}
      </ul>
      {editing ? (
        <Editor
          key={editing === "new" ? "new" : editing.id}
          user={editing === "new" ? null : editing}
          isSelf={editing !== "new" && editing.id === selfId}
          pending={pending}
          onClose={() => setEditing(null)}
          onSave={(v) => run(() => saveUserAction(v), { onOk: () => setEditing(null) })}
          onRevoke={(id) =>
            run(() => revokeUserSessionsAction(id), { success: "Сессии завершены" })
          }
        />
      ) : null}
    </>
  );
}

function Editor({
  user,
  isSelf,
  pending,
  onClose,
  onSave,
  onRevoke,
}: {
  user: User | null;
  isSelf: boolean;
  pending: boolean;
  onClose: () => void;
  onSave: (v: UserInput) => void;
  onRevoke: (id: number) => void;
}) {
  const [v, setV] = useState<UserInput>({
    id: user?.id ?? null,
    login: user?.login ?? "",
    name: user?.name ?? "",
    role: user?.role ?? "manager",
    telegramUserId: user?.telegramUserId ?? null,
    isActive: user?.isActive ?? true,
    password: "",
  });
  const [tg, setTg] = useState(user?.telegramUserId ? String(user.telegramUserId) : "");
  const tgValid = tg === "" || /^\d{1,16}$/.test(tg);
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={user ? user.name : "Новый пользователь"}
      closeLabel="Закрыть"
      footer={
        <Button
          variant="primary"
          pending={pending}
          disabled={!tgValid}
          className="w-full"
          onClick={() =>
            onSave({
              ...v,
              telegramUserId: tg ? Number(tg) : null,
              password: v.password || undefined,
            })
          }
        >
          Сохранить
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pt-2">
        <Field label="Имя">
          {(p) => (
            <Input
              {...p}
              value={v.name}
              onChange={(e) => setV((s) => ({ ...s, name: e.target.value }))}
            />
          )}
        </Field>
        <Field label="Логин" hint={user ? "Не меняется" : "Латиница, цифры, . _ -"}>
          {(p) => (
            <Input
              {...p}
              value={v.login}
              readOnly={Boolean(user)}
              autoCapitalize="none"
              autoComplete="off"
              onChange={(e) => setV((s) => ({ ...s, login: e.target.value.toLowerCase() }))}
            />
          )}
        </Field>
        <Field label="Роль" hint={isSelf ? "Свою роль менять нельзя" : undefined}>
          {(p) => (
            <Select
              {...p}
              value={v.role}
              disabled={isSelf}
              onChange={(e) => setV((s) => ({ ...s, role: e.target.value as UserInput["role"] }))}
            >
              <option value="waiter">{ROLE_LABEL.waiter}</option>
              <option value="manager">{ROLE_LABEL.manager}</option>
              <option value="owner">{ROLE_LABEL.owner}</option>
            </Select>
          )}
        </Field>
        <Field
          label={user ? "Новый пароль" : "Пароль"}
          hint={
            user
              ? "Оставьте пустым, чтобы не менять. Смена завершит все его сессии."
              : "Минимум 10 символов"
          }
        >
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="new-password"
              value={v.password ?? ""}
              onChange={(e) => setV((s) => ({ ...s, password: e.target.value }))}
            />
          )}
        </Field>
        <Field label="Telegram ID" error={tgValid ? null : "Только цифры"} hint="Необязательно">
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              value={tg}
              onChange={(e) => setTg(e.target.value.trim())}
            />
          )}
        </Field>
        <SwitchRow
          label="Доступ разрешён"
          hint={isSelf ? "Себя отключить нельзя" : "Отключение сразу завершает сессии"}
          checked={v.isActive}
          disabled={isSelf}
          onChange={(on) => setV((s) => ({ ...s, isActive: on }))}
        />
        {user && user.sessions > 0 ? (
          <ConfirmButton
            variant="secondary"
            pending={pending}
            confirmLabel="Завершить?"
            onConfirm={() => onRevoke(user.id)}
            className="w-fit"
          >
            {isSelf ? "Выйти на других устройствах" : `Завершить сессии (${user.sessions})`}
          </ConfirmButton>
        ) : null}
      </div>
    </Sheet>
  );
}
