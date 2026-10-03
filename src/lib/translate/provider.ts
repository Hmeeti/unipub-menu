import { env } from "@/lib/env";

export class TranslateError extends Error {
  constructor(
    message: string,
    readonly code: "not_configured" | "unsupported" | "quota" | "failed",
  ) {
    super(message);
  }
}

export function translatorConfigured(): boolean {
  const e = env();
  if (e.TRANSLATE_PROVIDER === "deepl") return Boolean(e.DEEPL_API_KEY);
  if (e.TRANSLATE_PROVIDER === "google") return Boolean(e.GOOGLE_TRANSLATE_API_KEY);
  return false;
}

const TIMEOUT_MS = 10_000;

/**
 * Server-side machine translation (keys never reach the browser).
 * DeepL: POST /v2/translate, `Authorization: DeepL-Auth-Key …`, JSON {text[], source_lang, target_lang}.
 * Google Cloud Translation Basic v2: POST /language/translate/v2?key=…, JSON {q[], source, target, format}.
 */
export async function translateTexts(
  texts: string[],
  target: string,
  source = "ru",
): Promise<string[]> {
  const e = env();
  if (!texts.length) return [];
  if (!translatorConfigured()) {
    throw new TranslateError(
      "Переводчик не настроен (TRANSLATE_PROVIDER и ключ API)",
      "not_configured",
    );
  }
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  if (e.TRANSLATE_PROVIDER === "deepl") {
    const res = await fetch(`${e.DEEPL_API_URL.replace(/\/+$/, "")}/v2/translate`, {
      method: "POST",
      headers: {
        authorization: `DeepL-Auth-Key ${e.DEEPL_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text: texts,
        source_lang: source.toUpperCase(),
        target_lang: target.toUpperCase(),
      }),
      signal,
    });
    if (res.status === 456) throw new TranslateError("Исчерпан лимит DeepL", "quota");
    if (res.status === 400)
      throw new TranslateError(`DeepL не поддерживает язык «${target}»`, "unsupported");
    if (!res.ok) throw new TranslateError(`DeepL ответил ${res.status}`, "failed");
    const body = (await res.json()) as { translations?: { text: string }[] };
    if (body.translations?.length !== texts.length)
      throw new TranslateError("DeepL вернул неполный ответ", "failed");
    return body.translations.map((t) => t.text);
  }
  const url = new URL("https://translation.googleapis.com/language/translate/v2");
  url.searchParams.set("key", e.GOOGLE_TRANSLATE_API_KEY!);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ q: texts, source, target, format: "text" }),
    signal,
  });
  if (res.status === 400)
    throw new TranslateError(`Google не поддерживает язык «${target}»`, "unsupported");
  if (res.status === 403 || res.status === 429)
    throw new TranslateError("Google Translate: нет квоты или доступа", "quota");
  if (!res.ok) throw new TranslateError(`Google Translate ответил ${res.status}`, "failed");
  const body = (await res.json()) as { data?: { translations?: { translatedText: string }[] } };
  const out = body.data?.translations;
  if (out?.length !== texts.length)
    throw new TranslateError("Google вернул неполный ответ", "failed");
  return out.map((t) => t.translatedText);
}
