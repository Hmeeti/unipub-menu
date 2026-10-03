import { expect, type APIRequestContext, type Page } from "@playwright/test";

export type Button = { text: string; callback_data: string };
export type Call = {
  method: string;
  payload: { text?: string; reply_markup?: { inline_keyboard: Button[][] } };
};

/** Mocked Telegram traffic captured by the app (E2E_TEST_HOOKS only). */
export async function telegramCalls(request: APIRequestContext): Promise<Call[]> {
  const res = await request.get("/api/test/telegram");
  return ((await res.json()) as { calls: Call[] }).calls;
}

export async function waitForCall(
  request: APIRequestContext,
  match: (c: Call) => boolean,
): Promise<Call> {
  let found: Call | undefined;
  await expect
    .poll(
      async () => {
        found = [...(await telegramCalls(request))].reverse().find(match);
        return Boolean(found);
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  return found!;
}

/** Presses an inline button as linked staff; returns the Bot API calls it caused. */
export async function pressButton(request: APIRequestContext, data: string): Promise<Call[]> {
  const res = await request.post("/api/test/telegram", { data: { action: "press", data } });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { calls: Call[] }).calls;
}

export const buttons = (c: Call) => c.payload.reply_markup?.inline_keyboard.flat() ?? [];

export const randomTable = () => String(1 + Math.floor(Math.random() * 20));

export async function openVenueAndSkipSplash(page: Page, request: APIRequestContext) {
  await page.addInitScript(() => localStorage.setItem("unipub:splash", String(Date.now())));
  const res = await request.post("/api/test/telegram", { data: { action: "open" } });
  expect(res.ok()).toBe(true);
}
