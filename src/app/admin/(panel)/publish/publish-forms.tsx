"use client";

import { useRef, useState } from "react";
import { publishAction, rollbackAction } from "@/app/admin/_actions/menu";
import { importAction } from "@/app/admin/_actions/system";
import { Button, ConfirmButton, Field, Input, useRun } from "@/components/admin/ui";

export function PublishForm({ dirty }: { dirty: boolean }) {
  const [note, setNote] = useState("");
  const { pending, run } = useRun();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <Field label="Что изменилось (необязательно)" className="flex-1">
        {(p) => (
          <Input
            {...p}
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Новые цены на пиво"
          />
        )}
      </Field>
      <Button
        variant="primary"
        pending={pending}
        disabled={!dirty}
        onClick={() => run(() => publishAction(note), { onOk: () => setNote("") })}
      >
        Опубликовать
      </Button>
    </div>
  );
}

export function RollbackButton({ id }: { id: number }) {
  const { pending, run } = useRun();
  return (
    <ConfirmButton
      variant="secondary"
      pending={pending}
      confirmLabel="Откатить и опубликовать?"
      onConfirm={() => run(() => rollbackAction(id))}
    >
      Откатить
    </ConfirmButton>
  );
}

export function ImportForm() {
  const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const { pending, run } = useRun();
  const submit = () => {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    run(() => importAction(form), {
      onOk: () => {
        setFile(null);
        if (ref.current) ref.current.value = "";
      },
    });
  };
  return (
    <div className="border-line flex flex-col gap-2 border-t pt-3">
      <Field
        label="Импорт из JSON"
        hint="Заменит черновик: блюда и категории, которых нет в файле, будут скрыты (не удалены). Публикации не будет."
      >
        {(p) => (
          <input
            {...p}
            ref={ref}
            type="file"
            accept="application/json,.json"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="file:bg-surface-2 file:border-line file:text-text text-[14px] file:mr-3 file:min-h-11 file:rounded-xl file:border file:px-4 file:font-semibold"
          />
        )}
      </Field>
      <ConfirmButton
        variant="secondary"
        pending={pending}
        confirmLabel="Заменить черновик?"
        onConfirm={submit}
        className="w-fit"
      >
        Импортировать
      </ConfirmButton>
    </div>
  );
}
