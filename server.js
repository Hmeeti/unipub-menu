/**
 * UNIPUB Admin API (Render)
 * PIN auth + menu CRUD + GitHub auto-push + Telegram orders
 */
"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");

const ROOT = __dirname;
const CACHE_FILE = path.join(ROOT, "data", "live-cache.json");
const MENU_JS = path.join(ROOT, "js", "menu-data.js");
const ORDERS_FILE = path.join(ROOT, "data", "orders.jsonl");

function loadEnvFile() {
  try {
    const envPath = path.join(ROOT, ".env");
    if (!fs.existsSync(envPath)) return;
    fs.readFileSync(envPath, "utf8").split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const eq = trimmed.indexOf("=");
      if (eq < 1) return;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] == null) process.env[key] = val;
    });
  } catch (_) {}
}
loadEnvFile();

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PIN = String(process.env.ADMIN_PIN || "0000");
const SESSION_SECRET = String(process.env.SESSION_SECRET || crypto.randomBytes(24).toString("hex"));
const MENU_URL = String(process.env.MENU_URL || "https://hmeeti.github.io/unipub-menu/").replace(/\/?$/, "/");
const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || "").trim();

const GH = {
  token: String(process.env.GITHUB_TOKEN || "").trim().replace(/^["']|["']$/g, ""),
  owner: String(process.env.GITHUB_OWNER || "Hmeeti").trim(),
  repo: String(process.env.GITHUB_REPO || "unipub-menu").trim(),
  branch: String(process.env.GITHUB_BRANCH || "main").trim(),
  path: String(process.env.GITHUB_PATH || "js/menu-data.js").trim()
};

const sessions = new Map();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
let pushLock = false;

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "4mb" }));

app.use((req, res, next) => {
  const origin = String(req.headers.origin || "");
  if (
    /hmeeti\.github\.io$/i.test(origin) ||
    /localhost(:\d+)?$/i.test(origin) ||
    /127\.0\.0\.1(:\d+)?$/i.test(origin) ||
    /\.onrender\.com$/i.test(origin)
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

function parseMenuJs(text) {
  const cleaned = String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/^[\s\S]*?window\.UNIPUB_DATA\s*=\s*/, "")
    .replace(/;\s*$/, "")
    .trim();
  return JSON.parse(cleaned);
}

function ensureShape(data) {
  const d = data && typeof data === "object" ? JSON.parse(JSON.stringify(data)) : {};
  if (!d.venue) d.venue = {};
  if (!Array.isArray(d.categories)) d.categories = [];
  if (!Array.isArray(d.filters)) d.filters = [];
  if (!Array.isArray(d.items)) d.items = [];
  if (!d.rules) d.rules = { ru: [], kz: [], en: [] };
  if (!d.popularQueries) d.popularQueries = { ru: [], kz: [], en: [] };
  if (typeof d.serviceRate !== "number") d.serviceRate = 0.15;
  if (!Array.isArray(d.waiters)) d.waiters = [];
  return d;
}

function readLocalMenu() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return ensureShape(JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")));
    }
  } catch (_) {}
  try {
    if (fs.existsSync(MENU_JS)) {
      return ensureShape(parseMenuJs(fs.readFileSync(MENU_JS, "utf8")));
    }
  } catch (_) {}
  return ensureShape({ items: [], categories: [], filters: [], venue: {}, rules: {}, popularQueries: {}, waiters: [] });
}

function writeCache(data) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
  } catch (_) {}
}

function menuFileText(data) {
  return "window.UNIPUB_DATA = " + JSON.stringify(data, null, 2) + ";\n";
}

function utf8ToBase64(str) {
  return Buffer.from(str, "utf8").toString("base64");
}

function ghHeaders() {
  return {
    Accept: "application/vnd.github+json",
    Authorization: "Bearer " + GH.token,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "unipub-admin"
  };
}

function ghContentsUrl() {
  return (
    "https://api.github.com/repos/" +
    encodeURIComponent(GH.owner) +
    "/" +
    encodeURIComponent(GH.repo) +
    "/contents/" +
    GH.path.split("/").map(encodeURIComponent).join("/")
  );
}

