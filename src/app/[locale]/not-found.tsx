import { getLocale, getTranslations } from "next-intl/server";

export default async function NotFound() {
  const locale = await getLocale();
  const t = await getTranslations("notFound");
  return (
    <main
      id="menu"
      className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 text-center"
    >
      <p className="wordmark text-text text-5xl">
        unipub<span className="text-pink">.</span>
      </p>
      <h1 className="mt-6 text-2xl font-extrabold">{t("title")}</h1>
      <p className="text-muted mt-2 text-[15px]">{t("text")}</p>
      <a
        href={`/${locale}`}
        className="bg-accent text-on-accent mt-6 inline-flex min-h-12 items-center rounded-2xl px-6 font-bold no-underline"
      >
        {t("toMenu")}
      </a>
    </main>
  );
}
