"use client";

import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
      theme?: "auto" | "light" | "dark";
      language?: string;
    },
  ) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | null = null;

/** Loaded only when the server asks for a captcha; CSP allows the origin only when Turnstile is configured. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile"));
    s.onerror = () => {
      loading = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export function Turnstile({
  siteKey,
  language,
  onToken,
  onExpire,
}: {
  siteKey: string;
  language: string;
  onToken: (token: string) => void;
  onExpire: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onToken, onExpire });
  useEffect(() => {
    handlers.current = { onToken, onExpire };
  });

  useEffect(() => {
    let id: string | undefined;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !ref.current) return;
        id = api.render(ref.current, {
          sitekey: siteKey,
          language,
          theme: "auto",
          callback: (t) => handlers.current.onToken(t),
          "expired-callback": () => handlers.current.onExpire(),
          "error-callback": () => handlers.current.onExpire(),
        });
      })
      .catch(() => handlers.current.onExpire());
    return () => {
      cancelled = true;
      if (id) window.turnstile?.remove(id);
    };
  }, [siteKey, language]);

  return <div ref={ref} className="flex min-h-[65px] justify-center" />;
}
