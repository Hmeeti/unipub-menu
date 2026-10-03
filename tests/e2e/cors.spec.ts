import { expect, test } from "@playwright/test";

const PAGES = "https://hmeeti.github.io";

test("the static menu on GitHub Pages may call the guest API, other origins may not", async ({
  request,
}) => {
  const preflight = await request.fetch("/api/orders", {
    method: "OPTIONS",
    headers: {
      origin: PAGES,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type,idempotency-key",
    },
  });
  expect(preflight.status()).toBe(204);
  expect(preflight.headers()["access-control-allow-origin"]).toBe(PAGES);
  expect(preflight.headers()["access-control-allow-credentials"]).toBeUndefined();

  const live = await request.get("/api/menu/live", { headers: { origin: PAGES } });
  expect(live.ok()).toBe(true);
  expect(live.headers()["access-control-allow-origin"]).toBe(PAGES);

  const foreign = await request.fetch("/api/orders", {
    method: "OPTIONS",
    headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
  });
  expect(foreign.status()).toBe(403);
  expect(foreign.headers()["access-control-allow-origin"]).toBeUndefined();

  const post = await request.post("/api/orders", {
    headers: { origin: "https://evil.example", "idempotency-key": crypto.randomUUID() },
    data: {},
  });
  expect(post.status()).toBe(403);

  const webhook = await request.fetch("/api/telegram/webhook", {
    method: "OPTIONS",
    headers: { origin: PAGES, "access-control-request-method": "POST" },
  });
  expect(webhook.headers()["access-control-allow-origin"]).toBeUndefined();
});
