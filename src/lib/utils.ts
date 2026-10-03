import { clsx, type ClassValue } from "clsx";

/** Plain class joining; components avoid conflicting utilities instead of paying for tailwind-merge. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/** External links rendered from admin-editable data must be https (no javascript:, http:, data:). */
export function httpsOnly(url: string | null | undefined): string | null {
  return url && url.startsWith("https://") ? url : null;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function vibrate(ms = 12) {
  if (prefersReducedMotion()) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}
