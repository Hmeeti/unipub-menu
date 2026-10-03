import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { openVenueAndSkipSplash, randomTable } from "./helpers";

const PASSWORD = "e2e-very-long-password";

async function ensureAdmin(
  request: APIRequestContext,
  login: string,
  role: "owner" | "manager" | "waiter",
) {
  const res = await request.post("/api/test/telegram", {
    data: { action: "admin", login, password: PASSWORD, role },
  });
  expect(res.ok()).toBe(true);
}

async function signIn(page: Page, login: string, password = PASSWORD) {
  await page.goto("/admin/login");
  await page.getByLabel("Логин").fill(login);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
}

test.beforeEach(async ({ page, request }) => {
  await openVenueAndSkipSplash(page, request);
});

test("wrong password is refused without revealing which part was wrong", async ({
  page,
  request,
}) => {
  await ensureAdmin(request, "e2e-wrong", "manager");
  await signIn(page, "e2e-wrong", "not-the-password");
  await expect(
    page.getByRole("alert").filter({ hasText: "Неверный логин или пароль" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("stop-list from the admin hides the dish for guests immediately", async ({
  page,
  request,
  browser,
}) => {
  await ensureAdmin(request, "e2e-manager", "manager");
  await signIn(page, "e2e-manager");
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto("/admin/menu");
  await page.getByPlaceholder("Поиск по названию или коду").fill("m2");
  const toggle = page.getByRole("switch", { name: /^«.+» в наличии$/ }).first();
  const dish = /^«(.+)» в наличии$/.exec((await toggle.getAttribute("aria-label"))!)![1]!;

  const guest = await (await browser.newContext()).newPage();
  await guest.addInitScript(() => localStorage.setItem("unipub:splash", String(Date.now())));
  await guest.goto("/ru");
  const add = guest.getByRole("button", { name: `Добавить «${dish}» в корзину` });
  await expect(add.first()).toBeAttached();

  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  try {
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await guest.reload();
    await expect(guest.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(add).toHaveCount(0);
  } finally {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
  }
  await guest.reload();
  await expect(add.first()).toBeAttached();
  await guest.context().close();
});

test("price change reaches guests only after publishing; rollback restores it", async ({
  page,
  request,
}) => {
  await ensureAdmin(request, "e2e-owner", "owner");
  await signIn(page, "e2e-owner");
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto("/admin/menu/m3");
  const price = page.getByLabel("Цена, ₸");
  const original = Number(await price.inputValue());
  const next = original === 12340 ? 12350 : 12340;
  const shown = new RegExp(String(next).replace(/(\d)(?=(\d{3})+$)/g, "$1\\s"));
  await price.fill(String(next));
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Сохранено в черновик" })).toBeVisible();

  await page.goto("/ru");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("main, body").first()).not.toContainText(shown);

  await page.goto("/admin/publish");
  await expect(page.getByText("есть неопубликованные правки")).toBeVisible();
  await page.getByLabel("Что изменилось (необязательно)").fill("e2e: цена");
  await page.getByRole("button", { name: "Опубликовать" }).click();
  await expect(page.getByText("совпадает с опубликованным")).toBeVisible();

  await page.goto("/ru");
  await expect(page.locator("body")).toContainText(shown);

  await page.goto("/admin/publish");
  const rollback = page.getByRole("button", { name: "Откатить" }).first();
  await rollback.click();
  await page.getByRole("button", { name: "Откатить и опубликовать?" }).click();
  await expect(page.getByText(/откат к v\d+/).first()).toBeVisible();

  await page.goto("/ru");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(shown);
  await page.goto("/admin/menu/m3");
  await expect(page.getByLabel("Цена, ₸")).toHaveValue(String(original));
});

test("every admin page renders for the owner; QR PDF and export download", async ({
  page,
  request,
}) => {
  await ensureAdmin(request, "e2e-owner", "owner");
  await signIn(page, "e2e-owner");
  await expect(page).toHaveURL(/\/admin$/);
  const pages: [string, string][] = [
    ["/admin/menu", "Блюда"],
    ["/admin/menu/new", "Новое блюдо"],
    ["/admin/categories", "Категории"],
    ["/admin/promotions", "Акции"],
    ["/admin/places", "Залы и столы"],
    ["/admin/staff", "Официанты"],
    ["/admin/settings", "Заведение"],
    ["/admin/orders?tab=requests", "Журнал"],
    ["/admin/analytics?from=2020-01-01", "Аналитика"],
    ["/admin/publish", "Публикация"],
    ["/admin/system", "Система"],
    ["/admin/audit", "Журнал действий"],
    ["/admin/users", "Пользователи"],
    ["/admin/account", "Мой аккаунт"],
    ["/admin/more", "Все разделы"],
  ];
  for (const [url, heading] of pages) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 }), url).toContainText(heading);
  }
  await page.goto("/admin/print/tables");
  await expect(page.locator("svg").first()).toBeVisible();
  await page.goto("/ru/preview");
  await expect(page.getByText("Предпросмотр черновика")).toBeVisible();

  const pdf = await page.request.get("/admin/api/qr?codes=1");
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  const backup = await page.request.get("/admin/api/export");
  expect(((await backup.json()) as { format: string }).format).toBe("unipub-menu");
  expect((await request.get("/admin/api/export")).status()).toBe(403);
});

test("waiter sees the order journal but not the menu editor", async ({ page, request }) => {
  const table = randomTable();
  const res = await request.post("/api/orders", {
    data: { lines: [{ itemId: "m1", qty: 2 }], tableCode: table, waiterId: "any", locale: "ru" },
    headers: { "idempotency-key": `e2e-admin-${Date.now()}-key`, origin: "http://localhost:3100" },
  });
  expect(res.status()).toBe(201);
  const { order } = (await res.json()) as { order: { number: number } };

  await ensureAdmin(request, "e2e-waiter", "waiter");
  await signIn(page, "e2e-waiter");
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto(`/admin/orders?table=${table}`);
  const row = page.locator("details").filter({ hasText: `№${order.number}` });
  await expect(row).toContainText(`стол ${table}`);
  await row.locator("summary").click();
  await expect(row).toContainText("× 2");

  await page.goto("/admin/menu");
  await expect(page).toHaveURL(/\/admin\?denied=1$/);
  await expect(page.getByRole("alert").filter({ hasText: "нет доступа" })).toBeVisible();
});