async function fetchGithubMenu() {
  if (!GH.token) return null;
  const url = ghContentsUrl() + "?ref=" + encodeURIComponent(GH.branch);
  const res = await fetch(url, { headers: ghHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || ("GitHub GET " + res.status));
  }
  const meta = await res.json();
  const raw = Buffer.from(meta.content || "", "base64").toString("utf8");
  return { data: ensureShape(parseMenuJs(raw)), sha: meta.sha };
}

function mapGithubError(message, status, headers) {
  const msg = String(message || "");
  const needed = headers && headers.get ? headers.get("x-accepted-github-permissions") : "";
  if (/Resource not accessible by personal access token/i.test(msg)) {
    return (
      "Токену не хватает прав на репо. Сделай Classic PAT с галкой repo " +
      "и вставь в Render → GITHUB_TOKEN" +
      (needed ? " (нужно: " + needed + ")" : "")
    );
  }
  if (/Bad credentials/i.test(msg)) return "Неверный GITHUB_TOKEN на Render";
  if (/Not Found/i.test(msg) && status === 404) {
    return "Репо не найдено или token без доступа к " + GH.owner + "/" + GH.repo;
  }
  return msg || ("GitHub HTTP " + status);
}

async function pushMenuToGithub(data, message) {
  if (!GH.token) throw new Error("GITHUB_TOKEN не задан на Render");
  if (pushLock) throw new Error("Уже идёт пуш");
  pushLock = true;
  try {
    const url = ghContentsUrl();
    let sha = null;
    const getRes = await fetch(url + "?ref=" + encodeURIComponent(GH.branch), { headers: ghHeaders() });
    if (getRes.ok) {
      const meta = await getRes.json();
      sha = meta.sha || null;
    } else if (getRes.status !== 404) {
      const body = await getRes.json().catch(() => ({}));
      throw new Error(mapGithubError(body.message, getRes.status, getRes.headers));
    }

    const payload = {
      message: message || ("Admin: update menu " + new Date().toISOString().slice(0, 16).replace("T", " ")),
      content: utf8ToBase64(menuFileText(data)),
      branch: GH.branch
    };
    if (sha) payload.sha = sha;

    const putRes = await fetch(url, {
      method: "PUT",
      headers: { ...ghHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await putRes.json().catch(() => ({}));
    if (!putRes.ok) throw new Error(mapGithubError(body.message, putRes.status, putRes.headers));
    return { ok: true, commit: body.commit && body.commit.sha };
  } finally {
    pushLock = false;
  }
}

function createSession() {
  const token = crypto.randomBytes(24).toString("hex");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(token).digest("hex").slice(0, 16);
  const full = token + "." + sig;
  sessions.set(full, Date.now() + SESSION_TTL_MS);
  return full;
}

function validSession(token) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const expect = crypto.createHmac("sha256", SESSION_SECRET).update(parts[0]).digest("hex").slice(0, 16);
  if (expect !== parts[1]) return false;
  const exp = sessions.get(token);
  if (!exp) {
    // accept signed token even after restart within soft window via re-register
    sessions.set(token, Date.now() + SESSION_TTL_MS);
    return true;
  }
  if (Date.now() > exp) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!validSession(token)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  req.adminToken = token;
  next();
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "unipub-admin",
    github: Boolean(GH.token),
    telegram: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
    repo: GH.owner + "/" + GH.repo
  });
});

app.post("/api/login", (req, res) => {
  const pin = String((req.body && req.body.pin) || "").trim();
  if (!pin || pin !== ADMIN_PIN) {
    return res.status(401).json({ ok: false, error: "bad_pin" });
  }
  const token = createSession();
  res.json({ ok: true, token, menuUrl: MENU_URL });
});

app.post("/api/logout", auth, (req, res) => {
  sessions.delete(req.adminToken);
  res.json({ ok: true });
});

