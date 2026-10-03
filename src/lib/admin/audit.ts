import type { Db, Tx } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";

export type Actor = { id: number; login: string; ipHash?: string | null };

export async function audit(
  db: Db | Tx,
  actor: Actor | null,
  action: string,
  entity?: { type: string; id?: string | number | null },
  details?: Record<string, unknown>,
) {
  await db.insert(auditLog).values({
    userId: actor?.id ?? null,
    userLogin: actor?.login ?? null,
    action,
    entity: entity?.type ?? null,
    entityId: entity?.id == null ? null : String(entity.id),
    details: details ?? null,
    ipHash: actor?.ipHash ?? null,
  });
}

/** Human-readable labels for the activity log page. */
export const AUDIT_LABELS: Record<string, string> = {
  "auth.login": "Вход",
  "auth.login_failed": "Неудачный вход",
  "auth.logout": "Выход",
  "auth.password": "Смена пароля",
  "auth.totp_on": "Включил 2FA",
  "auth.totp_off": "Выключил 2FA",
  "item.create": "Новое блюдо",
  "item.update": "Изменил блюдо",
  "item.delete": "Удалил блюдо",
  "item.sold_out": "Стоп-лист",
  "item.bulk": "Массовое действие",
  "item.reorder": "Порядок блюд",
  "item.photo": "Фото блюда",
  "category.save": "Категория",
  "category.delete": "Удалил категорию",
  "category.reorder": "Порядок категорий",
  "promo.save": "Акция",
  "promo.delete": "Удалил акцию",
  "room.save": "Зал",
  "room.delete": "Удалил зал",
  "table.save": "Стол",
  "table.delete": "Удалил стол",
  "table.reissue": "Перевыпуск QR",
  "waiter.save": "Официант",
  "waiter.delete": "Удалил официанта",
  "venue.save": "Настройки заведения",
  "venue.features": "Флаги функций",
  "menu.publish": "Публикация меню",
  "menu.rollback": "Откат меню",
  "menu.import": "Импорт JSON",
  "menu.export": "Экспорт JSON",
  "user.save": "Пользователь",
  "user.password_reset": "Сброс пароля",
  "user.sessions_revoked": "Завершил сессии",
  "system.bot_test": "Тест бота",
  "system.outbox_retry": "Повтор outbox",
};
