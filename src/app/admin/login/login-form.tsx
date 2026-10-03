"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input } from "@/components/admin/ui";
import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  // controlled so the automatic form reset keeps it for the TOTP step
  const [password, setPassword] = useState("");
  return (
    <form
      action={action}
      className="border-line bg-surface flex flex-col gap-4 rounded-2xl border p-5"
      noValidate
    >
      <Field label="Логин">
        {(p) => (
          <Input
            {...p}
            name="login"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={state.login}
            required
          />
        )}
      </Field>
      <Field label="Пароль">
        {(p) => (
          <Input
            {...p}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </Field>
      {state.needTotp ? (
        <Field label="Код из приложения" hint="6 цифр из Google Authenticator или аналога">
          {(p) => (
            <Input
              {...p}
              name="totp"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              autoFocus
            />
          )}
        </Field>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-danger text-[14px] font-semibold">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" pending={pending} className="mt-1">
        Войти
      </Button>
    </form>
  );
}