app.get("/api/me", auth, (_req, res) => {
  res.json({
    ok: true,
    githubReady: Boolean(GH.token),
    autoPush: true,
    repo: GH.owner + "/" + GH.repo,
    branch: GH.branch,
    path: GH.path,
    menuUrl: MENU_URL
  });
});

app.get("/api/data", auth, async (_req, res) => {
  try {
    const fromGh = await fetchGithubMenu();
    if (fromGh && fromGh.data) {
      writeCache(fromGh.data);
      return res.json({ ok: true, data: fromGh.data, source: "github" });
    }
  } catch (err) {
    // fall through to local
  }
  const local = readLocalMenu();
  res.json({ ok: true, data: local, source: "local" });
});

app.put("/api/data", auth, async (req, res) => {
  try {
    const data = ensureShape(req.body && req.body.data);
    if (!Array.isArray(data.items)) {
      return res.status(400).json({ ok: false, error: "invalid_data" });
    }
    writeCache(data);

    const publish = req.body && req.body.publish !== false;
    let push = null;
    if (publish) {
      push = await pushMenuToGithub(data, req.body && req.body.message);
    }

    res.json({
      ok: true,
      published: Boolean(publish && push && push.ok),
      commit: push && push.commit,
      menuUrl: MENU_URL
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || "save_failed" });
  }
});

app.post("/api/publish", auth, async (req, res) => {
  try {
    const data = ensureShape((req.body && req.body.data) || readLocalMenu());
    writeCache(data);
    const push = await pushMenuToGithub(data, req.body && req.body.message);
    res.json({ ok: true, published: true, commit: push.commit, menuUrl: MENU_URL });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || "publish_failed" });
  }
});

function saveOrderRecord(order) {
  try {
    fs.mkdirSync(path.dirname(ORDERS_FILE), { recursive: true });
    fs.appendFileSync(ORDERS_FILE, JSON.stringify(order) + "\n", "utf8");
    return true;
  } catch (_) {
    return false;
  }
}

function formatOrderTelegramText(order) {
  const lines = [
    "Новый заказ",
    "",
    "Стол: " + (order.table || "—"),
    "Официант: " + (order.waiter || "—"),
    "Время: " + (order.time || "—"),
    ""
  ];
  (order.items || []).forEach((item) => {
    const name = String(item.name || "Блюдо").trim();
    const qty = Number(item.qty) || 1;
    lines.push("• " + name + " × " + qty);
  });
  lines.push("");
  lines.push("Итого: " + (order.totalLabel || ((order.total || 0) + " ₸")));
  if (order.comment) {
    lines.push("Комментарий: " + order.comment);
  }
  return lines.join("\n");
}

async function sendTelegramMessage(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID не заданы");
  }
  const url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      disable_web_page_preview: true
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    throw new Error((body && body.description) || ("Telegram HTTP " + res.status));
  }
  return body;
}

/* ---------- Anti-spam for public orders ---------- */
const TICKET_TTL_MS = 20 * 60 * 1000;
const TICKET_MIN_AGE_MS = 0;
const ALLOWED_ORDER_ORIGINS = [
  /^https:\/\/hmeeti\.github\.io$/i,
  /^https:\/\/[a-z0-9-]+\.onrender\.com$/i,
  /^http:\/\/localhost(:\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/i
];

const rateBuckets = new Map();
const usedTickets = new Map();
const recentFingerprints = new Map();
const blockedIps = new Map();

function clientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || req.socket.remoteAddress || "unknown";
}

function pruneMap(map, maxAge) {
  const now = Date.now();
  for (const [k, v] of map.entries()) {
    const ts = typeof v === "number" ? v : (v && v.exp) || 0;
    if (ts && now > ts) map.delete(k);
  }
  if (map.size > 5000) {
    const keys = Array.from(map.keys()).slice(0, map.size - 4000);
    keys.forEach((k) => map.delete(k));
  }
}

