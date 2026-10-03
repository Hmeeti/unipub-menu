"use client";

import { useState } from "react";
import {
  beginTotpAction,
  changePasswordAction,
  confirmTotpAction,
  disableTotpAction,
} from "@/app/admin/_actions/system";
import { Badge, Button, Card, Field, Input, useRun } from "@/components/admin/ui";

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const { pending, run } = useRun();
  const mismatch = repeat.length > 0 && next !== repeat;
  return (
    <Card>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (mismatch) return;
          run(() => changePasswordAction(current, next), {
            onOk: () => {
              setCurrent("");
              setNext("");
              setRepeat("");
            },
          });
        }}
      >
        <h2 className="text-lg font-bold">Пароль</h2>
        <Field label="Текущий пароль">
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Новый пароль"
          hint="Не короче 10 символов. Удобно — фраза из нескольких слов."
        >
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          )}
        </Field>
        <Field label="Повторите новый пароль" error={mismatch ? "Пароли не совпадают" : null}>
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="new-password"
              required
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
          )}
        </Field>
        <Button
          type="submit"
          variant="primary"
          pending={pending}
          disabled={mismatch}
          className="w-fit"
        >
          Сменить пароль
        </Button>
      </form>
    </Card>
  );
}

export function TotpForm({ enabled }: { enabled: boolean }) {
  const [setup, setSetup] = useState<{ secret: string; svg: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const { pending, run } = useRun();

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-lg font-bold">Двухфакторный вход</h2>
        {enabled ? <Badge tone="ok">включён</Badge> : <Badge>выключен</Badge>}
      </div>
      {enabled ? (
        <>
          <p className="text-muted text-[14px]">
            При входе нужен код из приложения-аутентификатора. Чтобы выключить, введите пароль.
          </p>
          <Field label="Пароль">
            {(p) => (
              <Input
                {...p}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
          <Button
            variant="danger"
            pending={pending}
            disabled={!password}
            className="w-fit"
            onClick={() => run(() => disableTotpAction(password), { onOk: () => setPassword("") })}
          >
            Выключить
          </Button>
        </>
      ) : setup ? (
        <>
          <p className="text-[14px]">
            Отсканируйте QR в Google Authenticator, Яндекс Ключе или 1Password и введите 6 цифр из
            приложения.
          </p>
          <div
            className="w-48 overflow-hidden rounded-xl"
            // svg comes from our server: numeric path data only
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: setup.svg }}
          />
          <details className="text-muted text-[13px]">
            <summary className="cursor-pointer">Не сканируется? Ввести ключ вручную</summary>
            <code className="text-text mt-1 block font-mono break-all select-all">
              {setup.secret}
            </code>
          </details>
          <Field label="Код из приложения">
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="w-36 text-center font-mono text-lg tracking-[0.3em]"
              />
            )}
          </Field>
          <div className="flex gap-2">
            <Button
              variant="primary"
              pending={pending}
              disabled={code.length !== 6}
              onClick={() => run(() => confirmTotpAction(code), { onOk: () => setSetup(null) })}
            >
              Включить
            </Button>
            <Button variant="ghost" onClick={() => setSetup(null)}>
              Отмена
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-muted text-[14px]">
            Даже если пароль украдут, без телефона войти не получится. Рекомендуем владельцу и
            управляющим.
          </p>
          <Button
            pending={pending}
            className="w-fit"
            onClick={() => run(() => beginTotpAction(), { onOk: (d) => setSetup(d) })}
          >
            Настроить
          </Button>
        </>
      )}
    </Card>
  );
}
