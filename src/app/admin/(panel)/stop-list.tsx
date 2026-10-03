"use client";

import { setSoldOutAction } from "@/app/admin/_actions/menu";
import { Button, EmptyState, useRun } from "@/components/admin/ui";

export function StopList({
  items,
  canEdit,
}: {
  items: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const { pending, run } = useRun();
  if (!items.length) return <EmptyState>Стоп-лист пуст — всё в наличии</EmptyState>;
  return (
    <ul className="divide-line divide-y">
      {items.map((i) => (
        <li key={i.id} className="flex min-h-12 items-center gap-3 py-1">
          <span className="min-w-0 flex-1 truncate text-[15px]">{i.name}</span>
          {canEdit ? (
            <Button
              pending={pending}
              onClick={() =>
                run(() => setSoldOutAction(i.id, false), { success: `«${i.name}» снова в продаже` })
              }
            >
              Вернуть
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
