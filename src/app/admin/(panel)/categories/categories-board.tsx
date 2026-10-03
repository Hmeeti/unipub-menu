"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus } from "lucide-react";
import { useState } from "react";
import { deleteCategoryAction, reorderAction, saveCategoryAction } from "@/app/admin/_actions/menu";
import { I18nFields } from "@/components/admin/fields";
import {
  Badge,
  Button,
  ConfirmButton,
  Field,
  Input,
  SwitchRow,
  useRun,
} from "@/components/admin/ui";
import { CATEGORY_ICON_NAMES, CategoryIcon } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
import type { CategoryInput } from "@/lib/admin/schemas";
import { slugify } from "@/lib/admin/slug";
import type { I18nText } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

type Cat = { id: string; icon: string; title: I18nText; isActive: boolean; itemCount: number };

export function CategoriesBoard({ categories }: { categories: Cat[] }) {
  const [order, setOrder] = useState<string[] | null>(null);
  const [editing, setEditing] = useState<{ value: CategoryInput; isNew: boolean } | null>(null);
  const { pending, run } = useRun();
  const byId = new Map(categories.map((c) => [c.id, c]));
  const list = order
    ? order.map((id) => byId.get(id)).filter((c): c is Cat => Boolean(c))
    : categories;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = list.map((c) => c.id);
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    setOrder(next);
    run(() => reorderAction("categories", next), { success: "Порядок сохранён в черновик" });
  };

  return (
    <>
      <div className="mb-3">
        <Button
          variant="primary"
          onClick={() =>
            setEditing({
              isNew: true,
              value: { id: "", icon: "utensils", title: { ru: "" }, isActive: true },
            })
          }
        >
          <Plus className="size-4" aria-hidden="true" />
          Новая категория
        </Button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={list.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <ul className="border-line bg-surface divide-line divide-y overflow-hidden rounded-2xl border">
            {list.map((c) => (
              <Row
                key={c.id}
                cat={c}
                onEdit={() =>
                  setEditing({
                    isNew: false,
                    value: { id: c.id, icon: c.icon, title: c.title, isActive: c.isActive },
                  })
                }
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {editing ? (
        <Editor
          key={editing.value.id || "new"}
          initial={editing.value}
          isNew={editing.isNew}
          canDelete={!editing.isNew && (byId.get(editing.value.id)?.itemCount ?? 0) === 0}
          pending={pending}
          onClose={() => setEditing(null)}
          onSave={(v) =>
            run(() => saveCategoryAction(v, editing.isNew), { onOk: () => setEditing(null) })
          }
          onDelete={() =>
            run(() => deleteCategoryAction(editing.value.id), {
              success: "Категория удалена",
              onOk: () => setEditing(null),
            })
          }
        />
      ) : null}
    </>
  );
}

function Row({ cat, onEdit }: { cat: Cat; onEdit: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cat.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "bg-surface relative flex items-center gap-3 px-3 py-2",
        isDragging && "z-10 shadow-lg",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Переместить «${cat.title.ru}»`}
        className="text-muted grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-lg"
      >
        <GripVertical className="size-5" aria-hidden="true" />
      </button>
      <CategoryIcon name={cat.icon} className="text-gold size-5 shrink-0" />
      <button onClick={onEdit} className="min-h-11 min-w-0 flex-1 text-left">
        <div
          className={cn(
            "truncate text-[15px] font-semibold",
            !cat.isActive && "text-muted line-through",
          )}
        >
          {cat.title.ru}
        </div>
        <div className="text-muted text-[13px]">
          {cat.itemCount} блюд · {cat.id}
        </div>
      </button>
      {!cat.isActive ? <Badge>скрыта</Badge> : null}
      {!cat.title.kk || !cat.title.en ? <Badge tone="warn">нет перевода</Badge> : null}
    </li>
  );
}

function Editor({
  initial,
  isNew,
  canDelete,
  pending,
  onClose,
  onSave,
  onDelete,
}: {
  initial: CategoryInput;
  isNew: boolean;
  canDelete: boolean;
  pending: boolean;
  onClose: () => void;
  onSave: (v: CategoryInput) => void;
  onDelete: () => void;
}) {
  const [v, setV] = useState(initial);
  const [idTouched, setIdTouched] = useState(!isNew);
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? "Новая категория" : `Категория: ${initial.title.ru}`}
      closeLabel="Закрыть"
      footer={
        <div className="flex gap-2">
          <Button variant="primary" pending={pending} onClick={() => onSave(v)} className="flex-1">
            Сохранить
          </Button>
          {canDelete ? (
            <ConfirmButton pending={pending} onConfirm={onDelete} confirmLabel="Удалить?">
              Удалить
            </ConfirmButton>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-4 pt-2">
        <I18nFields
          fields={[{ key: "title", label: "Название", required: true }]}
          values={{ title: v.title }}
          onChange={(_k, title) =>
            setV((s) => ({
              ...s,
              title,
              ...(isNew && !idTouched ? { id: slugify(title.ru) } : {}),
            }))
          }
        />
        <Field label="Код" hint={isNew ? "Латиницей, потом не меняется" : undefined}>
          {(p) => (
            <Input
              {...p}
              value={v.id}
              readOnly={!isNew}
              onChange={(e) => {
                setIdTouched(true);
                setV((s) => ({ ...s, id: e.target.value.toLowerCase() }));
              }}
            />
          )}
        </Field>
        <fieldset>
          <legend className="text-muted mb-1.5 text-[13px] font-semibold">Иконка</legend>
          <div className="grid grid-cols-6 gap-1.5">
            {CATEGORY_ICON_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={v.icon === name}
                aria-label={name}
                onClick={() => setV((s) => ({ ...s, icon: name }))}
                className={cn(
                  "grid min-h-11 place-items-center rounded-xl border",
                  v.icon === name ? "border-pink bg-accent/15" : "border-line",
                )}
              >
                <CategoryIcon name={name} className="size-5" />
              </button>
            ))}
          </div>
        </fieldset>
        <SwitchRow
          label="Показывать гостям"
          checked={v.isActive}
          onChange={(on) => setV((s) => ({ ...s, isActive: on }))}
        />
      </div>
    </Sheet>
  );
}
