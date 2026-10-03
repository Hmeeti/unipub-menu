"use client";

import { Plus, QrCode } from "lucide-react";
import { useState } from "react";
import {
  deleteRoomAction,
  deleteTableAction,
  reissueTableAction,
  saveRoomAction,
  saveTableAction,
} from "@/app/admin/_actions/venue";
import { I18nFields } from "@/components/admin/fields";
import {
  Badge,
  Button,
  Card,
  ConfirmButton,
  EmptyState,
  Field,
  Input,
  Select,
  SwitchRow,
  useRun,
} from "@/components/admin/ui";
import { Sheet } from "@/components/ui/sheet";
import type { RoomInput, TableInput } from "@/lib/admin/schemas";
import { slugify } from "@/lib/admin/slug";

type Table = TableInput & { tokenVersion: number };

export function PlacesBoard({ rooms, tables }: { rooms: RoomInput[]; tables: Table[] }) {
  const [room, setRoom] = useState<{ value: RoomInput; isNew: boolean } | null>(null);
  const [table, setTable] = useState<{
    value: TableInput;
    original: string | null;
    version?: number;
  } | null>(null);
  const { pending, run } = useRun();
  const roomName = new Map(rooms.map((r) => [r.id, r.name.ru]));
  const groups = [
    ...rooms.map((r) => ({ id: r.id as string | null, name: r.name.ru })),
    { id: null, name: "Без зала" },
  ]
    .map((g) => ({ ...g, tables: tables.filter((t) => (t.roomId ?? null) === g.id) }))
    .filter((g) => g.tables.length || g.id);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">Залы</h2>
          <Button
            onClick={() =>
              setRoom({
                isNew: true,
                value: {
                  id: "",
                  name: { ru: "" },
                  description: { ru: "" },
                  capacity: null,
                  sort: (rooms.at(-1)?.sort ?? 0) + 10,
                  isActive: true,
                },
              })
            }
          >
            <Plus className="size-4" aria-hidden="true" />
            Зал
          </Button>
        </div>
        {rooms.length ? (
          <ul className="border-line bg-surface divide-line divide-y overflow-hidden rounded-2xl border">
            {rooms.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setRoom({ isNew: false, value: r })}
                  className="flex min-h-14 w-full items-center gap-3 px-4 text-left"
                >
                  <span className="flex-1 font-semibold">{r.name.ru}</span>
                  {r.capacity ? (
                    <span className="text-muted text-[13px]">до {r.capacity} гостей</span>
                  ) : null}
                  {!r.isActive ? <Badge>скрыт</Badge> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>Залов нет</EmptyState>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">Столы</h2>
          <Button
            onClick={() =>
              setTable({
                original: null,
                value: {
                  code: "",
                  roomId: rooms[0]?.id ?? null,
                  label: null,
                  sort: (tables.at(-1)?.sort ?? 0) + 1,
                  isActive: true,
                },
              })
            }
          >
            <Plus className="size-4" aria-hidden="true" />
            Стол
          </Button>
        </div>
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <Card key={g.id ?? "none"} className="p-3">
              <h3 className="text-muted mb-2 px-1 text-[13px] font-bold tracking-wide uppercase">
                {g.name}
              </h3>
              {g.tables.length ? (
                <ul className="flex flex-wrap gap-2">
                  {g.tables.map((t) => (
                    <li key={t.code}>
                      <button
                        onClick={() =>
                          setTable({ original: t.code, value: t, version: t.tokenVersion })
                        }
                        className={`border-line bg-bg-2 flex min-h-12 min-w-16 flex-col items-center justify-center rounded-xl border px-3 ${t.isActive ? "" : "opacity-50"}`}
                      >
                        <span className="text-[16px] font-extrabold">{t.code}</span>
                        {t.label ? <span className="text-muted text-[11px]">{t.label}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted px-1 text-[14px]">Нет столов</p>
              )}
            </Card>
          ))}
        </div>
      </section>

      {room ? (
        <RoomEditor
          key={room.value.id || "new"}
          initial={room.value}
          isNew={room.isNew}
          pending={pending}
          onClose={() => setRoom(null)}
          onSave={(v) => run(() => saveRoomAction(v, room.isNew), { onOk: () => setRoom(null) })}
          onDelete={() =>
            run(() => deleteRoomAction(room.value.id), {
              success: "Зал удалён",
              onOk: () => setRoom(null),
            })
          }
        />
      ) : null}
      {table ? (
        <TableEditor
          key={table.original ?? "new"}
          initial={table.value}
          original={table.original}
          version={table.version}
          rooms={rooms.map((r) => ({ id: r.id, name: roomName.get(r.id) ?? r.id }))}
          pending={pending}
          onClose={() => setTable(null)}
          onSave={(v) =>
            run(() => saveTableAction(v, table.original), { onOk: () => setTable(null) })
          }
          onDelete={() =>
            run(() => deleteTableAction(table.original!), {
              success: "Стол удалён",
              onOk: () => setTable(null),
            })
          }
          onReissue={() =>
            run(() => reissueTableAction(table.original!), {
              onOk: (d) => setTable((t) => (t ? { ...t, version: d.version } : t)),
            })
          }
        />
      ) : null}
    </div>
  );
}

function RoomEditor({
  initial,
  isNew,
  pending,
  onClose,
  onSave,
  onDelete,
}: {
  initial: RoomInput;
  isNew: boolean;
  pending: boolean;
  onClose: () => void;
  onSave: (v: RoomInput) => void;
  onDelete: () => void;
}) {
  const [v, setV] = useState(initial);
  const [idTouched, setIdTouched] = useState(!isNew);
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? "Новый зал" : initial.name.ru}
      closeLabel="Закрыть"
      footer={
        <div className="flex gap-2">
          <Button variant="primary" pending={pending} onClick={() => onSave(v)} className="flex-1">
            Сохранить
          </Button>
          {!isNew ? (
            <ConfirmButton pending={pending} onConfirm={onDelete} confirmLabel="Удалить зал?">
              Удалить
            </ConfirmButton>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-4 pt-2">
        <I18nFields
          fields={[
            { key: "name", label: "Название", required: true },
            { key: "description", label: "Описание", multiline: true },
          ]}
          values={{ name: v.name, description: v.description }}
          onChange={(k, val) =>
            setV((s) => ({
              ...s,
              [k]: val,
              ...(k === "name" && isNew && !idTouched ? { id: slugify(val.ru) } : {}),
            }))
          }
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Код">
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
          <Field label="Вместимость">
            {(p) => (
              <Input
                {...p}
                type="number"
                inputMode="numeric"
                value={v.capacity ?? ""}
                onChange={(e) =>
                  setV((s) => ({
                    ...s,
                    capacity: e.target.value
                      ? Math.max(1, Math.round(Number(e.target.value)))
                      : null,
                  }))
                }
              />
            )}
          </Field>
        </div>
        <SwitchRow
          label="Доступен для брони и песен"
          checked={v.isActive}
          onChange={(on) => setV((s) => ({ ...s, isActive: on }))}
        />
      </div>
    </Sheet>
  );
}

function TableEditor({
  initial,
  original,
  version,
  rooms,
  pending,
  onClose,
  onSave,
  onDelete,
  onReissue,
}: {
  initial: TableInput;
  original: string | null;
  version?: number;
  rooms: { id: string; name: string }[];
  pending: boolean;
  onClose: () => void;
  onSave: (v: TableInput) => void;
  onDelete: () => void;
  onReissue: () => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={original ? `Стол ${original}` : "Новый стол"}
      closeLabel="Закрыть"
      footer={
        <div className="flex gap-2">
          <Button variant="primary" pending={pending} onClick={() => onSave(v)} className="flex-1">
            Сохранить
          </Button>
          {original ? (
            <ConfirmButton pending={pending} onConfirm={onDelete} confirmLabel="Удалить стол?">
              Удалить
            </ConfirmButton>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-4 pt-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Номер" hint={original ? "Не меняется" : "12, VIP1 — латиница и цифры"}>
            {(p) => (
              <Input
                {...p}
                value={v.code}
                readOnly={Boolean(original)}
                autoCapitalize="characters"
                maxLength={8}
                onChange={(e) => setV((s) => ({ ...s, code: e.target.value.toUpperCase() }))}
              />
            )}
          </Field>
          <Field label="Зал">
            {(p) => (
              <Select
                {...p}
                value={v.roomId ?? ""}
                onChange={(e) => setV((s) => ({ ...s, roomId: e.target.value || null }))}
              >
                <option value="">— без зала —</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Подпись" hint="Необязательно: «у окна», «терраса»">
          {(p) => (
            <Input
              {...p}
              value={v.label ?? ""}
              onChange={(e) => setV((s) => ({ ...s, label: e.target.value || null }))}
            />
          )}
        </Field>
        <SwitchRow
          label="Активен"
          hint="Неактивный стол не принимает заказы"
          checked={v.isActive}
          onChange={(on) => setV((s) => ({ ...s, isActive: on }))}
        />
        {original ? (
          <Card className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <QrCode className="text-gold size-5" aria-hidden="true" />
              <span className="font-bold">QR-код</span>
              <Badge>версия {version}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={`/admin/api/qr?codes=${encodeURIComponent(original)}`}
                download
                className="border-line bg-surface-2 inline-flex min-h-11 items-center rounded-xl border px-4 font-semibold"
              >
                Скачать PDF
              </a>
              <ConfirmButton
                pending={pending}
                onConfirm={onReissue}
                variant="secondary"
                confirmLabel="Старый QR перестанет работать. Да?"
              >
                Перевыпустить QR
              </ConfirmButton>
            </div>
            <p className="text-muted text-[13px]">
              Перевыпуск нужен, если QR украли или сфотографировали: старая наклейка перестанет
              работать.
            </p>
          </Card>
        ) : null}
      </div>
    </Sheet>
  );
}
