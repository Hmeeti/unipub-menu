"use client";

import { useSyncExternalStore } from "react";

const MINUTE = 60_000;

function subscribe(onChange: () => void) {
  const timer = window.setInterval(onChange, MINUTE);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
}

const snapshot = () => Math.floor(Date.now() / MINUTE) * MINUTE;

/** Current time (epoch ms) rounded to the minute; null during prerender and hydration. */
export function useMinute(enabled: boolean): number | null {
  return useSyncExternalStore(
    enabled ? subscribe : noopSubscribe,
    enabled ? snapshot : nullSnapshot,
    nullSnapshot,
  );
}

const noopSubscribe = () => () => undefined;
const nullSnapshot = () => null;
