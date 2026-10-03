"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const POLL_MS = 60_000;

type LiveBody = { ok: true; version: number; soldOut: string[] } | { ok: false };

/**
 * Keeps an open page honest: the stop-list is refreshed every minute and when the tab becomes
 * visible again; a newly published menu version triggers a server refresh of the page.
 */
export function useLiveSoldOut(version: number, initial: string[]): string[] {
  const router = useRouter();
  const [live, setLive] = useState<{ version: number; soldOut: string[] } | null>(null);

  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/menu/live", { cache: "no-store" });
        const body = (await res.json()) as LiveBody;
        if (stopped || !body.ok) return;
        if (body.version !== version) router.refresh();
        else setLive({ version: body.version, soldOut: body.soldOut });
      } catch {
        /* offline: keep what we have */
      }
    };
    const onVisible = () => document.visibilityState === "visible" && void check();
    const timer = window.setInterval(() => void check(), POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [version, router]);

  return live && live.version === version ? live.soldOut : initial;
}
