"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { deleteWaiterAction, saveWaiterAction } from "@/app/admin/_actions/venue";
import {
  Badge,
  Button,
  ConfirmButton,
  EmptyState,
  Field,
  Input,
  SwitchRow,
  useRun,
} from "@/components/admin/ui";
import { Sheet } from "@/components/ui/sheet";
import type { WaiterInput } from "@/lib/admin/schemas";
import { slugify } from "@/lib/admin/slug";

export function StaffBoard({ waiters }: { waiters: WaiterInput[] }) {
  const [editing, setEditing] = useState<{ value: WaiterInput; isNew: boolean } | null>(null);
  const { pending, run } = useRun();
  return (
    <>
      <div className="mb-3">
        <Button
          variant="primary"
          onClick={() =>
            setEditing({
              isNew: true,
              value: {
                id: "",
                name: "",
                telegramUserId: null,
                sort: (waiters.at(-1)?.sort ?? 0) + 10,
                isActive: true,
              },
            })
          }
        >
          <Plus className="size-4" aria-hidden="true" />
          Добавить официанта
        </Button>
      </div>
      {waiters.length ? (
        <ul className="border-line bg-surface divide-line divide-y overflow-hidden rounded-2xl border">
          {waiters.map((w) => (
            <li key={w.id}>
              <button
                onClick={() => setEditing({ isNew: false, value: w })}
                className="flex min-h-14 w-full items-center gap-3 px-4 text-left"
              >
                <span
                  className={`flex-1 font-semibold ${w.isActive ? "" : "text-muted line-through"}`}
                >
                  {w.name}
                </span>
                {w.telegramUserId ? (
                  <Badge tone="ok">Telegram</Badge>
                ) : (
                  <Badge tone="warn">без Telegram</Badge>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>Официантов нет</EmptyState>
      )}
      {editing ? (
        <Editor
          key={editing.value.id || "new"}
          initial={editing.value}
          isNew={editing.isNew}
          pending={pending}
          onClose={() => setEditing(null)}
          onSave={(v) =>
            run(() => saveWaiterAction(v, editing.isNew), { onOk: () => setEditing(null) })
          }
          onDelete={() =>
            run(() => deleteWaiterAction(editing.value.id), {
              success: "Удалено",
              onOk: () => setEditing(null),
            })
          }
        />
      ) : null}
    </>
  );
}

function Editor({
  initial,
  isNew,
  pending,
  onClose,
  onSave,
  onDelete,
}: {
  initial: WaiterInput;
  isNew: boolean;
  pending: boolean;
  onClose: () => void;
  onSave: (v: WaiterInput) => void;
  onDelete: () => void;
}) {
  const [v, setV] = useState(initial);
  const [tg, setTg] = useState(initial.telegramUserId ? String(initial.telegramUserId) : "");
  const tgValid = tg === "" || /^\d{1,16}$/.test(tg);
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? "Новый официант" : initial.name}
      closeLabel="Закрыть"
      footer={
        <div className="flex gap-2">
          <Button
            variant="primary"
            pending={pending}
            disabled={!tgValid}
            onClick={() => onSave({ ...v, telegramUserId: tg ? Number(tg) : null })}
            className="flex-1"
          >
            Сохранить
          </Button>
          {!isNew ? (
            <ConfirmButton pending={pending} onConfirm={onDelete} confirmLabel="Удалить?">
              Удалить
            </ConfirmButton>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-4 pt-2">
        <Field label="Имя" hint="Так его увидят гости">
          {(p) => (
            <Input
              {...p}
              value={v.name}
              maxLength={40}
              onChange={(e) => {
                const name = e.target.value;
                setV((s) => ({ ...s, name, ...(isNew ? { id: slugify(name) } : {}) }));
              }}
            />
          )}
        </Field>
        <Field
          label="Telegram ID"
          error={tgValid ? null : "Только цифры"}
          hint="Пусть официант напишет боту /id — бот ответит числом. Телефон не нужен и не хранится."
        >
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              value={tg}
              onChange={(e) => setTg(e.target.value.trim())}
              placeholder="123456789"
            />
          )}
        </Field>
        <SwitchRow
          label="На смене / доступен гостям"
          checked={v.isActive}
          onChange={(on) => setV((s) => ({ ...s, isActive: on }))}
        />
      </div>
    </Sheet>
  );
}
