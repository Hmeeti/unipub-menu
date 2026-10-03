import { expect, test } from "@playwright/test";
import { openVenueAndSkipSplash, telegramCalls, waitForCall, type Call } from "./helpers";

test.beforeEach(async ({ page, request }) => {
  await openVenueAndSkipSplash(page, request);
});

test("guest orders, staff accepts in Telegram, the guest sees it live", async ({
  page,
  request,
}) => {
  await page.goto("/ru");
  await page
    .getByRole("button", { name: /в корзину$/ })
    .first()
    .click();
  await page.locator("#cart-bar").click();
  const cart = page.getByRole("dialog", { name: "Ваш заказ" });

  // A fresh table per run keeps the 10-minute duplicate guard out of the way on a reused server.
  const table = String(1 + Math.floor(Math.random() * 20));
  await cart.getByLabel("Стол").fill(table);
  await cart.getByRole("radio", { name: "Не знаю" }).click();
  await cart.getByRole("button", { name: /^Отправить заказ/ }).click();

  const status = page.getByRole("dialog", { name: "Статус заказа" });
  const title = status.getByText(/^Заказ №\d+ отправлен$/);
  await expect(title).toBeVisible();
  const number = (await title.textContent())!.match(/\d+/)![0];

  const sent = await waitForCall(
    request,
    (c) =>
      c.method === "sendMessage" &&
      Boolean(c.payload.text?.includes(`Заказ №${number} · стол ${table}`)),
  );
  expect(sent.payload.text).toContain("Официант: любой");
  expect(sent.payload.text).toContain("Стол введён вручную");
  await expect(status).toContainText("Официант получил уведомление");

  const accept = sent.payload
    .reply_markup!.inline_keyboard.flat()
    .find((b) => b.text.includes("Принял"))!;
  const press = await request.post("/api/test/telegram", {
    data: { action: "press", data: accept.callback_data },
  });
  const { calls } = (await press.json()) as { calls: Call[] };
  expect(
    calls.some((c) => c.method === "editMessageText" && c.payload.text?.includes("✅ Принял:")),
  ).toBe(true);

  await expect(status).toContainText(/Принял: \S+/);
  await status.getByRole("button", { name: "Заказать ещё" }).click();
  await expect(status).toBeHidden();
  await expect(
    page.getByRole("button", { name: `Заказ №${number} · Принят официантом` }),
  ).toBeVisible();
  // the cart was emptied, the pill alone stays
  await expect(page.locator("#cart-bar")).toHaveCount(0);
});

test("status still updates without EventSource (polling fallback)", async ({ page, request }) => {
  await page.addInitScript(() => {
    delete (window as { EventSource?: unknown }).EventSource;
  });
  await page.goto("/ru");
  await page
    .getByRole("button", { name: /в корзину$/ })
    .nth(1)
    .click();
  await page.locator("#cart-bar").click();
  const cart = page.getByRole("dialog", { name: "Ваш заказ" });
  await cart.getByLabel("Стол").fill(String(1 + Math.floor(Math.random() * 20)));
  await cart.getByRole("button", { name: /^Отправить заказ/ }).click();
  const status = page.getByRole("dialog", { name: "Статус заказа" });
  await expect(status).toContainText("Официант получил уведомление", { timeout: 15_000 });
  await expect.poll(async () => (await telegramCalls(request)).length).toBeGreaterThan(0);
});

test("replaying the same Idempotency-Key returns the same order", async ({ request }) => {
  const key = `e2e-${Date.now()}-replay-key`;
  const body = {
    lines: [{ itemId: "m1", qty: 1 }],
    tableCode: String(1 + Math.floor(Math.random() * 20)),
    waiterId: "any",
    locale: "ru",
  };
  const headers = { "idempotency-key": key, origin: "http://localhost:3100" };
  const first = await request.post("/api/orders", { data: body, headers });
  const second = await request.post("/api/orders", { data: body, headers });
  expect(first.status()).toBe(201);
  expect(second.status()).toBe(200);
  const a = (await first.json()) as { order: { publicId: string; number: number } };
  const b = (await second.json()) as { order: { publicId: string; number: number } };
  expect(b.order).toMatchObject({ publicId: a.order.publicId, number: a.order.number });
});

test("a typed table that does not exist is refused without sending anything", async ({
  page,
  request,
}) => {
  const before = (await telegramCalls(request)).length;
  await page.goto("/ru");
  await page
    .getByRole("button", { name: /в корзину$/ })
    .first()
    .click();
  await page.locator("#cart-bar").click();
  const cart = page.getByRole("dialog", { name: "Ваш заказ" });
  await cart.getByLabel("Стол").fill("ZZ99");
  await cart.getByRole("button", { name: /^Отправить заказ/ }).click();
  await expect(cart).toContainText("Такого стола нет");
  await expect(cart.getByLabel("Стол")).toBeFocused();
  expect((await telegramCalls(request)).length).toBe(before);
});
