"use server";

import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import {
  deleteRoom,
  deleteTable,
  deleteWaiter,
  reissueTable,
  saveFeatures,
  saveRoom,
  saveTable,
  saveVenue,
  saveWaiter,
} from "@/lib/admin/catalog";
import {
  featuresSchema,
  roomSchema,
  slug,
  tableSchema,
  venueSchema,
  waiterSchema,
  type RoomInput,
  type TableInput,
  type VenueInput,
  type WaiterInput,
} from "@/lib/admin/schemas";
import { runAction } from "@/lib/admin/session";
import { TABLE_CODE_RE } from "@/lib/domain/limits";
import type { VenueFeatures } from "@/lib/domain/types";

const tableCode = z.string().trim().toUpperCase().regex(TABLE_CODE_RE);

export async function saveRoomAction(raw: RoomInput, isNew: boolean) {
  return runAction(
    "manager",
    async ({ db, actor }) => {
      const input = roomSchema.parse(raw);
      await saveRoom(db, input, isNew);
      await audit(db, actor, "room.save", { type: "room", id: input.id }, { name: input.name.ru });
      return null;
    },
    { menu: true, message: "Зал сохранён" },
  );
}

export async function deleteRoomAction(id: string) {
  return runAction(
    "manager",
    async ({ db, actor }) => {
      const rid = slug.parse(id);
      await deleteRoom(db, rid);
      await audit(db, actor, "room.delete", { type: "room", id: rid });
      return null;
    },
    { menu: true },
  );
}

export async function saveTableAction(raw: TableInput, originalCode: string | null) {
  return runAction(
    "manager",
    async ({ db, actor }) => {
      const input = tableSchema.parse(raw);
      await saveTable(db, input, originalCode ? tableCode.parse(originalCode) : null);
      await audit(db, actor, "table.save", { type: "table", id: input.code });
      return null;
    },
    { message: "Стол сохранён" },
  );
}

export async function deleteTableAction(code: string) {
  return runAction("manager", async ({ db, actor }) => {
    const c = tableCode.parse(code);
    await deleteTable(db, c);
    await audit(db, actor, "table.delete", { type: "table", id: c });
    return null;
  });
}

export async function reissueTableAction(code: string) {
  return runAction(
    "manager",
    async ({ db, actor }) => {
      const c = tableCode.parse(code);
      const version = await reissueTable(db, c);
      await audit(db, actor, "table.reissue", { type: "table", id: c }, { version });
      return { version };
    },
    { message: "Старый QR больше не работает — распечатайте новый" },
  );
}

export async function saveWaiterAction(raw: WaiterInput, isNew: boolean) {
  return runAction(
    "manager",
    async ({ db, actor }) => {
      const input = waiterSchema.parse(raw);
      await saveWaiter(db, input, isNew);
      await audit(
        db,
        actor,
        "waiter.save",
        { type: "waiter", id: input.id },
        {
          name: input.name,
          telegram: Boolean(input.telegramUserId),
        },
      );
      return null;
    },
    { menu: true, message: "Официант сохранён" },
  );
}

export async function deleteWaiterAction(id: string) {
  return runAction(
    "manager",
    async ({ db, actor }) => {
      const wid = slug.parse(id);
      await deleteWaiter(db, wid);
      await audit(db, actor, "waiter.delete", { type: "waiter", id: wid });
      return null;
    },
    { menu: true },
  );
}

export async function saveVenueAction(raw: VenueInput) {
  return runAction(
    "manager",
    async ({ db, actor }) => {
      const input = venueSchema.parse(raw);
      await saveVenue(db, input);
      await audit(db, actor, "venue.save", { type: "venue", id: 1 });
      return null;
    },
    { message: "Сохранено в черновик — опубликуйте меню, чтобы гости увидели" },
  );
}

export async function saveFeaturesAction(raw: VenueFeatures) {
  return runAction(
    "manager",
    async ({ db, actor }) => {
      const input = featuresSchema.parse(raw);
      await saveFeatures(db, input);
      await audit(db, actor, "venue.features", { type: "venue", id: 1 }, input);
      return null;
    },
    { menu: true, message: "Применено сразу" },
  );
}
