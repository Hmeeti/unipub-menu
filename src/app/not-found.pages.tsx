import { sitePath } from "@/lib/site";
import "./globals.css";

/** GitHub Pages serves this as 404.html for every unknown path under the site. */
export default function StaticNotFound() {
  return (
    <html lang="ru" data-theme="dark">
      <body>
        <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
          <h1 className="text-2xl font-extrabold">404 · Страница не найдена</h1>
          <a
            href={sitePath("/")}
            className="bg-accent text-on-accent mt-6 inline-flex min-h-12 items-center rounded-2xl px-6 font-bold no-underline"
          >
            Открыть меню
          </a>
        </main>
      </body>
    </html>
  );
}
