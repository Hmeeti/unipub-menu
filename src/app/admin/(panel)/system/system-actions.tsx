"use client";

import { botTestAction, retryOutboxAction } from "@/app/admin/_actions/system";
import { Button, useRun } from "@/components/admin/ui";
import { useToast } from "@/components/ui/toast";

export function BotTestButton() {
  const { pending, run } = useRun();
  const show = useToast((s) => s.show);
  return (
    <Button
      className="mt-1 w-fit"
      pending={pending}
      onClick={() =>
        run(() => botTestAction(), {
          onOk: ({ mock }) =>
            show({
              message: mock
                ? "Тестовый режим: сообщение записано в лог сервера"
                : "Сообщение отправлено в группу персонала",
            }),
        })
      }
    >
      Отправить тестовое сообщение
    </Button>
  );
}

export function RetryButton({ ids, label }: { ids: number[] | "all"; label: string }) {
  const { pending, run } = useRun();
  return (
    <Button
      className="w-fit"
      pending={pending}
      onClick={() =>
        run(() => retryOutboxAction(ids), { success: "Отправлено в очередь повторно" })
      }
    >
      {label}
    </Button>
  );
}
