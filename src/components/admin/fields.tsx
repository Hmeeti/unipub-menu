"use client";

import { ImagePlus, Languages, Trash2 } from "lucide-react";
import Image from "next/image";
import { useId, useRef, useState } from "react";
import { translateAction, uploadPhotoAction } from "@/app/admin/_actions/menu";
import type { ImageAsset, Schedule } from "@/lib/domain/types";
import { imageSrc } from "@/lib/images/loader";
import { cn } from "@/lib/utils";
import { Button, Field, Input, Textarea, useRun } from "./ui";

export type Langs = { ru: string; kk?: string; en?: string };
export type LangKey = "ru" | "kk" | "en";
const LANGS: { key: LangKey; label: string }[] = [
  { key: "ru", label: "RU" },
  { key: "kk", label: "KK" },
  { key: "en", label: "EN" },
];

type I18nField = {
  key: string;
  label: string;
  multiline?: boolean;
  required?: boolean;
  placeholder?: string;
};

/**
 * Language tabs over a group of fields (name/description/ingredients…). «Перевести» fills the
 * empty KK/EN values from RU through the server translator; the manager reviews before saving.
 */
export function I18nFields({
  fields,
  values,
  onChange,
  canTranslate = true,
}: {
  fields: I18nField[];
  values: Record<string, Langs>;
  onChange: (key: string, value: Langs) => void;
  canTranslate?: boolean;
}) {
  const [lang, setLang] = useState<LangKey>("ru");
  const { pending, run } = useRun();
  const baseId = useId();

  const translate = (overwrite: boolean) => {
    const targets = (["kk", "en"] as const).filter(
      (l) => overwrite || fields.some((f) => values[f.key]?.ru && !values[f.key]?.[l]),
    );
    if (!targets.length) return;
    run(
      () =>
        translateAction({
          texts: fields.map((f) => values[f.key]?.ru ?? ""),
          targets: [...targets],
        }),
      {
        success: "Переведено — проверьте текст перед сохранением",
        onOk: (res) => {
          fields.forEach((f, i) => {
            const cur = values[f.key] ?? { ru: "" };
            const next = { ...cur };
            for (const l of targets) {
              const t = res[l]?.[i];
              if (t && (overwrite || !cur[l])) next[l] = t;
            }
            onChange(f.key, next);
          });
        },
      },
    );
  };

  return (
    <div className="border-line rounded-2xl border p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Язык" className="bg-bg-2 flex rounded-xl p-1">
          {LANGS.map((l) => {
            const missing =
              l.key !== "ru" && fields.some((f) => values[f.key]?.ru && !values[f.key]?.[l.key]);
            return (
              <button
                key={l.key}
                role="tab"
                id={`${baseId}-${l.key}`}
                aria-selected={lang === l.key}
                onClick={() => setLang(l.key)}
                className={cn(
                  "relative min-h-9 min-w-12 rounded-lg px-3 text-[14px] font-bold",
                  lang === l.key ? "bg-surface-2 text-text" : "text-muted",
                )}
              >
                {l.label}
                {missing ? (
                  <span
                    className="bg-gold absolute top-1 right-1 size-1.5 rounded-full"
                    aria-label="не заполнено"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
        {canTranslate ? (
          <Button
            pending={pending}
            onClick={() => translate(false)}
            className="ml-auto min-h-9 text-[14px]"
          >
            <Languages className="size-4" aria-hidden="true" />
            Перевести автоматически
          </Button>
        ) : null}
      </div>
      <div role="tabpanel" aria-labelledby={`${baseId}-${lang}`} className="flex flex-col gap-3">
        {fields.map((f) => {
          const v = values[f.key] ?? { ru: "" };
          const set = (text: string) => onChange(f.key, { ...v, [lang]: text });
          const label = `${f.label} · ${lang.toUpperCase()}`;
          const hint = lang !== "ru" && v.ru ? `RU: ${v.ru.slice(0, 120)}` : undefined;
          return (
            <Field key={`${f.key}-${lang}`} label={label} hint={hint}>
              {(p) =>
                f.multiline ? (
                  <Textarea
                    {...p}
                    value={v[lang] ?? ""}
                    onChange={(e) => set(e.target.value)}
                    placeholder={f.placeholder}
                  />
                ) : (
                  <Input
                    {...p}
                    value={v[lang] ?? ""}
                    onChange={(e) => set(e.target.value)}
                    required={f.required && lang === "ru"}
                    placeholder={f.placeholder}
                  />
                )
              }
            </Field>
          );
        })}
      </div>
    </div>
  );
}

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const DAY_INDEX = [1, 2, 3, 4, 5, 6, 0];

/** Days of week + time window (crossing midnight allowed) + optional date range, Asia/Almaty. */
export function ScheduleEditor({
  value,
  onChange,
}: {
  value: Schedule;
  onChange: (s: Schedule) => void;
}) {
  const days = value.days ?? [];
  const toggleDay = (d: number) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    onChange({ ...value, days: next.length ? next : undefined });
  };
  const set = (k: keyof Schedule, v: string) => onChange({ ...value, [k]: v || undefined });
  const crosses = value.from && value.to && value.from > value.to;
  return (
    <div className="flex flex-col gap-3">
      <fieldset>
        <legend className="text-muted mb-1.5 text-[13px] font-semibold">
          Дни недели (пусто — каждый день)
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {DAY_INDEX.map((d, i) => (
            <button
              key={d}
              type="button"
              aria-pressed={days.includes(d)}
              onClick={() => toggleDay(d)}
              className={cn(
                "min-h-10 min-w-11 rounded-xl border text-[14px] font-bold",
                days.includes(d)
                  ? "bg-accent text-on-accent border-transparent"
                  : "border-line text-muted",
              )}
            >
              {DAYS[i]}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="С (время)">
          {(p) => (
            <Input
              {...p}
              type="time"
              value={value.from ?? ""}
              onChange={(e) => set("from", e.target.value)}
            />
          )}
        </Field>
        <Field label="До (время)">
          {(p) => (
            <Input
              {...p}
              type="time"
              value={value.to ?? ""}
              onChange={(e) => set("to", e.target.value)}
            />
          )}
        </Field>
        <Field label="Начиная с даты">
          {(p) => (
            <Input
              {...p}
              type="date"
              value={value.startDate ?? ""}
              onChange={(e) => set("startDate", e.target.value)}
            />
          )}
        </Field>
        <Field label="По дату">
          {(p) => (
            <Input
              {...p}
              type="date"
              value={value.endDate ?? ""}
              onChange={(e) => set("endDate", e.target.value)}
            />
          )}
        </Field>
      </div>
      <p className="text-muted text-[13px]">
        Время по Алматы.{" "}
        {crosses
          ? `Окно переходит через полночь: ${value.from}–${value.to} относится к дню начала.`
          : "Без времени — весь день."}
      </p>
    </div>
  );
}

/** Upload → sharp on the server → WebP variants on the CDN; returns the list for the form state. */
export function ImagesField({
  images,
  onChange,
  name,
  folder = "menu",
  max = 6,
}: {
  images: ImageAsset[];
  onChange: (images: ImageAsset[]) => void;
  name: string;
  folder?: "menu" | "promo";
  max?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { pending, run } = useRun();
  const upload = (file: File) => {
    const form = new FormData();
    form.set("file", file);
    form.set("folder", folder);
    form.set("name", name || "img");
    run(() => uploadPhotoAction(form), {
      success: "Фото загружено",
      onOk: (asset) => onChange([...images, asset].slice(0, max)),
    });
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {images.map((img, i) => (
          <div
            key={img.src}
            className="border-line relative size-24 overflow-hidden rounded-xl border"
          >
            <Image
              src={imageSrc(img)}
              alt={`Фото ${i + 1}`}
              fill
              sizes="160px"
              className="object-cover"
            />
            {i === 0 && images.length > 1 ? (
              <span className="bg-bg/80 absolute bottom-1 left-1 rounded px-1 text-[11px] font-bold">
                главное
              </span>
            ) : null}
            <div className="absolute top-1 right-1 flex gap-1">
              {i > 0 ? (
                <button
                  type="button"
                  className="bg-bg/80 grid size-8 place-items-center rounded-lg text-[12px] font-bold"
                  aria-label="Сделать главным"
                  onClick={() => onChange([img, ...images.filter((_, k) => k !== i)])}
                >
                  ★
                </button>
              ) : null}
              <button
                type="button"
                className="bg-bg/80 text-danger grid size-8 place-items-center rounded-lg"
                aria-label={`Удалить фото ${i + 1}`}
                onClick={() => onChange(images.filter((_, k) => k !== i))}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
        {images.length < max ? (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={pending}
            className="border-line text-muted flex size-24 flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-[12px] font-semibold disabled:opacity-50"
          >
            <ImagePlus className="size-6" aria-hidden="true" />
            {pending ? "Загрузка…" : "Добавить"}
          </button>
        ) : null}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        tabIndex={-1}
        aria-label="Файл фото"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) upload(f);
        }}
      />
      <p className="text-muted mt-2 text-[13px]">
        JPEG, PNG, WebP или AVIF до 8 МБ. Сервер сожмёт фото и сделает размеры для телефонов.
      </p>
    </div>
  );
}
