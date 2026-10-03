"use client";

import { Loader2 } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/admin/session";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-on-accent font-bold",
  secondary: "bg-surface-2 text-text border border-line font-semibold",
  danger: "bg-surface-2 text-danger border border-line font-semibold",
  ghost: "text-text font-semibold",
};

export function Button({
  variant = "secondary",
  pending,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; pending?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || pending}
      aria-busy={pending || undefined}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] transition active:scale-[0.98] disabled:opacity-50",
        VARIANTS[variant],
        className,
      )}
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

/** Two-step destructive button: the first tap arms it for 4 s, the second one runs it. */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = "Точно?",
  pending,
  className,
  variant = "danger",
}: {
  onConfirm: () => void;
  children: ReactNode;
  confirmLabel?: string;
  pending?: boolean;
  className?: string;
  variant?: Variant;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button
      variant={armed ? "primary" : variant}
      pending={pending}
      className={className}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}

const control =
  "border-line bg-bg-2 text-text placeholder:text-muted/70 w-full rounded-xl border px-3 text-[15px] outline-none focus-visible:border-pink";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cn(control, "min-h-11", className)} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...rest} className={cn(control, "py-2.5", className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cn(control, "min-h-11", className)}>
      {children}
    </select>
  );
}

/** Label + control + hint/error, wired with ids for screen readers. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (props: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = hint || error ? `${id}-hint` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-muted text-[13px] font-semibold">
        {label}
      </label>
      {children({ id, "aria-describedby": hintId, ...(error ? { "aria-invalid": true } : {}) })}
      {error ? (
        <p id={hintId} className="text-danger text-[13px]">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-muted text-[13px]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition disabled:opacity-50",
        checked ? "bg-accent border-transparent" : "bg-surface-2 border-line-strong",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow transition",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

/** Switch with a visible text label on the left; the whole row is the hit area. */
export function SwitchRow({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-h-11 items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">{label}</div>
        {hint ? <div className="text-muted text-[13px]">{hint}</div> : null}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("border-line bg-surface rounded-2xl border p-4", className)}>
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "ok" | "warn" | "danger" | "accent";
}) {
  const tones = {
    muted: "bg-surface-2 text-muted",
    ok: "bg-success/15 text-success",
    warn: "bg-gold/15 text-gold",
    danger: "bg-danger/15 text-danger",
    accent: "bg-accent/20 text-pink-text",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-bold whitespace-nowrap",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * Runs a server action with pending state and a toast. Errors from the server are already
 * user-facing Russian strings; network failures get a generic message.
 */
export function useRun() {
  const [pending, start] = useTransition();
  const show = useToast((s) => s.show);
  const busy = useRef(false);
  const run = <T,>(
    fn: () => Promise<ActionResult<T>>,
    opts: { success?: string; onOk?: (data: T) => void } = {},
  ) => {
    if (busy.current) return;
    busy.current = true;
    start(async () => {
      try {
        const res = await fn();
        if (res.ok) {
          const msg = opts.success ?? res.message;
          if (msg) show({ message: msg });
          opts.onOk?.(res.data);
        } else {
          show({ message: res.error }, 5000);
        }
      } catch {
        show({ message: "Нет связи с сервером. Проверьте интернет и повторите." }, 5000);
      } finally {
        busy.current = false;
      }
    });
  };
  return { pending, run };
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted border-line rounded-2xl border border-dashed p-6 text-center text-[15px]">
      {children}
    </p>
  );
}
