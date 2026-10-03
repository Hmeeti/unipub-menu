import { Bot, GrammyError } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import type { Db } from "@/lib/db/client";
import { VENUE_TZ } from "@/lib/domain/schedule";
import { env } from "@/lib/env";
import type { Kv } from "@/lib/kv/kv";
import { log } from "@/lib/log";
import {
  acceptOrder,
  findById,
  findStaff,
  markUnavailable,
  publishStatus,
  type OrderRow,
} from "@/lib/orders/service";
import {
  formatOrderMessage,
  mainKeyboard,
  parseCallback,
  unavailableKeyboard,
} from "@/lib/orders/telegram-text";

export type TelegramCall = { method: string; payload: Record<string, unknown> };

type Deps = () => Promise<{ db: Db; kv: Kv }>;

export type BotHolder = {
  bot: Bot;
  chatId: string;
  mock: boolean;
  /** set by the Next.js webhook route; the standalone worker has no page cache to revalidate */
  hooks: { onMenuChanged?: () => void };
};

const MOCK_INFO: UserFromGetMe = {
  id: 1,
  is_bot: true,
  first_name: "UNIPUB (mock)",
  username: "unipub_mock_bot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
};

const g = globalThis as unknown as { __unipubBot?: BotHolder; __unipubTgLog?: TelegramCall[] };

/** Calls captured in mock mode (no TELEGRAM_BOT_TOKEN): local dev logs them, e2e reads them. */
export function telegramLog(): TelegramCall[] {
  return (g.__unipubTgLog ??= []);
}

export function renderOrder(o: OrderRow): string {
  return formatOrderMessage(
    {
      number: o.dayNumber,
      tableCode: o.tableCode,
      tableVerified: o.tableVerified,
      waiterName: o.waiterName || null,
      createdAt: o.createdAt,
      lines: o.lines,
      subtotal: o.subtotal,
      service: o.service,
      total: o.total,
      serviceRateBp: o.serviceRateBp,
      comment: o.comment,
      split: o.split ?? null,
      acceptedBy: o.acceptedBy,
      acceptedAt: o.acceptedAt,
      unavailableItemIds: o.unavailableItemIds,
    },
    VENUE_TZ,
  );
}

function isNotModified(err: unknown) {
  return err instanceof GrammyError && /message is not modified/i.test(err.description);
}

export function createBot(opts: {
  token: string;
  chatId: string;
  mock: boolean;
  apiRoot?: string;
  deps: Deps;
}): BotHolder {
  const hooks: BotHolder["hooks"] = {};
  const bot = new Bot(opts.token, {
    ...(opts.mock ? { botInfo: MOCK_INFO } : {}),
    client: opts.apiRoot ? { apiRoot: opts.apiRoot } : {},
  });

  if (opts.mock) {
    let seq = 1000;
    bot.api.config.use(async (_prev, method, payload) => {
      const calls = telegramLog();
      calls.push({ method, payload: payload as Record<string, unknown> });
      if (calls.length > 100) calls.splice(0, calls.length - 100);
      log.info({ method, text: (payload as { text?: string }).text }, "telegram (mock)");
      const result =
        method === "sendMessage"
          ? {
              message_id: ++seq,
              date: Math.floor(Date.now() / 1000),
              chat: { id: -1, type: "supergroup", title: "mock" },
              text: (payload as { text?: string }).text,
            }
          : method === "getMe"
            ? MOCK_INFO
            : true;
      return { ok: true, result } as never;
    });
  }

  bot.command("id", (ctx) =>
    ctx.reply(`Ваш Telegram ID: ${ctx.from?.id ?? "—"}\nID этого чата: ${ctx.chat.id}`),
  );

  bot.on("callback_query:data", async (ctx) => {
    const cb = parseCallback(ctx.callbackQuery.data);
    if (!cb) return ctx.answerCallbackQuery();
    const { db, kv } = await opts.deps();
    const staff = await findStaff(db, ctx.from.id);
    if (!staff) {
      return ctx.answerCallbackQuery({
        text: "Нет прав. Попросите управляющего добавить ваш Telegram ID в список официантов.",
        show_alert: true,
      });
    }
    const edit = async (o: OrderRow, keyboard = mainKeyboard(o.id, o.status === "accepted")) => {
      try {
        await ctx.editMessageText(renderOrder(o), {
          reply_markup: keyboard,
          link_preview_options: { is_disabled: true },
        });
      } catch (err) {
        if (!isNotModified(err)) throw err;
      }
    };

    switch (cb.kind) {
      case "accept": {
        const r = await acceptOrder(
          db,
          cb.orderId,
          { name: staff.name, telegramUserId: ctx.from.id },
          new Date(),
        );
        if (!r.order) return ctx.answerCallbackQuery({ text: "Заказ не найден" });
        await edit(r.order);
        if (!r.changed)
          return ctx.answerCallbackQuery({ text: `Уже принят: ${r.order.acceptedBy ?? "—"}` });
        await publishStatus(db, kv, r.order);
        return ctx.answerCallbackQuery({ text: "Принято" });
      }
      case "unavailableMenu": {
        const o = await findById(db, cb.orderId);
        if (!o) return ctx.answerCallbackQuery({ text: "Заказ не найден" });
        await ctx.editMessageReplyMarkup({
          reply_markup: unavailableKeyboard(o.id, o.lines, o.unavailableItemIds),
        });
        return ctx.answerCallbackQuery({ text: "Какого блюда нет?" });
      }
      case "back": {
        const o = await findById(db, cb.orderId);
        if (!o) return ctx.answerCallbackQuery({ text: "Заказ не найден" });
        await ctx.editMessageReplyMarkup({
          reply_markup: mainKeyboard(o.id, o.status === "accepted"),
        });
        return ctx.answerCallbackQuery();
      }
      case "unavailablePick": {
        const r = await markUnavailable(db, cb.orderId, cb.index);
        if (!r) return ctx.answerCallbackQuery({ text: "Позиция не найдена" });
        hooks.onMenuChanged?.();
        await edit(r.order);
        await publishStatus(db, kv, r.order);
        const name = r.order.lines[cb.index]?.nameRu ?? "";
        return ctx.answerCallbackQuery({ text: `«${name}» в стоп-листе, гость уведомлён` });
      }
    }
  });

  bot.catch((err) => log.error({ err: err.error }, "telegram handler failed"));

  return { bot, chatId: opts.chatId, mock: opts.mock, hooks };
}

/** Process-wide bot; mock mode when the token is not configured (local dev, CI, e2e). */
export function getBot(deps: Deps): BotHolder {
  if (g.__unipubBot) return g.__unipubBot;
  const e = env();
  const mock = !e.TELEGRAM_BOT_TOKEN || !e.TELEGRAM_CHAT_ID;
  g.__unipubBot = createBot({
    token: mock ? "0:mock" : e.TELEGRAM_BOT_TOKEN!,
    chatId: mock ? "-1" : e.TELEGRAM_CHAT_ID!,
    mock,
    apiRoot: e.TELEGRAM_API_ROOT,
    deps,
  });
  return g.__unipubBot;
}
