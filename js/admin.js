/**
 * UNIPUB Admin — полный контроль меню + procedural starfield.
 * Данные: localStorage unipub:live-data (мгновенно в меню) + экспорт menu-data.js
 */
(function () {
  "use strict";

  var LIVE_KEY = "unipub:live-data";
  var PIN_KEY = "unipub:admin-pin";
  var AUTH_KEY = "unipub:admin-auth";
  var GH_KEY = "unipub:gh-config";
  var DEFAULT_PIN = "0000";
  var DEFAULT_GH = {
    owner: "Hmeeti",
    repo: "unipub-menu",
    branch: "main",
    path: "js/menu-data.js",
    token: "",
    autoPush: true
  };

  var FLAG_OPTS = [
    { id: "hit", label: "Хит" },
    { id: "new", label: "Новинка" },
    { id: "spicy", label: "Острое" },
    { id: "veg", label: "Веге" },
    { id: "gf", label: "Без глютена" },
    { id: "share", label: "Для компании" }
  ];

  var state = {
    data: null,
    tab: "items",
    query: "",
    toastTimer: null,
    editing: null,
    pushing: false
  };

  var $ = function (id) { return document.getElementById(id); };

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function toast(msg) {
    var el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("is-on");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () { el.classList.remove("is-on"); }, 3200);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function uid(prefix) {
    return (prefix || "id") + "_" + Date.now().toString(36) + Math.floor(Math.random() * 999);
  }

  function normalizePhone(v) {
    return String(v || "").replace(/\D/g, "");
  }

  function ensureShape(data) {
    var d = data && typeof data === "object" ? clone(data) : clone(window.UNIPUB_DATA);
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

  function loadData() {
    try {
      var raw = localStorage.getItem(LIVE_KEY);
      if (raw) return ensureShape(JSON.parse(raw));
    } catch (e) {}
    return ensureShape(window.UNIPUB_DATA);
  }

  function getGhConfig() {
    var cfg = clone(DEFAULT_GH);
    try {
      var raw = localStorage.getItem(GH_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          cfg.owner = String(parsed.owner || cfg.owner).trim() || cfg.owner;
          cfg.repo = String(parsed.repo || cfg.repo).trim() || cfg.repo;
          cfg.branch = String(parsed.branch || cfg.branch).trim() || cfg.branch;
          cfg.path = String(parsed.path || cfg.path).trim() || cfg.path;
          cfg.token = String(parsed.token || "").trim();
          cfg.autoPush = parsed.autoPush !== false;
        }
      }
    } catch (e) {}
    return cfg;
  }

  function setGhConfig(cfg) {
    try {
      localStorage.setItem(GH_KEY, JSON.stringify({
        owner: cfg.owner,
        repo: cfg.repo,
        branch: cfg.branch,
        path: cfg.path,
        token: cfg.token,
        autoPush: Boolean(cfg.autoPush)
      }));
    } catch (e) {}
  }

  function menuFileText() {
    return "window.UNIPUB_DATA = " + JSON.stringify(state.data, null, 2) + ";\n";
  }

  function utf8ToBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  function pushToGithub(opts) {
    opts = opts || {};
    var cfg = getGhConfig();
    if (!cfg.token) {
      if (!opts.silent) toast("Сначала вставь GitHub token в Система");
      return Promise.resolve(false);
    }
    if (state.pushing) {
      if (!opts.silent) toast("Уже пушу…");
      return Promise.resolve(false);
    }

    state.pushing = true;
    if (!opts.silent) toast("Пушу на GitHub…");

    var apiBase = "https://api.github.com/repos/" +
      encodeURIComponent(cfg.owner) + "/" +
      encodeURIComponent(cfg.repo) + "/contents/" +
      cfg.path.split("/").map(encodeURIComponent).join("/");
    var headers = {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + cfg.token,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    };

    return fetch(apiBase + "?ref=" + encodeURIComponent(cfg.branch), {
      headers: headers
    })
      .then(function (res) {
        if (res.status === 404) return { sha: null };
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            throw new Error((body && body.message) || ("HTTP " + res.status));
          });
        }
        return res.json();
      })
      .then(function (meta) {
        var body = {
          message: opts.message || ("Admin: update menu " + new Date().toISOString().slice(0, 16).replace("T", " ")),
          content: utf8ToBase64(menuFileText()),
          branch: cfg.branch
        };
        if (meta && meta.sha) body.sha = meta.sha;
        return fetch(apiBase, {
          method: "PUT",
          headers: headers,
          body: JSON.stringify(body)
        });
      })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (!res.ok) throw new Error((body && body.message) || ("HTTP " + res.status));
          return body;
        });
      })
      .then(function () {
        state.pushing = false;
        if (!opts.silent) toast("Запушено · сайт обновится через ~1 мин");
        return true;
      })
      .catch(function (err) {
        state.pushing = false;
        if (!opts.silent) toast("Пуш не вышел: " + (err && err.message ? err.message : "ошибка"));
        return false;
      });
  }

  function persist(silent) {
    try {
      localStorage.setItem(LIVE_KEY, JSON.stringify(state.data));
    } catch (e) {
      toast("Не удалось сохранить");
      return;
    }

    var cfg = getGhConfig();
    if (cfg.autoPush && cfg.token) {
      pushToGithub({ silent: Boolean(silent) });
    } else if (!silent) {
      toast(cfg.token ? "Сохранено локально (автопуш выкл)" : "Сохранено · нужен token для пуша");
    }
  }

  function getPin() {
    try { return localStorage.getItem(PIN_KEY) || DEFAULT_PIN; } catch (e) { return DEFAULT_PIN; }
  }

  function setPin(pin) {
    try { localStorage.setItem(PIN_KEY, String(pin || DEFAULT_PIN)); } catch (e) {}
  }

  function isAuthed() {
    try { return sessionStorage.getItem(AUTH_KEY) === "1"; } catch (e) { return false; }
  }

  function setAuthed(on) {
    try {
      if (on) sessionStorage.setItem(AUTH_KEY, "1");
      else sessionStorage.removeItem(AUTH_KEY);
    } catch (e) {}
  }

  /* ---------- Starfield (procedural, retina) ---------- */
  function initStarfield() {
    var canvas = $("starfield");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var stars = [];
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0;
    var h = 0;
    var raf = 0;

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function seed() {
      var count = Math.floor((w * h) / 380);
      stars = [];
      for (var i = 0; i < count; i += 1) {
        var bright = Math.random();
        var large = bright > 0.965;
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: large ? (1.8 + Math.random() * 2.2) : (0.25 + Math.random() * 0.75),
          a: large ? (0.75 + bright * 0.25) : (0.28 + bright * 0.55),
          tw: Math.random() * Math.PI * 2,
          sp: 0.002 + Math.random() * 0.008,
          glow: large
        });
      }
    }

    function frame(t) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);

      for (var i = 0; i < stars.length; i += 1) {
        var s = stars[i];
        var flicker = 0.72 + 0.28 * Math.sin(t * s.sp + s.tw);
        var alpha = s.a * flicker;
        if (s.glow) {
          var g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 3.6);
          g.addColorStop(0, "rgba(255,255,255," + (alpha * 0.95) + ")");
          g.addColorStop(0.4, "rgba(230,235,255," + (alpha * 0.22) + ")");
          g.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 3.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "rgba(255,255,255," + alpha + ")";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener("resize", resize, { passive: true });
    raf = requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(frame);
    });
  }

  /* ---------- UI helpers ---------- */
  function openSheet(html) {
    $("sheetPanel").innerHTML = html;
    $("sheet").hidden = false;
  }

  function closeSheet() {
    $("sheet").hidden = true;
    $("sheetPanel").innerHTML = "";
    state.editing = null;
  }

  function loc(obj, lang) {
    if (!obj) return "";
    if (typeof obj === "string") return obj;
    return obj[lang] || obj.ru || obj.en || "";
  }

  function setLoc(obj, lang, value) {
    if (!obj || typeof obj !== "object") obj = { ru: "", kz: "", en: "" };
    obj[lang] = value;
    return obj;
  }

  /* ---------- Screens ---------- */
  function render() {
    var titles = {
      items: "Блюда",
      taxonomy: "Разделы",
      venue: "Заведение",
      staff: "Зал",
      system: "Система"
    };
    $("screenTitle").textContent = titles[state.tab] || "Admin";
    Array.prototype.forEach.call(document.querySelectorAll(".tabbar__btn"), function (btn) {
      btn.classList.toggle("is-on", btn.getAttribute("data-tab") === state.tab);
    });

    if (state.tab === "items") renderItems();
    else if (state.tab === "taxonomy") renderTaxonomy();
    else if (state.tab === "venue") renderVenue();
    else if (state.tab === "staff") renderStaff();
    else renderSystem();
  }

  function renderItems() {
    var q = state.query.toLowerCase().trim();
    var items = state.data.items.filter(function (item) {
      if (!q) return true;
      var blob = (loc(item.name, "ru") + " " + loc(item.name, "en") + " " + (item.category || "")).toLowerCase();
      return blob.indexOf(q) !== -1;
    });

    var cats = state.data.categories.filter(function (c) { return c.id !== "all"; });
    var html = '<input class="search" id="itemSearch" type="search" placeholder="Поиск блюда…" value="' + escapeHtml(state.query) + '">' +
      '<div class="toolbar"><button type="button" class="btn btn--primary btn--block" id="addItem">+ Новое блюдо</button></div>' +
      '<div class="stack">';

    if (!items.length) html += '<div class="empty">Ничего не найдено</div>';

    items.forEach(function (item) {
      var cat = cats.filter(function (c) { return c.id === item.category; })[0];
      html +=
        '<article class="card" data-edit-item="' + escapeHtml(item.id) + '">' +
        '<div class="card__row">' +
        "<div><p class=\"card__title\">" + escapeHtml(loc(item.name, "ru")) + "</p>" +
        '<p class="card__meta">' + escapeHtml(cat ? loc(cat.title, "ru") : item.category) +
        (item.weight ? " · " + escapeHtml(item.weight) : "") + "</p></div>" +
        '<div class="card__price">' + Number(item.price || 0).toLocaleString("ru-RU") + " ₸</div>" +
        "</div>" +
        '<div class="chip-row">' +
        (item.flags || []).map(function (f) { return '<span class="chip chip--on">' + escapeHtml(f) + "</span>"; }).join("") +
        "</div></article>";
    });

    html += "</div>";
    $("content").innerHTML = html;
  }

  function renderTaxonomy() {
    var html = '<p class="section-label">Категории</p><div class="stack">';
    state.data.categories.forEach(function (cat) {
      html +=
        '<div class="card">' +
        '<div class="card__row">' +
        "<div><p class=\"card__title\">" + escapeHtml(loc(cat.title, "ru")) + "</p>" +
        '<p class="card__meta">' + escapeHtml(cat.id) + "</p></div>" +
        (cat.id === "all"
          ? ""
          : '<button type="button" class="btn btn--ghost btn--sm" data-edit-cat="' + escapeHtml(cat.id) + '">Изменить</button>') +
        "</div></div>";
    });
    html += '</div><div class="toolbar" style="margin-top:0.85rem"><button type="button" class="btn btn--primary btn--block" id="addCat">+ Категория</button></div>';

    html += '<p class="section-label" style="margin-top:1.2rem">Фильтры</p><div class="stack">';
    state.data.filters.forEach(function (f) {
      html +=
        '<div class="card">' +
        '<div class="card__row">' +
        "<div><p class=\"card__title\">" + escapeHtml(loc(f.title, "ru")) + "</p>" +
        '<p class="card__meta">' + escapeHtml(f.id) + "</p></div>" +
        '<button type="button" class="btn btn--ghost btn--sm" data-edit-filter="' + escapeHtml(f.id) + '">Изменить</button>' +
        "</div></div>";
    });
    html += '</div><div class="toolbar" style="margin-top:0.85rem"><button type="button" class="btn btn--ghost btn--block" id="addFilter">+ Фильтр</button></div>';
    $("content").innerHTML = html;
  }

  function renderVenue() {
    var v = state.data.venue;
    $("content").innerHTML =
      '<div class="card">' +
      field("name", "Название", v.name) +
      field("phone", "Телефон", v.phone) +
      field("phoneDisplay", "Телефон (отображение)", v.phoneDisplay) +
      field("whatsapp", "WhatsApp (цифры)", v.whatsapp) +
      field("instagram", "Instagram URL", v.instagram) +
      field("map2gis", "2ГИС URL", v.map2gis) +
      field("mapYandex", "Яндекс.Карты URL", v.mapYandex || "") +
      field("rating", "Рейтинг", v.rating) +
      field("reviews", "Отзывы", v.reviews) +
      field("tagline_ru", "Слоган RU", loc(v.tagline, "ru")) +
      field("tagline_kz", "Слоган KZ", loc(v.tagline, "kz")) +
      field("tagline_en", "Слоган EN", loc(v.tagline, "en")) +
      field("address_ru", "Адрес RU", loc(v.address, "ru")) +
      field("address_kz", "Адрес KZ", loc(v.address, "kz")) +
      field("address_en", "Адрес EN", loc(v.address, "en")) +
      field("hours_ru", "Часы RU", loc(v.hours, "ru")) +
      field("hours_kz", "Часы KZ", loc(v.hours, "kz")) +
      field("hours_en", "Часы EN", loc(v.hours, "en")) +
      '<button type="button" class="btn btn--primary btn--block" id="saveVenue">Сохранить заведение</button>' +
      "</div>";
  }

  function field(id, label, value) {
    return '<div class="field"><label for="' + id + '">' + escapeHtml(label) + '</label>' +
      '<input id="' + id + '" value="' + escapeHtml(value) + '"></div>';
  }

  function renderStaff() {
    var html =
      '<div class="stat-grid">' +
      '<div class="stat"><strong>' + Math.round((state.data.serviceRate || 0) * 100) + "%</strong><span>Сервис</span></div>" +
      '<div class="stat"><strong>' + state.data.waiters.length + "</strong><span>Официанты</span></div>" +
      "</div>" +
      '<div class="card">' +
      '<div class="field"><label for="serviceRate">Обслуживание (доля, 0.15 = 15%)</label>' +
      '<input id="serviceRate" type="number" step="0.01" min="0" max="1" value="' + escapeHtml(state.data.serviceRate) + '"></div>' +
      '<button type="button" class="btn btn--ghost btn--block" id="saveService">Обновить сервис</button>' +
      "</div>" +
      '<p class="section-label" style="margin-top:1rem">Официанты</p><div class="stack">';

    state.data.waiters.forEach(function (w) {
      html +=
        '<div class="card">' +
        '<div class="card__row">' +
        "<div><p class=\"card__title\">" + escapeHtml(w.name) + "</p>" +
        '<p class="card__meta">' + escapeHtml(w.display || w.phone) + "</p></div>" +
        '<button type="button" class="btn btn--ghost btn--sm" data-edit-waiter="' + escapeHtml(w.id) + '">Изменить</button>' +
        "</div></div>";
    });
    html += '</div><div class="toolbar" style="margin-top:0.85rem"><button type="button" class="btn btn--primary btn--block" id="addWaiter">+ Официант</button></div>';
    $("content").innerHTML = html;
  }

  function renderSystem() {
    var live = false;
    try { live = Boolean(localStorage.getItem(LIVE_KEY)); } catch (e) {}
    var gh = getGhConfig();
    $("content").innerHTML =
      '<div class="stat-grid">' +
      '<div class="stat"><strong>' + state.data.items.length + "</strong><span>Блюд</span></div>" +
      '<div class="stat"><strong>' + state.data.categories.length + "</strong><span>Категорий</span></div>" +
      "</div>" +
      '<div class="card">' +
      '<p class="card__title">Автопуш на GitHub</p>' +
      '<p class="card__meta" style="margin-bottom:0.75rem">Token хранится только на этом телефоне. Создай Fine-grained PAT с правом Contents: Read and write для репо unipub-menu.</p>' +
      '<div class="field"><label>GitHub token</label><input id="ghToken" type="password" autocomplete="off" placeholder="github_pat_…" value="' + escapeHtml(gh.token) + '"></div>' +
      '<div class="field"><label>Owner</label><input id="ghOwner" value="' + escapeHtml(gh.owner) + '"></div>' +
      '<div class="field"><label>Repo</label><input id="ghRepo" value="' + escapeHtml(gh.repo) + '"></div>' +
      '<div class="field"><label>Branch</label><input id="ghBranch" value="' + escapeHtml(gh.branch) + '"></div>' +
      '<div class="field"><label>Путь файла</label><input id="ghPath" value="' + escapeHtml(gh.path) + '"></div>' +
      '<label class="switch"><input type="checkbox" id="ghAuto"' + (gh.autoPush ? " checked" : "") + '><span>Автопуш при каждом сохранении</span></label>' +
      '<button type="button" class="btn btn--primary btn--block" id="saveGh" style="margin-top:0.75rem">Сохранить настройки GitHub</button>' +
      '<button type="button" class="btn btn--ghost btn--block" id="pushNow" style="margin-top:0.45rem">Пушнуть сейчас</button>' +
      "</div>" +
      '<div class="card" style="margin-top:0.75rem">' +
      '<p class="card__title">Правила (RU)</p>' +
      '<div class="field"><textarea id="rulesRu">' + escapeHtml((state.data.rules.ru || []).join("\n")) + "</textarea></div>" +
      '<p class="card__title">Правила (KZ)</p>' +
      '<div class="field"><textarea id="rulesKz">' + escapeHtml((state.data.rules.kz || []).join("\n")) + "</textarea></div>" +
      '<p class="card__title">Правила (EN)</p>' +
      '<div class="field"><textarea id="rulesEn">' + escapeHtml((state.data.rules.en || []).join("\n")) + "</textarea></div>" +
      '<button type="button" class="btn btn--primary btn--block" id="saveRules">Сохранить правила</button>' +
      "</div>" +
      '<div class="card" style="margin-top:0.75rem">' +
      '<p class="card__title">Популярный поиск</p>' +
      '<div class="field"><label>RU (через запятую)</label><input id="pqRu" value="' + escapeHtml((state.data.popularQueries.ru || []).join(", ")) + '"></div>' +
      '<div class="field"><label>KZ</label><input id="pqKz" value="' + escapeHtml((state.data.popularQueries.kz || []).join(", ")) + '"></div>' +
      '<div class="field"><label>EN</label><input id="pqEn" value="' + escapeHtml((state.data.popularQueries.en || []).join(", ")) + '"></div>' +
      '<button type="button" class="btn btn--ghost btn--block" id="savePq">Сохранить запросы</button>' +
      "</div>" +
      '<div class="card" style="margin-top:0.75rem">' +
      '<p class="card__title">Публикация</p>' +
      '<p class="card__meta" style="margin-bottom:0.75rem">Сейчас: ' + (live ? "live-данные на этом телефоне" : "базовый menu-data.js") +
      (gh.token ? (gh.autoPush ? " · автопуш вкл" : " · автопуш выкл") : " · token не задан") + "</p>" +
      '<button type="button" class="btn btn--ghost btn--block" id="exportJs">Скачать menu-data.js</button>' +
      '<button type="button" class="btn btn--ghost btn--block" id="exportJson" style="margin-top:0.45rem">Скачать JSON</button>' +
      '<button type="button" class="btn btn--ghost btn--block" id="importJson" style="margin-top:0.45rem">Импорт JSON</button>' +
      '<input id="importFile" type="file" accept="application/json,.json" hidden>' +
      '<button type="button" class="btn btn--danger btn--block" id="clearLive" style="margin-top:0.45rem">Сбросить live-данные</button>' +
      "</div>" +
      '<div class="card" style="margin-top:0.75rem">' +
      '<p class="card__title">Безопасность</p>' +
      '<div class="field"><label>Новый PIN</label><input id="newPin" type="password" inputmode="numeric" maxlength="12" placeholder="••••"></div>' +
      '<button type="button" class="btn btn--ghost btn--block" id="savePin">Сменить PIN</button>' +
      '<button type="button" class="btn btn--ghost btn--block" id="logout" style="margin-top:0.45rem">Выйти</button>' +
      "</div>";
  }

  /* ---------- Editors ---------- */
  function editItem(id) {
    var item = id ? state.data.items.filter(function (x) { return x.id === id; })[0] : null;
    var isNew = !item;
    if (isNew) {
      item = {
        id: uid("dish"),
        category: (state.data.categories[1] && state.data.categories[1].id) || "mains",
        name: { ru: "", kz: "", en: "" },
        desc: { ru: "", kz: "", en: "" },
        ingredients: { ru: "", kz: "", en: "" },
        price: 0,
        weight: "",
        cookTime: "",
        allergens: [],
        flags: [],
        image: "",
        imageAlt: ""
      };
    }
    state.editing = { type: "item", id: item.id, draft: clone(item), isNew: isNew };

    var catOpts = state.data.categories.filter(function (c) { return c.id !== "all"; }).map(function (c) {
      return '<option value="' + escapeHtml(c.id) + '"' + (c.id === item.category ? " selected" : "") + ">" +
        escapeHtml(loc(c.title, "ru")) + "</option>";
    }).join("");

    var flags = FLAG_OPTS.map(function (f) {
      var on = (item.flags || []).indexOf(f.id) !== -1;
      return '<button type="button" class="flag' + (on ? " is-on" : "") + '" data-flag="' + f.id + '">' + f.label + "</button>";
    }).join("");

    openSheet(
      '<div class="sheet__head"><h2>' + (isNew ? "Новое блюдо" : "Редактирование") + '</h2>' +
      '<button type="button" class="icon-btn" id="sheetClose">✕</button></div>' +
      '<div class="field"><label>Категория</label><select id="e_category">' + catOpts + "</select></div>" +
      '<div class="grid-2">' +
      '<div class="field"><label>Цена ₸</label><input id="e_price" type="number" inputmode="numeric" value="' + escapeHtml(item.price) + '"></div>' +
      '<div class="field"><label>Вес</label><input id="e_weight" value="' + escapeHtml(item.weight || "") + '"></div>' +
      "</div>" +
      '<div class="field"><label>Время</label><input id="e_cook" value="' + escapeHtml(item.cookTime || "") + '"></div>' +
      '<div class="field"><label>Название RU</label><input id="e_name_ru" value="' + escapeHtml(loc(item.name, "ru")) + '"></div>' +
      '<div class="field"><label>Название KZ</label><input id="e_name_kz" value="' + escapeHtml(loc(item.name, "kz")) + '"></div>' +
      '<div class="field"><label>Название EN</label><input id="e_name_en" value="' + escapeHtml(loc(item.name, "en")) + '"></div>' +
      '<div class="field"><label>Описание RU</label><textarea id="e_desc_ru">' + escapeHtml(loc(item.desc, "ru")) + "</textarea></div>" +
      '<div class="field"><label>Описание KZ</label><textarea id="e_desc_kz">' + escapeHtml(loc(item.desc, "kz")) + "</textarea></div>" +
      '<div class="field"><label>Описание EN</label><textarea id="e_desc_en">' + escapeHtml(loc(item.desc, "en")) + "</textarea></div>" +
      '<div class="field"><label>Состав RU</label><textarea id="e_ing_ru">' + escapeHtml(loc(item.ingredients, "ru")) + "</textarea></div>" +
      '<div class="field"><label>Состав KZ</label><textarea id="e_ing_kz">' + escapeHtml(loc(item.ingredients, "kz")) + "</textarea></div>" +
      '<div class="field"><label>Состав EN</label><textarea id="e_ing_en">' + escapeHtml(loc(item.ingredients, "en")) + "</textarea></div>" +
      '<div class="field"><label>Аллергены (через запятую)</label><input id="e_allergens" value="' + escapeHtml((item.allergens || []).join(", ")) + '"></div>' +
      '<div class="field"><label>Фото URL</label><input id="e_image" value="' + escapeHtml(item.image || "") + '"></div>' +
      '<div class="field"><label>Фото alt URL</label><input id="e_imageAlt" value="' + escapeHtml(item.imageAlt || "") + '"></div>' +
      '<p class="section-label">Метки</p><div class="flags" id="e_flags">' + flags + "</div>" +
      '<div class="toolbar" style="margin-top:1rem;flex-direction:column">' +
      '<button type="button" class="btn btn--primary btn--block" id="saveItem">Сохранить блюдо</button>' +
      (isNew ? "" : '<button type="button" class="btn btn--danger btn--block" id="deleteItem">Удалить</button>') +
      "</div>"
    );
  }

  function readItemForm(draft) {
    draft.category = $("e_category").value;
    draft.price = Number($("e_price").value) || 0;
    draft.weight = $("e_weight").value.trim();
    draft.cookTime = $("e_cook").value.trim();
    draft.name = {
      ru: $("e_name_ru").value.trim(),
      kz: $("e_name_kz").value.trim(),
      en: $("e_name_en").value.trim()
    };
    draft.desc = {
      ru: $("e_desc_ru").value.trim(),
      kz: $("e_desc_kz").value.trim(),
      en: $("e_desc_en").value.trim()
    };
    draft.ingredients = {
      ru: $("e_ing_ru").value.trim(),
      kz: $("e_ing_kz").value.trim(),
      en: $("e_ing_en").value.trim()
    };
    draft.allergens = $("e_allergens").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    draft.image = $("e_image").value.trim();
    draft.imageAlt = $("e_imageAlt").value.trim();
    draft.flags = Array.prototype.map.call(document.querySelectorAll("#e_flags .flag.is-on"), function (el) {
      return el.getAttribute("data-flag");
    });
    return draft;
  }

  function editSimpleTaxonomy(kind, id) {
    var list = kind === "cat" ? state.data.categories : state.data.filters;
    var row = id ? list.filter(function (x) { return x.id === id; })[0] : null;
    var isNew = !row;
    if (isNew) {
      row = { id: uid(kind === "cat" ? "cat" : "f"), title: { ru: "", kz: "", en: "" } };
    }
    state.editing = { type: kind, id: row.id, isNew: isNew };
    openSheet(
      '<div class="sheet__head"><h2>' + (kind === "cat" ? "Категория" : "Фильтр") + '</h2>' +
      '<button type="button" class="icon-btn" id="sheetClose">✕</button></div>' +
      '<div class="field"><label>ID</label><input id="t_id" value="' + escapeHtml(row.id) + '"' + (isNew ? "" : " readonly") + "></div>" +
      '<div class="field"><label>RU</label><input id="t_ru" value="' + escapeHtml(loc(row.title, "ru")) + '"></div>' +
      '<div class="field"><label>KZ</label><input id="t_kz" value="' + escapeHtml(loc(row.title, "kz")) + '"></div>' +
      '<div class="field"><label>EN</label><input id="t_en" value="' + escapeHtml(loc(row.title, "en")) + '"></div>' +
      '<button type="button" class="btn btn--primary btn--block" id="saveTax">Сохранить</button>' +
      (isNew || row.id === "all" ? "" : '<button type="button" class="btn btn--danger btn--block" id="deleteTax" style="margin-top:0.45rem">Удалить</button>')
    );
  }

  function editWaiter(id) {
    var w = id ? state.data.waiters.filter(function (x) { return x.id === id; })[0] : null;
    var isNew = !w;
    if (isNew) w = { id: uid("waiter"), name: "", phone: "", display: "" };
    state.editing = { type: "waiter", id: w.id, isNew: isNew };
    openSheet(
      '<div class="sheet__head"><h2>Официант</h2><button type="button" class="icon-btn" id="sheetClose">✕</button></div>' +
      '<div class="field"><label>Имя</label><input id="w_name" value="' + escapeHtml(w.name) + '"></div>' +
      '<div class="field"><label>Телефон (цифры, 77…)</label><input id="w_phone" inputmode="numeric" value="' + escapeHtml(w.phone) + '"></div>' +
      '<div class="field"><label>Отображение</label><input id="w_display" value="' + escapeHtml(w.display || "") + '"></div>' +
      '<button type="button" class="btn btn--primary btn--block" id="saveWaiter">Сохранить</button>' +
      (isNew ? "" : '<button type="button" class="btn btn--danger btn--block" id="deleteWaiter" style="margin-top:0.45rem">Удалить</button>')
    );
  }

  function download(filename, text, type) {
    var blob = new Blob([text], { type: type || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportMenuJs() {
    download("menu-data.js", menuFileText(), "text/javascript;charset=utf-8");
    toast("Файл скачан");
  }

  /* ---------- Events ---------- */
  function bind() {
    $("pinEnter").addEventListener("click", tryLogin);
    $("pinInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") tryLogin();
    });

    document.querySelector(".tabbar").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-tab]");
      if (!btn) return;
      state.tab = btn.getAttribute("data-tab");
      state.query = "";
      render();
    });

    $("btnSave").addEventListener("click", function () { persist(false); });
    $("btnPreview").addEventListener("click", function () {
      persist(true);
      window.open("./index.html", "_blank");
    });

    $("sheetBackdrop").addEventListener("click", closeSheet);

    $("content").addEventListener("input", function (e) {
      if (e.target.id === "itemSearch") {
        state.query = e.target.value;
        renderItems();
        var input = $("itemSearch");
        if (input) {
          input.focus();
          var val = input.value;
          input.setSelectionRange(val.length, val.length);
        }
      }
    });

    $("content").addEventListener("click", function (e) {
      if (e.target.id === "addItem") return editItem(null);
      if (e.target.id === "addCat") return editSimpleTaxonomy("cat", null);
      if (e.target.id === "addFilter") return editSimpleTaxonomy("filter", null);
      if (e.target.id === "addWaiter") return editWaiter(null);

      var itemCard = e.target.closest("[data-edit-item]");
      if (itemCard) return editItem(itemCard.getAttribute("data-edit-item"));

      var catBtn = e.target.closest("[data-edit-cat]");
      if (catBtn) return editSimpleTaxonomy("cat", catBtn.getAttribute("data-edit-cat"));

      var fBtn = e.target.closest("[data-edit-filter]");
      if (fBtn) return editSimpleTaxonomy("filter", fBtn.getAttribute("data-edit-filter"));

      var wBtn = e.target.closest("[data-edit-waiter]");
      if (wBtn) return editWaiter(wBtn.getAttribute("data-edit-waiter"));

      if (e.target.id === "saveVenue") {
        var v = state.data.venue;
        v.name = $("name").value.trim();
        v.phone = $("phone").value.trim();
        v.phoneDisplay = $("phoneDisplay").value.trim();
        v.whatsapp = normalizePhone($("whatsapp").value);
        v.instagram = $("instagram").value.trim();
        v.map2gis = $("map2gis").value.trim();
        v.mapYandex = $("mapYandex").value.trim();
        v.rating = $("rating").value.trim();
        v.reviews = $("reviews").value.trim();
        v.tagline = { ru: $("tagline_ru").value.trim(), kz: $("tagline_kz").value.trim(), en: $("tagline_en").value.trim() };
        v.address = { ru: $("address_ru").value.trim(), kz: $("address_kz").value.trim(), en: $("address_en").value.trim() };
        v.hours = { ru: $("hours_ru").value.trim(), kz: $("hours_kz").value.trim(), en: $("hours_en").value.trim() };
        persist(false);
        return;
      }

      if (e.target.id === "saveService") {
        state.data.serviceRate = Math.max(0, Math.min(1, Number($("serviceRate").value) || 0));
        persist(false);
        render();
        return;
      }

      if (e.target.id === "saveRules") {
        state.data.rules.ru = $("rulesRu").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
        state.data.rules.kz = $("rulesKz").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
        state.data.rules.en = $("rulesEn").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
        persist(false);
        return;
      }

      if (e.target.id === "savePq") {
        function splitCsv(v) { return v.split(",").map(function (s) { return s.trim(); }).filter(Boolean); }
        state.data.popularQueries.ru = splitCsv($("pqRu").value);
        state.data.popularQueries.kz = splitCsv($("pqKz").value);
        state.data.popularQueries.en = splitCsv($("pqEn").value);
        persist(false);
        return;
      }

      if (e.target.id === "exportJs") return exportMenuJs();
      if (e.target.id === "exportJson") {
        download("unipub-data.json", JSON.stringify(state.data, null, 2), "application/json");
        toast("JSON скачан");
        return;
      }
      if (e.target.id === "importJson") return $("importFile").click();
      if (e.target.id === "saveGh") {
        setGhConfig({
          owner: $("ghOwner").value.trim() || DEFAULT_GH.owner,
          repo: $("ghRepo").value.trim() || DEFAULT_GH.repo,
          branch: $("ghBranch").value.trim() || DEFAULT_GH.branch,
          path: $("ghPath").value.trim() || DEFAULT_GH.path,
          token: $("ghToken").value.trim(),
          autoPush: $("ghAuto").checked
        });
        toast("GitHub настройки сохранены");
        render();
        return;
      }
      if (e.target.id === "pushNow") {
        persist(true);
        pushToGithub({ silent: false, message: "Admin: manual publish" });
        return;
      }
      if (e.target.id === "clearLive") {
        try { localStorage.removeItem(LIVE_KEY); } catch (err) {}
        state.data = ensureShape(window.UNIPUB_DATA);
        toast("Live сброшен");
        render();
        return;
      }
      if (e.target.id === "savePin") {
        var pin = $("newPin").value.trim();
        if (pin.length < 4) return toast("PIN от 4 символов");
        setPin(pin);
        $("newPin").value = "";
        toast("PIN обновлён");
        return;
      }
      if (e.target.id === "logout") {
        setAuthed(false);
        location.reload();
      }
    });

    $("content").addEventListener("change", function (e) {
      if (e.target.id !== "importFile" || !e.target.files || !e.target.files[0]) return;
      var file = e.target.files[0];
      var reader = new FileReader();
      reader.onload = function () {
        try {
          state.data = ensureShape(JSON.parse(reader.result));
          persist(false);
          render();
          toast("Импорт готов");
        } catch (err) {
          toast("Битый JSON");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });

    $("sheetPanel").addEventListener("click", function (e) {
      if (e.target.id === "sheetClose") return closeSheet();

      var flag = e.target.closest("[data-flag]");
      if (flag) {
        flag.classList.toggle("is-on");
        return;
      }

      if (e.target.id === "saveItem") {
        var draft = readItemForm(state.editing.draft);
        if (!draft.name.ru) return toast("Нужно название RU");
        if (state.editing.isNew) state.data.items.push(draft);
        else {
          state.data.items = state.data.items.map(function (it) {
            return it.id === draft.id ? draft : it;
          });
        }
        persist(false);
        closeSheet();
        render();
        return;
      }

      if (e.target.id === "deleteItem") {
        state.data.items = state.data.items.filter(function (it) { return it.id !== state.editing.id; });
        persist(false);
        closeSheet();
        render();
        return;
      }

      if (e.target.id === "saveTax") {
        var id = $("t_id").value.trim();
        var title = { ru: $("t_ru").value.trim(), kz: $("t_kz").value.trim(), en: $("t_en").value.trim() };
        if (!id || !title.ru) return toast("ID и RU обязательны");
        var listKey = state.editing.type === "cat" ? "categories" : "filters";
        if (state.editing.isNew) {
          if (state.data[listKey].some(function (x) { return x.id === id; })) return toast("ID занят");
          state.data[listKey].push({ id: id, title: title });
        } else {
          state.data[listKey] = state.data[listKey].map(function (x) {
            return x.id === state.editing.id ? { id: x.id, title: title } : x;
          });
        }
        persist(false);
        closeSheet();
        render();
        return;
      }

      if (e.target.id === "deleteTax") {
        var key = state.editing.type === "cat" ? "categories" : "filters";
        var delId = state.editing.id;
        if (key === "categories") {
          state.data.items = state.data.items.filter(function (it) { return it.category !== delId; });
        }
        state.data[key] = state.data[key].filter(function (x) { return x.id !== delId; });
        persist(false);
        closeSheet();
        render();
        return;
      }

      if (e.target.id === "saveWaiter") {
        var waiter = {
          id: state.editing.id,
          name: $("w_name").value.trim(),
          phone: normalizePhone($("w_phone").value),
          display: $("w_display").value.trim()
        };
        if (!waiter.name || !waiter.phone) return toast("Имя и телефон обязательны");
        if (!waiter.display) waiter.display = "+" + waiter.phone;
        if (state.editing.isNew) state.data.waiters.push(waiter);
        else {
          state.data.waiters = state.data.waiters.map(function (w) {
            return w.id === waiter.id ? waiter : w;
          });
        }
        persist(false);
        closeSheet();
        render();
        return;
      }

      if (e.target.id === "deleteWaiter") {
        state.data.waiters = state.data.waiters.filter(function (w) { return w.id !== state.editing.id; });
        persist(false);
        closeSheet();
        render();
      }
    });
  }

  function tryLogin() {
    var pin = $("pinInput").value.trim();
    if (pin === getPin()) {
      setAuthed(true);
      enterApp();
    } else {
      $("pinErr").hidden = false;
    }
  }

  function enterApp() {
    $("gate").hidden = true;
    $("app").hidden = false;
    state.data = loadData();
    render();
  }

  function boot() {
    initStarfield();
    bind();
    if (isAuthed()) enterApp();
    else $("pinInput").focus();
  }

  boot();
})();
