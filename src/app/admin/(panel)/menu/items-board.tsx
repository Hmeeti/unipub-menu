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
import { GripVertical, ImageOff, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { bulkItemsAction, reorderAction, setSoldOutAction } from "@/app/admin/_actions/menu";
import { Badge, Button, EmptyState, Input, Select, Switch, useRun } from "@/components/admin/ui";
import { useToast } from "@/components/ui/toast";
import { formatPrice } from "@/lib/domain/money";
import type { ImageAsset } from "@/lib/domain/types";
import { imageSrc } from "@/lib/images/loader";
import { cn } from "@/lib/utils";

export type BoardItem = {
  id: string;
  categoryId: string;
  name: string;
  alt: string;
  price: number;
  salePrice: number | null;
  soldOut: boolean;
  isActive: boolean;
  image: ImageAsset | null;
  missing: string[];
};

type Cat = { id: string; title: string; isActive: boolean };

const ANNOUNCE = {
  screenReaderInstructions: {
    draggable:
      "Чтобы переместить блюдо, нажмите пробел, стрелками выберите место и снова нажмите пробел. Escape — отмена.",
  },
  announcements: {
    onDragStart: () => "Блюдо взято",
    onDragOver: () => "",
    onDragEnd: ({ over }: { over: unknown }) => (over ? "Блюдо перемещено" : "Отменено"),
    onDragCancel: () => "Перемещение отменено",
  },
};

export function ItemsBoard({ items, categories }: { items: BoardItem[]; categories: Cat[] }) {
  const [cat, setCat] = useState<string>(categories[0]?.id ?? "");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [order, setOrder] = useState<Record<string, string[]>>({});
  const [moveTo, setMoveTo] = useState("");
  const { pending, run } = useRun();
  const toast = useToast((s) => s.show);

  const query = q.trim().toLowerCase();
  const visible = useMemo(() => {
    if (query) return items.filter((i) => `${i.name} ${i.alt}`.toLowerCase().includes(query));
    const inCat = items.filter((i) => i.categoryId === cat);
    const local = order[cat];
    if (!local) return inCat;
    const byId = new Map(inCat.map((i) => [i.id, i]));
    return local.map((id) => byId.get(id)).filter((i): i is BoardItem => Boolean(i));
  }, [items, cat, query, order]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = visible.map((i) => i.id);
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    setOrder((o) => ({ ...o, [cat]: next }));
    run(() => reorderAction("items", next), { success: "Порядок сохранён в черновик" });
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const bulk = (action: "sold_out" | "in_stock" | "hide" | "show" | "move") =>
    run(
      () =>
        bulkItemsAction({
          ids: [...selected],
          action,
          categoryId: action === "move" ? moveTo : undefined,
        }),
      {
        onOk: (d) => {
          setSelected(new Set());
          toast({ message: `Готово: ${d.count} шт.` });
        },
      },
    );

  const sortable = !query;
  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.categoryId, (m.get(i.categoryId) ?? 0) + 1);
    return m;
  }, [items]);

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Поиск блюда</span>
          <Search
            className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по названию или коду"
            className="pl-9"
          />
        </label>
      </div>
      {!query ? (
        <div
          className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4"
          role="tablist"
          aria-label="Категории"
        >
          {categories.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={cat === c.id}
              onClick={() => setCat(c.id)}
              className={cn(
                "min-h-10 shrink-0 rounded-full border px-4 text-[14px] font-semibold whitespace-nowrap",
                cat === c.id ? "bg-text text-bg border-transparent" : "border-line text-muted",
                !c.isActive && "line-through",
              )}
            >
              {c.title} <span className="opacity-60">{catCounts.get(c.id) ?? 0}</span>
            </button>
          ))}
        </div>
      ) : null}

      {visible.length ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={ANNOUNCE}
        >
          <SortableContext items={visible.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ul className="border-line bg-surface divide-line divide-y overflow-hidden rounded-2xl border">
              {visible.map((i) => (
                <Row
                  key={i.id}
                  item={i}
                  sortable={sortable}
                  selected={selected.has(i.id)}
                  onSelect={() => toggle(i.id)}
                  onSoldOut={(v) =>
                    run(() => setSoldOutAction(i.id, v), {
                      success: v ? `«${i.name}» в стоп-листе` : `«${i.name}» в наличии`,
                    })
                  }
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <EmptyState>{query ? "Ничего не найдено" : "В категории пока нет блюд"}</EmptyState>
      )}

      {selected.size ? (
        <div className="border-line bg-surface-2 shadow-sheet fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-3xl rounded-2xl border p-3 lg:bottom-4 lg:left-64">
          <div className="mb-2 flex items-center gap-2 text-[14px] font-semibold">
            Выбрано: {selected.size}
            <button
              className="text-muted ml-auto min-h-9 px-2 underline"
              onClick={() => setSelected(new Set())}
            >
              Снять выбор
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button pending={pending} onClick={() => bulk("sold_out")}>
              Нет в наличии
            </Button>
            <Button pending={pending} onClick={() => bulk("in_stock")}>
              В наличии
            </Button>
            <Button pending={pending} onClick={() => bulk("hide")}>
              Скрыть
            </Button>
            <Button pending={pending} onClick={() => bulk("show")}>
              Показать
            </Button>
            <div className="flex gap-2">
              <Select
                aria-label="Перенести в категорию"
                value={moveTo}
                onChange={(e) => setMoveTo(e.target.value)}
                className="w-auto"
              >
                <option value="">Перенести в…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </Select>
              <Button pending={pending} disabled={!moveTo} onClick={() => bulk("move")}>
                OK
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({
  item,
  sortable,
  selected,
  onSelect,
  onSoldOut,
}: {
  item: BoardItem;
  sortable: boolean;
  selected: boolean;
  onSelect: () => void;
  onSoldOut: (v: boolean) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: !sortable,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "bg-surface relative flex items-center gap-3 px-3 py-2",
        isDragging && "z-10 shadow-lg",
      )}
    >
      {sortable ? (
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Переместить «${item.name}»`}
          className="text-muted grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-lg active:cursor-grabbing"
        >
          <GripVertical className="size-5" aria-hidden="true" />
        </button>
      ) : null}
      <input
        type="checkbox"
        checked={selected}
        onChange={onSelect}
        aria-label={`Выбрать «${item.name}»`}
        className="accent-accent size-5 shrink-0"
      />
      <div className="bg-surface-2 relative size-12 shrink-0 overflow-hidden rounded-lg">
        {item.image ? (
          <Image src={imageSrc(item.image)} alt="" fill sizes="96px" className="object-cover" />
        ) : (
          <ImageOff className="text-muted absolute inset-0 m-auto size-5" aria-hidden="true" />
        )}
      </div>
      <Link href={`/admin/menu/${item.id}`} className="min-w-0 flex-1 py-1">
        <div
          className={cn(
            "truncate text-[15px] font-semibold",
            !item.isActive && "text-muted line-through",
          )}
        >
          {item.name}
        </div>
        <div className="text-muted flex flex-wrap items-center gap-1.5 text-[13px] tabular-nums">
          {item.salePrice !== null ? (
            <>
              <span className="text-pink-text font-bold">{formatPrice(item.salePrice)}</span>
              <s>{formatPrice(item.price)}</s>
            </>
          ) : (
            <span>{formatPrice(item.price)}</span>
          )}
          {!item.isActive ? <Badge>скрыто</Badge> : null}
          {item.missing.length ? <Badge tone="warn">нет {item.missing.join(", ")}</Badge> : null}
        </div>
      </Link>
      <div className="flex shrink-0 flex-col items-center gap-0.5">
        <Switch
          checked={!item.soldOut}
          onChange={(v) => onSoldOut(!v)}
          label={`«${item.name}» в наличии`}
        />
        <span
          className={cn("text-[11px] font-semibold", item.soldOut ? "text-danger" : "text-muted")}
        >
          {item.soldOut ? "нет" : "есть"}
        </span>
      </div>
    </li>
  );
}
