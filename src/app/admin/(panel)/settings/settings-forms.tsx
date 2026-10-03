"use client";

import { useState } from "react";
import { saveFeaturesAction, saveVenueAction } from "@/app/admin/_actions/venue";
import { I18nFields } from "@/components/admin/fields";
import { Button, Card, Field, Input, Switch, SwitchRow, useRun } from "@/components/admin/ui";
import type { VenueInput } from "@/lib/admin/schemas";
import type { I18nList, I18nText, VenueFeatures } from "@/lib/domain/types";

const FEATURES: { key: keyof VenueFeatures; label: string; hint: string }[] = [
  {
    key: "orders",
    label: "Заказ с телефона",
    hint: "Выключите при перегрузе кухни — гости смогут только смотреть меню",
  },
  { key: "booking", label: "Бронь", hint: "Заявки на бронь стола или зала" },
  { key: "songs", label: "Заказ песен", hint: "Заявки на караоке" },
  { key: "promos", label: "Акции", hint: "Баннеры и «Блюдо дня» в меню" },
];

export function FeaturesForm({ initial }: { initial: VenueFeatures }) {
  const [v, setV] = useState(initial);
  const { pending, run } = useRun();
  const toggle = (key: keyof VenueFeatures, on: boolean) => {
    const next = { ...v, [key]: on };
    setV(next);
    run(() => saveFeaturesAction(next), { onOk: () => undefined });
  };
  return (
    <Card>
      <h2 className="mb-2 text-lg font-bold">Функции</h2>
      <div className="flex flex-col gap-2">
        {FEATURES.map((f) => (
          <SwitchRow
            key={f.key}
            label={f.label}
            hint={f.hint}
            checked={v[f.key]}
            disabled={pending}
            onChange={(on) => toggle(f.key, on)}
          />
        ))}
      </div>
    </Card>
  );
}

const DAYS = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const listToText = (l: I18nList): I18nText => ({
  ru: l.ru.join("\n"),
  ...(l.kk ? { kk: l.kk.join("\n") } : {}),
  ...(l.en ? { en: l.en.join("\n") } : {}),
});
const textToList = (t: I18nText): I18nList => {
  const split = (s?: string) =>
    (s ?? "")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
  return { ru: split(t.ru), kk: split(t.kk), en: split(t.en) };
};

type ListKey = "rules" | "karaokeRules" | "popularQueries";

