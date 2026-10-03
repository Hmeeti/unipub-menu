"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { THEME_KEY } from "@/lib/theme/head-script";

type Theme = "light" | "dark";

function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

const read = (): Theme =>
  document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private mode */
  }
  const color = getComputedStyle(root).getPropertyValue("--theme-color").trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.removeAttribute("media");
    m.setAttribute("content", color);
  });
}

export function ThemeToggle({ toLight, toDark }: { toLight: string; toDark: string }) {
  const theme = useSyncExternalStore(subscribe, read, () => "dark" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => applyTheme(next)}
      aria-label={next === "light" ? toLight : toDark}
      className="border-line bg-surface text-text grid size-11 place-items-center rounded-full border active:scale-90"
    >
      {theme === "dark" ? (
        <Sun className="size-5" aria-hidden="true" />
      ) : (
        <Moon className="size-5" aria-hidden="true" />
      )}
    </button>
  );
}
