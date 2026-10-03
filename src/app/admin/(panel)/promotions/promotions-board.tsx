"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { deletePromotionAction, savePromotionAction } from "@/app/admin/_actions/menu";
import { I18nFields, ImagesField, ScheduleEditor } from "@/components/admin/fields";
import {
  Badge,
  Button,
  ConfirmButton,
  EmptyState,
  Field,
  Input,
  Select,
  SwitchRow,
  useRun,
} from "@/components/admin/ui";
import { Sheet } from "@/components/ui/sheet";
import type { PromotionInput } from "@/lib/admin/schemas";

type Promo = PromotionInput & { id: number; liveNow: boolean };

const DAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

function scheduleText(p: PromotionInput["schedule"]) {
  const parts: string[] = [];
  if (p.days?.length) parts.push(p.days.map((d) => DAYS[d]).join(", "));
  if (p.from && p.to) parts.push(`${p.from}–${p.to}`);
  if (p.startDate || p.endDate) parts.push(`${p.startDate ?? "…"} → ${p.endDate ?? "…"}`);
  return parts.join(" · ") || "всегда";
}

export function PromotionsBoard({
  promotions,
  items,
}: {
  promotions: Promo[];
  items: { id: string; name: string }[];
}) {
  const [editing, setEditing] = useState<PromotionInput | null>(null);
  const { pending, run } = useRun();
  const names = new Map(items.map((i) => [i.id, i.name]));
  return (
    <>
      <div className="mb-3">
        <Button
          variant="primary"
          onClick={() =>
            setEditing({
              id: null,
              kind: "banner",
              title: { ru: "" },
              body: { ru: "" },
              itemId: null,
              image: null,
              link: null,
              schedule: {},
              sort: (promotions.at(-1)?.sort ?? 0) + 10,
              isActive: true,
            })
          }
        >
          <Plus className="size-4" aria-hidden="true" />
          Новая акция
        </Button>
      </div>
      {promotions.length ? (
        <ul className="flex flex-col gap-2">
          {promotions.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setEditing(p)}
                className="border-line bg-surface flex w-full flex-col gap-1 rounded-2xl border p-4 text-left"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[16px] font-bold">{p.title.ru}</span>
                  {p.kind === "dish_of_day" ? <Badge tone="accent">Блюдо дня</Badge> : null}
                  {p.liveNow ? (
                    <Badge tone="ok">показывается сейчас</Badge>
                  ) : p.isActive ? (
                    <Badge>ждёт расписания</Badge>
                  ) : (
                    <Badge>выключена</Badge>
                  )}
                </div>
                <div className="text-muted text-[13px]">
                  {scheduleText(p.schedule)}
                  {p.itemId ? ` · ${names.get(p.itemId) ?? p.itemId}` : ""}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>Акций пока нет</EmptyState>
      )}
      {editing ? (
        <Editor
          key={editing.id ?? "new"}
          initial={editing}
          items={items}
          pending={pending}
          onClose={() => setEditing(null)}
          onSave={(v) => run(() => savePromotionAction(v), { onOk: () => setEditing(null) })}
          onDelete={
            editing.id
              ? () =>
                  run(() => deletePromotionAction(editing.id!), {
                    success: "Акция удалена",
                    onOk: () => setEditing(null),
                  })
              : undefined
          }
        />
      ) : null}
    </>
  );
}

function Editor({
  initial,
  items,
  pending,
  onClose,
  onSave,
  onDelete,
}: {
  initial: PromotionInput;
  items: { id: string; name: string }[];
  pending: boolean;
  onClose: () => void;
  onSave: (v: PromotionInput) => void;
  onDelete?: () => void;
}) {
  const [v, setV] = useState(initial);
  const set = <K extends keyof PromotionInput>(k: K, val: PromotionInput[K]) =>
    setV((s) => ({ ...s, [k]: val }));
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial.id ? "Акция" : "Новая акция"}
      closeLabel="Закрыть"
      footer={
        <div className="flex gap-2">
          <Button variant="primary" pending={pending} onClick={() => onSave(v)} className="flex-1">
            Сохранить
          </Button>
          {onDelete ? (
            <ConfirmButton pending={pending} onConfirm={onDelete} confirmLabel="Удалить?">
              Удалить
            </ConfirmButton>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-4 pt-2">
        <Field label="Тип">
          {(p) => (
            <Select
              {...p}
              value={v.kind}
              onChange={(e) => set("kind", e.target.value as PromotionInput["kind"])}
            >
              <option value="banner">Баннер</option>
              <option value="dish_of_day">Блюдо дня</option>
            </Select>
          )}
        </Field>
        <I18nFields
          fields={[
            { key: "title", label: "Заголовок", required: true },
            { key: "body", label: "Текст", multiline: true },
          ]}
          values={{ title: v.title, body: v.body }}
          onChange={(k, val) => set(k as "title" | "body", val)}
        />
        <Field
          label="Блюдо"
          hint={
            v.kind === "dish_of_day"
              ? "Обязательно для «Блюда дня»"
              : "Необязательно: баннер откроет блюдо"
          }
        >
          {(p) => (
            <Select
              {...p}
              value={v.itemId ?? ""}
              onChange={(e) => set("itemId", e.target.value || null)}
            >
              <option value="">— без блюда —</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Ссылка" hint="Только https://">
          {(p) => (
            <Input
              {...p}
              type="url"
              inputMode="url"
              value={v.link ?? ""}
              onChange={(e) => set("link", e.target.value.trim() || null)}
              placeholder="https://"
            />
          )}
        </Field>
        <div>
          <div className="text-muted mb-1.5 text-[13px] font-semibold">Картинка</div>
          <ImagesField
            images={v.image ? [v.image] : []}
            onChange={(imgs) => set("image", imgs[0] ?? null)}
            name="promo"
            folder="promo"
            max={1}
          />
        </div>
        <div>
          <div className="mb-2 font-bold">Расписание</div>
          <ScheduleEditor value={v.schedule} onChange={(s) => set("schedule", s)} />
        </div>
        <Field label="Порядок" hint="Меньше — выше">
          {(p) => (
            <Input
              {...p}
              type="number"
              inputMode="numeric"
              value={v.sort}
              onChange={(e) => set("sort", Math.max(0, Math.round(Number(e.target.value) || 0)))}
            />
          )}
        </Field>
        <SwitchRow label="Включена" checked={v.isActive} onChange={(on) => set("isActive", on)} />
      </div>
    </Sheet>
  );
}