function hitRate(key, limit, windowMs) {
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.reset) {
    bucket = { count: 0, reset: now + windowMs };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

function isOriginAllowed(origin) {
  if (!origin) return false;
  return ALLOWED_ORDER_ORIGINS.some((re) => re.test(origin));
}

function toBase64Url(bufOrStr) {
  const b = Buffer.isBuffer(bufOrStr) ? bufOrStr : Buffer.from(String(bufOrStr), "utf8");
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(token) {
  let s = String(token || "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64").toString("utf8");
}

function issueOrderTicket() {
  const issuedAt = Date.now();
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = issuedAt + "." + nonce;
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  return {
    token: toBase64Url(payload + "." + sig),
    ttlMs: TICKET_TTL_MS
  };
}

function consumeOrderTicket(token) {
  if (!token || typeof token !== "string" || token.length > 400) {
    return { ok: false, error: "ticket_required" };
  }
  let raw;
  try {
    raw = fromBase64Url(token);
  } catch (_) {
    return { ok: false, error: "ticket_invalid" };
  }
  const parts = raw.split(".");
  if (parts.length !== 3) return { ok: false, error: "ticket_invalid" };
  const issuedAt = Number(parts[0]);
  const nonce = parts[1];
  const sig = parts[2];
  if (!issuedAt || !nonce || !sig) return { ok: false, error: "ticket_invalid" };
  const expect = crypto.createHmac("sha256", SESSION_SECRET).update(issuedAt + "." + nonce).digest("hex");
  if (expect !== sig) return { ok: false, error: "ticket_invalid" };

  const age = Date.now() - issuedAt;
  if (TICKET_MIN_AGE_MS > 0 && age < TICKET_MIN_AGE_MS) return { ok: false, error: "too_fast" };
  if (age > TICKET_TTL_MS) return { ok: false, error: "ticket_expired" };

  pruneMap(usedTickets, TICKET_TTL_MS);
  if (usedTickets.has(nonce)) return { ok: false, error: "ticket_used" };
  usedTickets.set(nonce, Date.now() + TICKET_TTL_MS);
  return { ok: true };
}

function orderFingerprint(order) {
  const itemsKey = (order.items || [])
    .map((it) => it.id + ":" + it.qty)
    .sort()
    .join("|");
  return crypto
    .createHash("sha256")
    .update([order.table, order.waiter, itemsKey, order.total].join("#"))
    .digest("hex");
}

app.get("/api/order-ticket", (req, res) => {
  pruneMap(rateBuckets, 0);
  const ip = clientIp(req);
  if (blockedIps.has(ip) && Date.now() < blockedIps.get(ip)) {
    return res.status(429).json({ ok: false, error: "blocked" });
  }
  if (!hitRate("ticket:" + ip, 30, 10 * 60 * 1000)) {
    blockedIps.set(ip, Date.now() + 15 * 60 * 1000);
    return res.status(429).json({ ok: false, error: "rate_ticket" });
  }
  const ticket = issueOrderTicket();
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, token: ticket.token, ttlMs: ticket.ttlMs });
});

