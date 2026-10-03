import { expect, test, type Page } from "@playwright/test";

async function trackCspViolations(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      (window as unknown as { __csp: string[] }).__csp.push(
        `${e.violatedDirective} ${e.blockedURI}`,
      ),
    );
    localStorage.setItem("unipub:splash", String(Date.now()));
  });
}

const cspViolations = (page: Page) =>
  page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);

test.beforeEach(async ({ page }) => {
  await trackCspViolations(page);
});

test("redirects / to a locale and serves security headers", async ({ page }) => {
  const res = await page.goto("/");
  expect(page.url()).toMatch(/\/(ru|kk|en)$/);
  const headers = res!.headers();
  expect(headers["content-security-policy"]).toContain("'strict-dynamic'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});

test("menu renders, adds to cart and opens the cart sheet without CSP violations", async ({
  page,
}) => {
  await page.goto("/ru");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("unipub");
  await expect(page.getByRole("navigation", { name: "Разделы меню" })).toBeVisible();

  const add = page.getByRole("button", { name: /в корзину$/ }).first();
  await add.click();
  const bar = page.locator("#cart-bar");
  await expect(bar).toContainText("Корзина · 1 ·");

  await bar.click();
  const dialog = page.getByRole("dialog", { name: "Ваш заказ" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Обслуживание 15%");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(bar).toBeFocused();

  expect(await cspViolations(page)).toEqual([]);
});

test("cart survives reload (persisted) and swipe-free removal offers undo", async ({ page }) => {
  await page.goto("/ru");
  await page
    .getByRole("button", { name: /в корзину$/ })
    .first()
    .click();
  await page.reload();
  await expect(page.locator("#cart-bar")).toContainText("Корзина · 1 ·");
  await page.locator("#cart-bar").click();
  await page
    .getByRole("button", { name: /^Удалить «/ })
    .first()
    .click();
  await expect(page.getByRole("button", { name: "Отменить" })).toBeVisible();
  await page.getByRole("button", { name: "Отменить" }).click();
  await expect(page.getByRole("dialog")).toContainText("Итого");
});

test("dish deep link opens the details sheet and legacy #dish- hash still works", async ({
  page,
}) => {
  await page.goto("/ru?dish=m1");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Состав");
  await page.goto("/ru#dish-s1");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("dish")).toBe("s1");
  const open = page.getByRole("button", { name: "Открыть фото" });
  await open.click();
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
});

test("search uses morphology and the wrong keyboard layout", async ({ page }) => {
  await page.goto("/ru");
  const search = page.getByRole("searchbox", { name: "Поиск по меню" });
  await search.fill("neytw"); // "тунец" typed on the EN layout
  await expect(page.getByText(/^Найдено: \d+/)).toBeVisible();
  await expect(page.locator("article").first()).toContainText(/тун/i);
  await search.fill("тунцом");
  await expect(page.locator("article").first()).toContainText(/тун/i);
  await search.fill("zzzzqqq");
  await expect(page.getByRole("button", { name: "Сбросить фильтры" })).toBeVisible();
});

test("theme toggle persists and updates theme-color", async ({ page }) => {
  await page.goto("/ru");
  const before = await page.locator("html").getAttribute("data-theme");
  await page.getByRole("button", { name: /тему$/ }).click();
  const after = await page.locator("html").getAttribute("data-theme");
  expect(after).not.toBe(before);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", after!);
});

test("Kazakh and English locales render native strings", async ({ page }) => {
  await page.goto("/kk");
  await expect(page.locator("html")).toHaveAttribute("lang", "kk");
  await expect(page.getByRole("searchbox", { name: "Мәзірден іздеу" })).toBeVisible();
  await page.goto("/en");
  await expect(page.getByRole("searchbox", { name: "Search the menu" })).toBeVisible();
});
