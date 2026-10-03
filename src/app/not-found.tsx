import Link from "next/link";
import "./globals.css";

/** Paths outside any locale (the proxy redirects most of them to /ru first). */
export default function GlobalNotFound() {
  return (
    <html lang="ru" data-theme="dark">
      <body>
        <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
          <h1 className="text-2xl font-extrabold">404 · Страница не найдена</h1>
          <Link
            href="/ru"
            className="bg-accent text-on-accent mt-6 inline-flex min-h-12 items-center rounded-2xl px-6 font-bold no-underline"
          >
            Открыть меню
          </Link>
        </main>
      </body>
    </html>
  );
}
