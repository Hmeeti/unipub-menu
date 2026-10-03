import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 45_000,
  use: {
    baseURL,
    locale: "ru-RU",
    timezoneId: "Asia/Almaty",
    trace: "retain-on-failure",
    ...devices["Pixel 7"],
  },
  projects: [{ name: "mobile-chromium" }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `${baseURL}/api/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      APP_ENV: "local",
      PGLITE_DIR: ".data/e2e",
      E2E_TEST_HOOKS: "true",
      APP_URL: baseURL,
    },
  },
});
