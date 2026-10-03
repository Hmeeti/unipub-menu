import { expect, test } from "@playwright/test";
import {
  buttons,
  openVenueAndSkipSplash,
  pressButton,
  randomTable,
  telegramCalls,
  waitForCall,
} from "./helpers";

test.beforeEach(async ({ page, request }) => {
  await openVenueAndSkipSplash(page, request);
});

test("call a waiter: Telegram gets it, staff accepts, the guest sees who", async ({
  page,
  request,
}) => {
  await page.goto("/ru");
  await page.getByRole("button", { name: "Позвать официанта" }).click();
  const sheet = page.getByRole("dialog", { name: "Позвать официанта" });
  const table = randomTable();
  await sheet.getByLabel("Стол").fill(table);
  await sheet.getByRole("button", { name: "Отправить" }).click();
  await expect(sheet).toContainText("Официант скоро подойдёт");

  const msg = await waitForCall(
    request,
    (c) =>
      c.method === "sendMessage" &&
      /^🙋 Вызов официанта №\d+ · стол /.test(c.payload.text ?? "") &&
      Boolean(c.payload.text?.includes(`стол ${table}`)),
  );
  const accept = buttons(msg).find((b) => b.text.includes("Принял"))!;
  const calls = await pressButton(request, accept.callback_data);
  expect(
    calls.some((c) => c.method === "editMessageText" && c.payload.text?.includes("✅ Принял:")),
  ).toBe(true);
  await expect(sheet).toContainText(/Принял: \S+/, { timeout: 10_000 });
  await sheet.getByRole("button", { name: "Готово" }).click();
  await expect(sheet).toBeHidden();
});

test("booking: contact goes to Telegram, the guest is promised a call back", async ({
  page,
  request,
}) => {
  await page.goto("/ru");
  await page.getByRole("button", { name: "Забронировать VIP" }).click();
  const sheet = page.getByRole("dialog", { name: "Забронировать" });
  await sheet.getByLabel("Имя").fill("Тест Брони");
  await sheet.getByLabel("Телефон").pressSequentially("7012345678");
  await expect(sheet.getByLabel("Телефон")).toHaveValue("+7 (701) 234-56-78");
  const inTwoDays = new Date(Date.now() + 2 * 24 * 3600_000).toISOString().slice(0, 10);
  await sheet.getByLabel("Дата").fill(inTwoDays);
  await sheet.getByLabel("Время").fill("21:00");
  await sheet.getByRole("button", { name: "Отправить" }).click();
  await expect(sheet).toContainText(/Заявка №\d+ отправлена/);
  await expect(sheet).toContainText("свяжемся");

  const msg = await waitForCall(
    request,
    (c) => c.method === "sendMessage" && Boolean(c.payload.text?.includes("Имя: Тест Брони")),
  );
  expect(msg.payload.text).toContain("Телефон: +7 (701) 234-56-78");
  expect(msg.payload.text).toContain("Гостей: 2");
});

test("a booking in the past is refused with a clear message", async ({ page }) => {
  await page.goto("/ru");
  await page.getByRole("button", { name: "Забронировать VIP" }).click();
  const sheet = page.getByRole("dialog", { name: "Забронировать" });
  await sheet.getByLabel("Имя").fill("Тест");
  await sheet.getByLabel("Телефон").pressSequentially("7012345678");
  await sheet.getByLabel("Дата").fill("2020-01-01");
  await sheet.getByRole("button", { name: "Отправить" }).click();
  await expect(sheet).toContainText("Выберите дату и время в будущем");
});

test("stop-list: «Нет блюда» hides the dish on an open page, /stop brings it back", async ({
  page,
  request,
}) => {
  await page.goto("/ru");
  const res = await request.post("/api/orders", {
    data: {
      lines: [{ itemId: "m1", qty: 1 }],
      tableCode: randomTable(),
      waiterId: "any",
      locale: "ru",
    },
    headers: { "idempotency-key": `e2e-stop-${Date.now()}-key`, origin: "http://localhost:3100" },
  });
  expect(res.status()).toBe(201);
  const { order } = (await res.json()) as { order: { number: number } };
  const msg = await waitForCall(
    request,
    (c) =>
      c.method === "sendMessage" &&
      Boolean(c.payload.text?.startsWith(`🧾 Заказ №${order.number} `)),
  );
  const dish = /• (.+?) × 1 =/.exec(msg.payload.text!)![1]!;
  const orderId = buttons(msg)
    .find((b) => b.callback_data.startsWith("na:"))!
    .callback_data.slice(3);

  const add = page.getByRole("button", { name: `Добавить «${dish}» в корзину` });
  await expect(add.first()).toBeAttached();
  try {
    await pressButton(request, `nai:${orderId}:0`);
    // the page polls every minute and on tab focus; simulate the guest coming back to the tab
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(add).toHaveCount(0);
  } finally {
    const calls = await pressButton(request, "ret:m1");
    expect(calls.some((c) => c.method === "answerCallbackQuery")).toBe(true);
  }
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(add.first()).toBeAttached();
  expect((await telegramCalls(request)).length).toBeGreaterThan(0);
});
