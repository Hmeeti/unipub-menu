"use client";

import type { ReactNode } from "react";
import type { GuestRequestType } from "@/lib/requests/types";
import { useRequestUi } from "@/lib/store/requests-ui";
import { cn } from "@/lib/utils";

/** Client island for server sections: the label and icon are rendered on the server. */
export function RequestButton({
  type,
  children,
  className,
}: {
  type: GuestRequestType;
  children: ReactNode;
  className?: string;
}) {
  const show = useRequestUi((s) => s.show);
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => show(type)}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-[15px] font-bold active:scale-95",
        className,
      )}
    >
      {children}
    </button>
  );
}
