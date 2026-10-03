"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  onChange: (next: number) => void;
  max: number;
  incLabel: string;
  decLabel: string;
  size?: "md" | "lg";
  className?: string;
};

export function Stepper({
  value,
  onChange,
  max,
  incLabel,
  decLabel,
  size = "md",
  className,
}: Props) {
  const btn = cn(
    "grid shrink-0 place-items-center rounded-full transition-transform active:scale-90 disabled:opacity-40",
    size === "lg" ? "size-12" : "size-11",
  );
  return (
    <div
      className={cn(
        "border-line-strong bg-surface-2 inline-flex items-center rounded-full border",
        className,
      )}
    >
      <button
        type="button"
        className={btn}
        onClick={() => onChange(value - 1)}
        aria-label={decLabel}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <span
        className="min-w-7 text-center text-base font-bold tabular-nums"
        aria-live="polite"
        aria-atomic="true"
      >
        {value}
      </span>
      <button
        type="button"
        className={btn}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={incLabel}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