// Публичный эндпоинт меню гостей → Telegram-группа (со spam-защитой)
app.post("/api/order", async (req, res) => {
  const origin = String(req.headers.origin || "");
  const referer = String(req.headers.referer || "");
  const ua = String(req.headers["user-agent"] || "");
  const ip = clientIp(req);
  const body = req.body || {};

  pruneMap(rateBuckets, 0);
  pruneMap(usedTickets, TICKET_TTL_MS);
  pruneMap(recentFingerprints, 5 * 60 * 1000);
  pruneMap(blockedIps, 0);

  if (blockedIps.has(ip) && Date.now() < blockedIps.get(ip)) {
    return res.status(429).json({ ok: false, error: "blocked" });
  }

  // Только известные origins (браузерные запросы)
  if (origin && !isOriginAllowed(origin)) {
    return res.status(403).json({ ok: false, error: "origin" });
  }
  if (!origin && referer && !/hmeeti\.github\.io|localhost|127\.0\.0\.1|onrender\.com/i.test(referer)) {
    return res.status(403).json({ ok: false, error: "referer" });
  }
  if (!ua || ua.length < 12) {
    return res.status(403).json({ ok: false, error: "ua" });
  }

  // Honeypot: боты часто заполняют скрытое поле
  if (String(body.website || body.url || body.company || "").trim()) {
    return res.status(200).json({ ok: true, saved: false, telegram: false, honeypot: true });
  }

  if (!hitRate("order:ip:" + ip, 8, 10 * 60 * 1000)) {
    blockedIps.set(ip, Date.now() + 30 * 60 * 1000);
    return res.status(429).json({ ok: false, error: "rate_ip" });
  }
  if (!hitRate("order:ip-hour:" + ip, 20, 60 * 60 * 1000)) {
    blockedIps.set(ip, Date.now() + 60 * 60 * 1000);
    return res.status(429).json({ ok: false, error: "rate_ip_hour" });
  }
  if (!hitRate("order:global", 120, 10 * 60 * 1000)) {
    return res.status(429).json({ ok: false, error: "rate_global" });
  }

  const ticketCheck = consumeOrderTicket(body.ticket);
  if (!ticketCheck.ok) {
    return res.status(403).json({ ok: false, error: ticketCheck.error });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length < 1 || items.length > 40) {
    return res.status(400).json({ ok: false, error: "items_limit" });
  }

  const order = {
    id: "ord_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 999),
    createdAt: new Date().toISOString(),
    table: String(body.table || "").trim().slice(0, 8),
    waiter: String(body.waiter || "").trim().slice(0, 64),
    time: String(body.time || "").trim().slice(0, 64),
    comment: String(body.comment || "").trim().slice(0, 300),
    total: Number(body.total) || 0,
    totalLabel: String(body.totalLabel || "").trim().slice(0, 64),
    ip: ip,
    items: items.slice(0, 40).map((it) => ({
      id: String((it && it.id) || "").slice(0, 64),
      name: String((it && it.name) || "Блюдо").trim().slice(0, 120),
      qty: Math.max(1, Math.min(99, Number(it && it.qty) || 1)),
      price: Math.max(0, Math.min(1000000, Number(it && it.price) || 0))
    }))
  };

  if (!/^[0-9A-Za-zА-Яа-яЁё\-]{1,8}$/.test(order.table)) {
    return res.status(400).json({ ok: false, error: "bad_table" });
  }
  if (!order.waiter || order.waiter.length < 2) {
    return res.status(400).json({ ok: false, error: "bad_waiter" });
  }
  if (order.total < 0 || order.total > 5000000) {
    return res.status(400).json({ ok: false, error: "bad_total" });
  }

  if (!hitRate("order:table:" + order.table, 10, 15 * 60 * 1000)) {
    return res.status(429).json({ ok: false, error: "rate_table" });
  }

  const fp = orderFingerprint(order);
  if (recentFingerprints.has(fp)) {
    return res.status(429).json({ ok: false, error: "duplicate" });
  }
  recentFingerprints.set(fp, Date.now() + 90 * 1000);

  const saved = saveOrderRecord(order);
  let telegramOk = false;
  let telegramError = null;

  try {
    await sendTelegramMessage(formatOrderTelegramText(order));
    telegramOk = true;
  } catch (err) {
    telegramError = err && err.message ? err.message : "telegram_failed";
  }

  res.status(telegramOk ? 200 : 202).json({
    ok: true,
    saved: saved,
    telegram: telegramOk,
    orderId: order.id,
    error: telegramError
  });
});

// Static admin UI
app.get("/", (_req, res) => {
  res.sendFile(path.join(ROOT, "admin.html"));
});

app.use("/css", express.static(path.join(ROOT, "css"), { maxAge: "1h" }));
app.use("/js", express.static(path.join(ROOT, "js"), { maxAge: "5m" }));
app.use("/assets", express.static(path.join(ROOT, "assets"), { maxAge: "1d" }));

app.get("/admin.html", (_req, res) => {
  res.redirect(302, "/");
});

app.listen(PORT, () => {
  console.log(
    "UNIPUB admin on :" + PORT +
    " · github=" + Boolean(GH.token) +
    " · telegram=" + Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID)
  );
});
