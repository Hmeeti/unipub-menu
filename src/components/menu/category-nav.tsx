"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/providers/i18n-provider";
import { CategoryIcon } from "@/components/ui/icons";
import type { CategoryView } from "@/lib/menu/view";
import { usePrefs } from "@/lib/store/prefs";
import { cn, prefersReducedMotion } from "@/lib/utils";

export const FAVORITES_SECTION = "favorites";
export const sectionId = (id: string) => `cat-${id}`;

type Props = { categories: CategoryView[]; flat: boolean; onLeaveFlat: () => void };

export function CategoryNav({ categories, flat, onLeaveFlat }: Props) {
  const t = useT();
  const hasFavorites = usePrefs((s) => s.favorites.length > 0);
  const [active, setActive] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const lockUntil = useRef(0);

  const entries = [
    ...(hasFavorites ? [{ id: FAVORITES_SECTION, icon: "heart", title: t("nav.favorites") }] : []),
    ...categories,
  ];
  const idsKey = entries.map((e) => e.id).join(",");

  useEffect(() => {
    if (flat) return;
    const sections = idsKey
      .split(",")
      .map((id) => document.getElementById(sectionId(id)))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!sections.length) return;
    const visible = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (records) => {
        for (const r of records) visible.set(r.target.id, r.isIntersecting);
        if (performance.now() < lockUntil.current) return;
        const first = sections.find((s) => visible.get(s.id));
        if (first) setActive(first.id.slice(4));
      },
      { rootMargin: "-130px 0px -55% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [idsKey, flat]);

  useEffect(() => {
    const nav = navRef.current;
    const chip = active ? nav?.querySelector<HTMLElement>(`[data-cat="${active}"]`) : null;
    if (!nav || !chip) return;
    nav.scrollTo({
      left: chip.offsetLeft - 16,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [active]);

  const go = (id: string) => {
    const scroll = () => {
      const el = document.getElementById(sectionId(id));
      if (!el) return;
      lockUntil.current = performance.now() + 1200;
      setActive(id);
      el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      // Sections above use content-visibility with estimated heights, so the first
      // scroll can land off target once they render; settle with an instant correction.
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        window.removeEventListener("scrollend", settle);
        const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
        if (Math.abs(el.getBoundingClientRect().top - margin) > 8) {
          el.scrollIntoView({ behavior: "auto", block: "start" });
        }
      };
      window.addEventListener("scrollend", settle);
      setTimeout(settle, 1000);
    };
    if (flat) {
      onLeaveFlat();
      requestAnimationFrame(() => requestAnimationFrame(scroll));
    } else scroll();
  };

  return (
    <nav
      aria-label={t("nav.categories")}
      className="border-line bg-bg sticky top-0 z-30 border-b pt-[env(safe-area-inset-top)]"
    >
      <div
        ref={navRef}
        className="no-scrollbar mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-2"
      >
        {entries.map((c) => {
          const isActive = !flat && active === c.id;
          return (
            <a
              key={c.id}
              href={`#${sectionId(c.id)}`}
              data-cat={c.id}
              aria-current={isActive ? "true" : undefined}
              onClick={(e) => {
                e.preventDefault();
                go(c.id);
              }}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[15px] font-semibold whitespace-nowrap no-underline transition-colors",
                isActive
                  ? "bg-accent text-on-accent border-transparent"
                  : "border-line bg-surface text-text hover:border-line-strong active:bg-surface-2",
              )}
            >
              <CategoryIcon name={c.icon} className="size-[18px]" />
              {c.title}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
