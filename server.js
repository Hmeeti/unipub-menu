/**
 * UNIPUB Admin API (Render)
 * PIN auth + menu CRUD + server-side GitHub auto-push
 */
"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");

const ROOT = __dirname;
const CACHE_FILE = path.join(ROOT, "data", "live-cache.json");
const MENU_JS = path.join(ROOT, "js", "menu-data.js");

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PIN = String(process.env.ADMIN_PIN || "0000");
const SESSION_SECRET = String(process.env.SESSION_SECRET || crypto.randomBytes(24).toString("hex"));
const MENU_URL = String(process.env.MENU_URL || "https://hmeeti.github.io/unipub-menu/").replace(/\/?$/, "/");

const GH = {
  token: String(process.env.GITHUB_TOKEN || "").trim(),
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
      throw new Error(body.message || ("GitHub GET " + getRes.status));
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
    if (!putRes.ok) throw new Error(body.message || ("GitHub PUT " + putRes.status));
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
  console.log("UNIPUB admin on :" + PORT + " · github=" + Boolean(GH.token));
});