export function VenueForm({ initial }: { initial: VenueInput }) {
  const [v, setV] = useState(initial);
  const [lists, setLists] = useState<Record<ListKey, I18nText>>({
    rules: listToText(initial.content.rules),
    karaokeRules: listToText(initial.content.karaokeRules),
    popularQueries: listToText(initial.content.popularQueries),
  });
  const { pending, run } = useRun();
  const contact = (k: Exclude<keyof VenueInput["contacts"], "address">, val: string) =>
    setV((s) => ({ ...s, contacts: { ...s.contacts, [k]: val } }));
  const setDay = (day: number, hours: { open: string; close: string } | null) =>
    setV((s) => ({ ...s, hours: s.hours.map((h, i) => (i === day ? hours : h)) }));

  const save = () =>
    run(() =>
      saveVenueAction({
        ...v,
        content: {
          ...v.content,
          rules: textToList(lists.rules),
          karaokeRules: textToList(lists.karaokeRules),
          popularQueries: textToList(lists.popularQueries),
        },
      }),
    );

  return (
    <>
      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">Основное</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Название">
            {(p) => (
              <Input
                {...p}
                value={v.name}
                onChange={(e) => setV((s) => ({ ...s, name: e.target.value }))}
              />
            )}
          </Field>
          <Field label="Обслуживание, %" hint="Добавляется к сумме заказа. 0 — без обслуживания">
            {(p) => (
              <Input
                {...p}
                type="number"
                inputMode="decimal"
                step="0.5"
                min={0}
                max={30}
                value={v.servicePercent}
                onChange={(e) =>
                  setV((s) => ({ ...s, servicePercent: Number(e.target.value) || 0 }))
                }
              />
            )}
          </Field>
        </div>
        <I18nFields
          fields={[
            { key: "tagline", label: "Слоган", multiline: true },
            { key: "address", label: "Адрес" },
          ]}
          values={{ tagline: v.content.tagline, address: v.contacts.address }}
          onChange={(k, val) =>
            setV((s) =>
              k === "address"
                ? { ...s, contacts: { ...s.contacts, address: val } }
                : { ...s, content: { ...s.content, tagline: val } },
            )
          }
        />
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-bold">Часы работы</h2>
        <p className="text-muted mb-3 text-[13px]">
          Если закрытие раньше открытия — значит после полуночи (18:00–04:00).
        </p>
        <ul className="flex flex-col gap-2">
          {WEEK_ORDER.map((d) => {
            const h = v.hours[d] ?? null;
            return (
              <li key={d} className="flex flex-wrap items-center gap-2">
                <span className="w-32 font-semibold">{DAYS[d]}</span>
                <Switch
                  label={`${DAYS[d]}: открыто`}
                  checked={Boolean(h)}
                  onChange={(on) => setDay(d, on ? { open: "18:00", close: "04:00" } : null)}
                />
                {h ? (
                  <>
                    <Input
                      aria-label={`${DAYS[d]}: открытие`}
                      type="time"
                      className="w-28"
                      value={h.open}
                      onChange={(e) => setDay(d, { ...h, open: e.target.value })}
                    />
                    <span aria-hidden="true">—</span>
                    <Input
                      aria-label={`${DAYS[d]}: закрытие`}
                      type="time"
                      className="w-28"
                      value={h.close}
                      onChange={(e) => setDay(d, { ...h, close: e.target.value })}
                    />
                  </>
                ) : (
                  <span className="text-muted">выходной</span>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Контакты</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Телефон для звонка" hint="+77001234567">
            {(p) => (
              <Input
                {...p}
                type="tel"
                value={v.contacts.phone}
                onChange={(e) => contact("phone", e.target.value.trim())}
              />
            )}
          </Field>
          <Field label="Телефон как показывать">
            {(p) => (
              <Input
                {...p}
                value={v.contacts.phoneDisplay}
                onChange={(e) => contact("phoneDisplay", e.target.value)}
              />
            )}
          </Field>
          {(
            [
              ["whatsapp", "WhatsApp (ссылка wa.me)"],
              ["instagram", "Instagram"],
              ["telegram", "Telegram"],
              ["map2gis", "2ГИС"],
              ["mapYandex", "Яндекс Карты"],
              ["review2gis", "Отзывы в 2ГИС"],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              {(p) => (
                <Input
                  {...p}
                  type="url"
                  inputMode="url"
                  placeholder="https://"
                  value={v.contacts[k] ?? ""}
                  onChange={(e) => contact(k, e.target.value.trim())}
                />
              )}
            </Field>
          ))}
          <Field label="Рейтинг 2ГИС">
            {(p) => (
              <Input
                {...p}
                value={v.contacts.rating ?? ""}
                onChange={(e) => contact("rating", e.target.value)}
              />
            )}
          </Field>
          <Field label="Количество отзывов">
            {(p) => (
              <Input
                {...p}
                value={v.contacts.reviewsCount ?? ""}
                onChange={(e) => contact("reviewsCount", e.target.value)}
              />
            )}
          </Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Тексты для гостей</h2>
        <p className="text-muted text-[13px]">Каждый пункт — с новой строки.</p>
        <I18nFields
          fields={[
            { key: "rules", label: "Правила заведения", multiline: true },
            { key: "karaokeRules", label: "Правила караоке", multiline: true },
            { key: "popularQueries", label: "Подсказки поиска", multiline: true },
          ]}
          values={lists}
          onChange={(k, val) => setLists((s) => ({ ...s, [k]: val }))}
        />
      </Card>

      <Card>
        <Field
          label="GoatCounter"
          hint="Код сайта на goatcounter.com — аналитика без cookies. Пусто — выключено."
        >
          {(p) => (
            <Input
              {...p}
              value={v.analytics.goatcounterCode ?? ""}
              onChange={(e) =>
                setV((s) => ({ ...s, analytics: { goatcounterCode: e.target.value.trim() } }))
              }
            />
          )}
        </Field>
      </Card>

      <div className="h-20" aria-hidden="true" />
      <div className="border-line bg-bg-2/95 fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t px-4 py-3 backdrop-blur lg:bottom-0 lg:left-60">
        <Button
          variant="primary"
          pending={pending}
          onClick={save}
          className="mx-auto flex w-full max-w-3xl"
        >
          Сохранить в черновик
        </Button>
      </div>
    </>
  );
}
