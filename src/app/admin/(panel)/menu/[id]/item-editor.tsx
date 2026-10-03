"use client";

import { ArrowLeft, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { deleteItemAction, saveItemAction } from "@/app/admin/_actions/menu";
import { I18nFields, ImagesField, ScheduleEditor, type Langs } from "@/components/admin/fields";
import {
  Badge,
  Button,
  Card,
  ConfirmButton,
  Field,
  Input,
  Select,
  SwitchRow,
  useRun,
} from "@/components/admin/ui";
import type { ItemInput } from "@/lib/admin/schemas";
import { ITEM_FLAGS, type ItemFlag } from "@/lib/domain/types";
import { slugify } from "@/lib/admin/slug";
import { cn } from "@/lib/utils";

const FLAG_LABEL: Record<ItemFlag, string> = {
  hit: "Хит",
  new: "Новинка",
  spicy: "Острое",
  veg: "Вегетарианское",
  gf: "Без глютена",
  share: "На компанию",
};

type Opt = { id: string; title: string };

export function ItemEditor({
  isNew,
  initial,
  soldOut,
  categories,
  allergens,
  others,
}: {
  isNew: boolean;
  initial: ItemInput;
  soldOut: boolean;
  categories: Opt[];
  allergens: Opt[];
  others: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [v, setV] = useState<ItemInput>(initial);
  const [idTouched, setIdTouched] = useState(!isNew);
  const [pairQuery, setPairQuery] = useState("");
  const { pending, run } = useRun();
  const set = <K extends keyof ItemInput>(k: K, val: ItemInput[K]) =>
    setV((s) => ({ ...s, [k]: val }));

  const texts: Record<string, Langs> = {
    name: v.name,
    description: v.description,
    ingredients: v.ingredients,
    weight: v.weight ?? { ru: "" },
    cookTime: v.cookTime ?? { ru: "" },
  };
  const onText = (key: string, val: Langs) => {
    if (key === "name" && isNew && !idTouched)
      setV((s) => ({ ...s, name: val, id: slugify(val.ru) }));
    else setV((s) => ({ ...s, [key]: val }));
  };

  const otherById = useMemo(() => new Map(others.map((o) => [o.id, o.name])), [others]);
  const pairMatches = pairQuery.trim()
    ? others
        .filter(
          (o) =>
            !v.pairWith.includes(o.id) &&
            o.name.toLowerCase().includes(pairQuery.trim().toLowerCase()),
        )
        .slice(0, 6)
    : [];

  const save = () =>
    run(
      () =>
        saveItemAction(
          {
            ...v,
            weight: v.weight?.ru || v.weight?.kk || v.weight?.en ? v.weight : null,
            cookTime: v.cookTime?.ru || v.cookTime?.kk || v.cookTime?.en ? v.cookTime : null,
          },
          isNew,
        ),
      { onOk: (d) => isNew && router.replace(`/admin/menu/${d.id}`) },
    );

  return (
    <div className="pb-24">
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/admin/menu"
          className="text-muted inline-flex min-h-11 items-center gap-1 font-semibold"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Блюда
        </Link>
        {soldOut ? <Badge tone="danger">в стоп-листе</Badge> : null}
      </div>
      <h1 className="mb-5 text-2xl font-extrabold">{isNew ? "Новое блюдо" : v.name.ru || v.id}</h1>

      <div className="flex flex-col gap-4">
        <I18nFields
          fields={[
            { key: "name", label: "Название", required: true },
            { key: "description", label: "Описание", multiline: true },
            { key: "ingredients", label: "Состав", multiline: true, placeholder: "через запятую" },
            { key: "weight", label: "Вес / объём", placeholder: "320 г" },
            { key: "cookTime", label: "Время приготовления", placeholder: "15 мин" },
          ]}
          values={texts}
          onChange={onText}
        />

        <Card className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Код блюда"
            hint={
              isNew ? "Латиницей; появится в ссылке на блюдо. Потом не меняется." : "Не меняется"
            }
          >
            {(p) => (
              <Input
                {...p}
                value={v.id}
                readOnly={!isNew}
                onChange={(e) => {
                  setIdTouched(true);
                  set("id", e.target.value.toLowerCase());
                }}
                autoCapitalize="none"
                spellCheck={false}
              />
            )}
          </Field>
          <Field label="Категория">
            {(p) => (
              <Select
                {...p}
                value={v.categoryId}
                onChange={(e) => set("categoryId", e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Цена, ₸">
            {(p) => (
              <Input
                {...p}
                type="number"
                inputMode="numeric"
                min={0}
                step={10}
                value={v.price || ""}
                onChange={(e) => set("price", Math.max(0, Math.round(Number(e.target.value) || 0)))}
              />
            )}
          </Field>
          <Field label="Цена по акции, ₸" hint="Пусто — без акции">
            {(p) => (
              <Input
                {...p}
                type="number"
                inputMode="numeric"
                min={0}
                step={10}
                value={v.salePrice ?? ""}
                onChange={(e) =>
                  set(
                    "salePrice",
                    e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))),
                  )
                }
              />
            )}
          </Field>
          {v.salePrice !== null ? (
            <div className="sm:col-span-2">
              <SwitchRow
                label="Акция по расписанию"
                hint="Выключено — акционная цена действует всегда"
                checked={v.saleSchedule !== null}
                onChange={(on) =>
                  set(
                    "saleSchedule",
                    on ? { days: [1, 2, 3, 4], from: "12:00", to: "16:00" } : null,
                  )
                }
              />
              {v.saleSchedule ? (
                <div className="mt-3">
                  <ScheduleEditor value={v.saleSchedule} onChange={(s) => set("saleSchedule", s)} />
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>

        <Card>
          <h2 className="mb-2 font-bold">Фото</h2>
          <ImagesField images={v.images} onChange={(imgs) => set("images", imgs)} name={v.id} />
        </Card>

        <Card className="flex flex-col gap-4">
          <fieldset>
            <legend className="text-muted mb-1.5 text-[13px] font-semibold">Метки</legend>
            <div className="flex flex-wrap gap-1.5">
              {ITEM_FLAGS.map((f) => {
                const on = v.flags.includes(f);
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set("flags", on ? v.flags.filter((x) => x !== f) : [...v.flags, f])
                    }
                    className={cn(
                      "min-h-10 rounded-xl border px-3 text-[14px] font-semibold",
                      on ? "bg-accent text-on-accent border-transparent" : "border-line text-muted",
                    )}
                  >
                    {FLAG_LABEL[f]}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <Field label="Острота">
            {(p) => (
              <Select
                {...p}
                value={v.spicyLevel}
                onChange={(e) => set("spicyLevel", Number(e.target.value))}
              >
                <option value={0}>Не острое</option>
                <option value={1}>🌶 Слегка</option>
                <option value={2}>🌶🌶 Остро</option>
                <option value={3}>🌶🌶🌶 Очень остро</option>
              </Select>
            )}
          </Field>
          <fieldset>
            <legend className="text-muted mb-1.5 text-[13px] font-semibold">Аллергены</legend>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
              {allergens.map((a) => (
                <label key={a.id} className="flex min-h-10 items-center gap-2 text-[15px]">
                  <input
                    type="checkbox"
                    className="accent-accent size-5"
                    checked={v.allergens.includes(a.id)}
                    onChange={(e) =>
                      set(
                        "allergens",
                        e.target.checked
                          ? [...v.allergens, a.id]
                          : v.allergens.filter((x) => x !== a.id),
                      )
                    }
                  />
                  {a.title}
                </label>
              ))}
            </div>
          </fieldset>
        </Card>

        <Card>
          <h2 className="mb-1 font-bold">«С этим заказывают»</h2>
          <p className="text-muted mb-3 text-[13px]">
            До 8 блюд. Пусто — подберём автоматически по категориям.
          </p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {v.pairWith.map((id) => (
              <span
                key={id}
                className="bg-surface-2 inline-flex min-h-9 items-center gap-1 rounded-full pr-1 pl-3 text-[14px]"
              >
                {otherById.get(id) ?? id}
                <button
                  type="button"
                  aria-label={`Убрать «${otherById.get(id) ?? id}»`}
                  className="grid size-8 place-items-center rounded-full"
                  onClick={() =>
                    set(
                      "pairWith",
                      v.pairWith.filter((x) => x !== id),
                    )
                  }
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
          {v.pairWith.length < 8 ? (
            <Field label="Добавить блюдо">
              {(p) => (
                <Input
                  {...p}
                  type="search"
                  value={pairQuery}
                  onChange={(e) => setPairQuery(e.target.value)}
                  placeholder="Начните вводить название"
                />
              )}
            </Field>
          ) : null}
          {pairMatches.length ? (
            <ul className="border-line mt-2 overflow-hidden rounded-xl border">
              {pairMatches.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="hover:bg-surface-2 min-h-11 w-full px-3 text-left text-[15px]"
                    onClick={() => {
                      set("pairWith", [...v.pairWith, o.id]);
                      setPairQuery("");
                    }}
                  >
                    {o.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card>
          <SwitchRow
            label="Показывать в меню"
            hint="Скрытое блюдо остаётся в админке, гости его не видят"
            checked={v.isActive}
            onChange={(on) => set("isActive", on)}
          />
        </Card>
      </div>

      <div className="border-line bg-bg-2/95 fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t px-4 py-3 backdrop-blur lg:bottom-0 lg:left-60">
        <div className="mx-auto flex max-w-5xl gap-2">
          <Button
            variant="primary"
            pending={pending}
            onClick={save}
            className="flex-1 sm:flex-none"
          >
            {isNew ? "Создать блюдо" : "Сохранить"}
          </Button>
          {!isNew ? (
            <ConfirmButton
              pending={pending}
              confirmLabel="Удалить навсегда?"
              onConfirm={() =>
                run(() => deleteItemAction(v.id), { onOk: () => router.replace("/admin/menu") })
              }
            >
              Удалить
            </ConfirmButton>
          ) : null}
        </div>
      </div>
    </div>
  );
}
