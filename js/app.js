/**
 * UNIPUB — основное приложение меню.
 * Загрузка JSON, фильтры, модалка, WhatsApp, recent, PWA hooks.
 */
(function () {
  "use strict";

  var STORAGE = {
    recent: "unipub:recent",
    theme: "unipub:theme",
    cart: "unipub:cart",
    table: "unipub:table",
    splitOn: "unipub:split-on",
    splitPeople: "unipub:split-people",
    splitAssign: "unipub:split-assign"
  };

  var SERVICE_RATE = 0.15;
  var SHARED_ID = "shared";

  var DEFAULT_WAITERS = [
    { id: "eleanora", name: "Элеанора", phone: "77771172605", display: "+7 777 117 2605" },
    { id: "ekaterina", name: "Екатерина", phone: "77056522248", display: "+7 705 652 2248" },
    { id: "marina", name: "Марина", phone: "77055705732", display: "+7 705 570 5732" },
    { id: "anastasia", name: "Анастасия", phone: "77085887959", display: "+7 708 588 7959" }
  ];

  var WAITERS = DEFAULT_WAITERS.slice();
  var langGen = 0;
  var sectionEls = [];

  var ALLERGEN_MAP = {
    "глютен": { ru: "глютен", kz: "глютен", en: "gluten" },
    "молоко": { ru: "молоко", kz: "сүт", en: "milk" },
    "яйца": { ru: "яйца", kz: "жұмыртқа", en: "eggs" },
    "рыба": { ru: "рыба", kz: "балық", en: "fish" },
    "морепродукты": { ru: "морепродукты", kz: "теңіз өнімдері", en: "seafood" },
    "орехи": { ru: "орехи", kz: "жаңғақ", en: "nuts" },
    "арахис": { ru: "арахис", kz: "жержаңғақ", en: "peanuts" },
    "соя": { ru: "соя", kz: "соя", en: "soy" },
    "кунжут": { ru: "кунжут", kz: "кунжут", en: "sesame" },
    "горчица": { ru: "горчица", kz: "қыша", en: "mustard" },
    "сельдерей": { ru: "сельдерей", kz: "селдерей", en: "celery" },
    "люпин": { ru: "люпин", kz: "люпин", en: "lupin" },
    "моллюски": { ru: "моллюски", kz: "моллюскалар", en: "molluscs" },
    "сульфиты": { ru: "сульфиты", kz: "сульфиттер", en: "sulphites" }
  };

  function servicePct() {
    return Math.round(SERVICE_RATE * 100);
  }

  function serviceLabel() {
    return UnipubI18n.t("basketService").replace(/15/g, String(servicePct()));
  }

  function splashServiceLabel() {
    return UnipubI18n.t("serviceFeeSplash").replace(/15/g, String(servicePct()));
  }

  function allergenLabel(a) {
    var key = String(a || "").trim().toLowerCase();
    var mapped = ALLERGEN_MAP[key];
    if (mapped) return UnipubI18n.localized(mapped);
    return UnipubI18n.localized(a);
  }

  function resolveMenuData() {
    return window.UNIPUB_DATA || null;
  }

  function applyRuntimeConfig(data) {
    if (!data) return;
    if (typeof data.serviceRate === "number" && data.serviceRate >= 0) {
      SERVICE_RATE = data.serviceRate;
    }
    if (Array.isArray(data.waiters) && data.waiters.length) {
      WAITERS = data.waiters.map(function (w) {
        return {
          id: String(w.id || "").trim() || ("w" + Date.now()),
          name: String(w.name || "").trim() || "Официант",
          phone: String(w.phone || "").replace(/\D/g, ""),
          display: String(w.display || w.phone || "").trim()
        };
      }).filter(function (w) { return w.phone; });
    } else {
      WAITERS = DEFAULT_WAITERS.slice();
    }
  }

  var state = {
    data: null,
    category: "all",
    filters: {},
    query: "",
    itemsById: {},
    toastTimer: null,
    activeDishId: null,
    cart: {},
    basketOpen: false,
    waitersOpen: false,
    splitOn: false,
    splitPeople: [],
    splitAssign: {}
  };

  var els = {};

  function $(id) { return document.getElementById(id); }

  function money(n) {
    var value = Number(n);
    if (!Number.isFinite(value)) return "— ₸";
    return value.toLocaleString("ru-RU") + " ₸";
  }

  function showToast(msg) {
    if (!els.toast) return;
    els.toast.textContent = msg;
    els.toast.classList.add("is-on");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(function () {
      if (els.toast) els.toast.classList.remove("is-on");
    }, 2600);
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var ctx = this;
      var args = arguments;
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        fn.apply(ctx, args);
      }, wait);
    };
  }

  function throttleRaf(fn) {
    var scheduled = false;
    var lastArgs = null;
    return function () {
      lastArgs = arguments;
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(function () {
        scheduled = false;
        fn.apply(null, lastArgs);
      });
    };
  }

  function getRecent() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE.recent) || "[]");
    } catch (e) {
      return [];
    }
  }

  function pushRecent(id) {
    var list = getRecent().filter(function (x) { return x !== id; });
    list.unshift(id);
    list = list.slice(0, 8);
    try { localStorage.setItem(STORAGE.recent, JSON.stringify(list)); } catch (e) {}
    renderRecent();
  }

  function setTheme(theme) {
    var next = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(STORAGE.theme, next); } catch (e) {}
    els.themeBtn.textContent = next === "light" ? UnipubI18n.t("themeDark") : UnipubI18n.t("themeLight");
  }

  function greetingText() {
    var hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return UnipubI18n.t("greetingMorning");
    if (hour >= 12 && hour < 18) return UnipubI18n.t("greetingDay");
    if (hour >= 18 && hour < 24) return UnipubI18n.t("greetingEvening");
    return UnipubI18n.t("greetingNight");
  }

  function flagLabel(flag) {
    var map = {
      hit: { ru: "Хит", kz: "Хит", en: "Hit" },
      new: { ru: "Новинка", kz: "Жаңа", en: "New" },
      spicy: { ru: "Острое", kz: "Ащы", en: "Spicy" },
      veg: { ru: "Веге", kz: "Веге", en: "Veg" },
      gf: { ru: "Без глютена", kz: "Глютенсіз", en: "GF" },
      share: { ru: "Для компании", kz: "Компанияға", en: "Share" }
    };
    return UnipubI18n.localized(map[flag] || { ru: flag, kz: flag, en: flag });
  }

  function badgeClass(flag) {
    return "badge badge--" + flag;
  }

  function whatsappUrl(text, phoneOverride) {
    var phone = phoneOverride || state.data.venue.whatsapp;
    return "https://wa.me/" + phone + "?text=" + encodeURIComponent(text);
  }

  function hideSplash() {
    if (!els.splash) return;
    els.splash.classList.add("is-hidden");
  }

  function startSplash() {
    var ms = 2800;
    try {
      if (localStorage.getItem("unipub:seen-splash") === "1") ms = 900;
      else localStorage.setItem("unipub:seen-splash", "1");
    } catch (e) {}
    window.setTimeout(hideSplash, ms);
    window.setTimeout(function () {
      hideSplash();
      setTxOverlay(false);
    }, Math.max(ms + 500, 4000));
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error("timeout"));
      }, ms);
      Promise.resolve(promise).then(
        function (value) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(value);
        },
        function (err) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  function renderHeaderContacts() {
    var v = state.data.venue;
    els.logoSub.textContent = UnipubI18n.localized(v.tagline);
    els.greeting.innerHTML = greetingText().replace("UNIPUB", "<strong>UNIPUB</strong>");

    els.contacts.innerHTML = [
      '<a class="contact-pill" href="tel:' + v.phone + '">' + UnipubI18n.t("phone") + "</a>",
      '<a class="contact-pill contact-pill--wa" target="_blank" rel="noopener" href="' + whatsappUrl("Здравствуйте! Пишу из меню UNIPUB.") + '">' + UnipubI18n.t("wa") + "</a>",
      '<a class="contact-pill contact-pill--ig" target="_blank" rel="noopener" href="' + v.instagram + '">' + UnipubI18n.t("ig") + "</a>",
      '<a class="contact-pill contact-pill--map" target="_blank" rel="noopener" href="' + v.map2gis + '">' + UnipubI18n.t("openMaps") + "</a>"
    ].join("");

    els.footerGrid.innerHTML = [
      "<div><strong>UNIPUB</strong></div>",
      "<div>" + UnipubSearch.escapeHtml(UnipubI18n.localized(v.address)) + "</div>",
      "<div><a href=\"tel:" + v.phone + "\">" + v.phoneDisplay + "</a> · " + UnipubSearch.escapeHtml(UnipubI18n.localized(v.hours)) + "</div>",
      "<div>★ " + v.rating + " · " + v.reviews + "</div>"
    ].join("");
  }

  function renderTabs() {
    var html = state.data.categories.map(function (cat) {
      var active = cat.id === state.category ? " is-active" : "";
      return (
        '<button class="tab' + active + '" type="button" role="tab" data-category="' + cat.id + '" aria-selected="' +
        (cat.id === state.category) + '"><span class="dot" aria-hidden="true"></span>' +
        UnipubSearch.escapeHtml(UnipubI18n.localized(cat.title)) +
        "</button>"
      );
    }).join("");
    els.tabs.innerHTML = html;
  }

  function renderFilters() {
    els.filters.innerHTML = state.data.filters.map(function (f) {
      var active = state.filters[f.id] ? " is-active" : "";
      return (
        '<button class="filter-btn' + active + '" type="button" data-filter="' + f.id + '" aria-pressed="' +
        Boolean(state.filters[f.id]) + '">' +
        UnipubSearch.escapeHtml(UnipubI18n.localized(f.title)) +
        "</button>"
      );
    }).join("");
  }

  function activeFilterIds() {
    return Object.keys(state.filters).filter(function (k) { return state.filters[k]; });
  }

  function itemMatchesFilters(item) {
    var active = activeFilterIds();
    if (!active.length) return true;
    var flags = item.flags || [];
    return active.every(function (f) { return flags.indexOf(f) !== -1; });
  }

  function itemSearchBlob(item) {
    return [
      UnipubI18n.localized(item.name),
      UnipubI18n.localized(item.desc),
      UnipubI18n.localized(item.ingredients),
      (item.allergens || []).join(" "),
      (item.flags || []).join(" "),
      item.weight || "",
      item.category
    ];
  }

  function renderMenu() {
    var byCat = {};
    state.data.categories.forEach(function (c) {
      if (c.id !== "all") byCat[c.id] = [];
    });

    state.data.items.forEach(function (item) {
      if (!byCat[item.category]) byCat[item.category] = [];
      byCat[item.category].push(item);
      state.itemsById[item.id] = item;
    });

    var html = [];
    state.data.categories.forEach(function (cat) {
      if (cat.id === "all") return;
      var items = byCat[cat.id] || [];
      if (!items.length) return;

      html.push('<section class="section-block" id="section-' + cat.id + '" data-section="' + cat.id + '">');
      html.push(
        '<div class="section-head"><span class="dot" aria-hidden="true"></span><h2>' +
        UnipubSearch.escapeHtml(UnipubI18n.localized(cat.title)) +
        "</h2></div><div class=\"grid\">"
      );

      items.forEach(function (item, idx) {
        var name = UnipubI18n.localized(item.name);
        var desc = UnipubI18n.localized(item.desc);
        var badges = (item.flags || []).map(function (f) {
          return '<span class="' + badgeClass(f) + '">' + UnipubSearch.escapeHtml(flagLabel(f)) + "</span>";
        }).join("");

        html.push(
          '<article class="card" tabindex="0" role="button" data-id="' + item.id + '" data-category="' + item.category + '" style="animation-delay:' + Math.min(idx * 0.03, 0.3) + 's">' +
          '<div class="card__media">' +
          '<div class="skeleton" aria-hidden="true"></div>' +
          '<div class="card__badges">' + badges + "</div>" +
          '<img loading="lazy" decoding="async" src="' + item.image + '" alt="' + UnipubSearch.escapeHtml(name) + '">' +
          "</div>" +
          '<div class="card__body">' +
          '<h3 class="card__title" data-field="name"></h3>' +
          '<p class="card__meta">' + UnipubSearch.escapeHtml(
            (item.weight ? UnipubI18n.localized(item.weight) : "") +
            (item.cookTime ? (item.weight ? " · " : "") + UnipubI18n.localized(item.cookTime) : "")
          ) + "</p>" +
          '<p class="card__desc" data-field="desc"></p>' +
          '<div class="card__foot"><span class="card__price">' + money(item.price) + "</span>" +
          '<button class="card__btn" type="button" data-open="' + item.id + '" aria-label="' + UnipubSearch.escapeHtml(UnipubI18n.t("details")) + '">+</button>' +
          "</div></div></article>"
        );
      });

      html.push("</div></section>");
    });

    els.menuRoot.innerHTML = html.join("");
    sectionEls = Array.prototype.slice.call(els.menuRoot.querySelectorAll(".section-block"));

    // Подставляем текст с возможной подсветкой + убираем skeleton после load
    Array.prototype.slice.call(els.menuRoot.querySelectorAll(".card")).forEach(function (card) {
      var item = state.itemsById[card.getAttribute("data-id")];
      if (!item) return;
      var nameEl = card.querySelector('[data-field="name"]');
      var descEl = card.querySelector('[data-field="desc"]');
      nameEl.innerHTML = UnipubSearch.highlight(UnipubI18n.localized(item.name), state.query);
      descEl.innerHTML = UnipubSearch.highlight(UnipubI18n.localized(item.desc), state.query);

      var img = card.querySelector("img");
      var sk = card.querySelector(".skeleton");
      if (img && sk) {
        if (img.complete) sk.remove();
        else img.addEventListener("load", function () { sk.remove(); }, { once: true });
        img.addEventListener("error", function () {
          sk.remove();
          img.style.display = "none";
        }, { once: true });
      }
    });

    applyFilters();
  }

  function applyFilters() {
    var cards = Array.prototype.slice.call(els.menuRoot.querySelectorAll(".card"));
    var visible = 0;

    cards.forEach(function (card) {
      var item = state.itemsById[card.getAttribute("data-id")];
      if (!item) return;

      var catOk = state.category === "all" || item.category === state.category;
      var filterOk = itemMatchesFilters(item);
      var search = UnipubSearch.matchQuery(state.query, itemSearchBlob(item));
      var show = catOk && filterOk && search.ok;

      card.classList.toggle("is-hidden", !show);
      if (show) {
        visible += 1;
        var nameEl = card.querySelector('[data-field="name"]');
        var descEl = card.querySelector('[data-field="desc"]');
        if (nameEl) nameEl.innerHTML = UnipubSearch.highlight(UnipubI18n.localized(item.name), state.query);
        if (descEl) descEl.innerHTML = UnipubSearch.highlight(UnipubI18n.localized(item.desc), state.query);
      }
    });

    Array.prototype.slice.call(els.menuRoot.querySelectorAll(".section-block")).forEach(function (section) {
      var count = section.querySelectorAll(".card:not(.is-hidden)").length;
      section.style.display = count ? "" : "none";
    });

    els.empty.classList.toggle("is-on", visible === 0);
    renderEmptyHints();
  }

  function renderEmptyHints() {
    var queries = (state.data.popularQueries && state.data.popularQueries[UnipubI18n.getLang()]) || [];
    els.empty.innerHTML =
      "<p>" + UnipubSearch.escapeHtml(UnipubI18n.t("empty")) + "</p>" +
      '<div class="empty__hints">' +
      queries.map(function (q) {
        return '<button type="button" class="suggest" data-suggest="' + UnipubSearch.escapeHtml(q) + '">' + UnipubSearch.escapeHtml(q) + "</button>";
      }).join("") +
      "</div>";
  }

  function renderRecent() {
    var ids = getRecent().filter(function (id) { return state.itemsById[id]; });
    if (!ids.length) {
      els.recent.classList.remove("is-on");
      return;
    }
    els.recent.classList.add("is-on");
    els.recent.innerHTML =
      '<h3 class="recent__title">' + UnipubSearch.escapeHtml(UnipubI18n.t("recent")) + "</h3>" +
      '<div class="recent__row">' +
      ids.map(function (id) {
        var item = state.itemsById[id];
        return (
          '<button class="recent__chip" type="button" data-open="' + id + '">' +
          '<img src="' + item.image + '" alt="" loading="lazy">' +
          UnipubSearch.escapeHtml(UnipubI18n.localized(item.name)) +
          "</button>"
        );
      }).join("") +
      "</div>";
  }

  function renderRules() {
    var list = UnipubI18n.localized(state.data.rules) || [];
    if (!Array.isArray(list)) list = state.data.rules.ru || [];
    els.rulesTitle.textContent = UnipubI18n.t("rulesTitle");
    els.rulesList.innerHTML = list.map(function (line) {
      return "<li>" + UnipubSearch.escapeHtml(line) + "</li>";
    }).join("");
  }

  function openModal(id) {
    var item = state.itemsById[id];
    if (!item) return;
    state.activeDishId = id;
    pushRecent(id);

    var name = UnipubI18n.localized(item.name);
    els.modalMedia.innerHTML =
      '<img src="' + (item.imageAlt || item.image) + '" alt="' + UnipubSearch.escapeHtml(name) + '">' +
      '<button class="modal__close" type="button" id="modalClose" aria-label="Close">×</button>';

    els.modalBody.innerHTML =
      '<div class="card__badges" style="position:static;margin-bottom:0.55rem">' +
      (item.flags || []).map(function (f) {
        return '<span class="' + badgeClass(f) + '">' + UnipubSearch.escapeHtml(flagLabel(f)) + "</span>";
      }).join("") +
      "</div>" +
      '<h3 class="modal__title">' + UnipubSearch.escapeHtml(name) + "</h3>" +
      '<p class="modal__price">' + money(item.price) + "</p>" +
      '<div class="modal__stats">' +
      (item.weight ? '<span class="stat">' + UnipubI18n.t("weight") + ": " + UnipubSearch.escapeHtml(UnipubI18n.localized(item.weight)) + "</span>" : "") +
      (item.cookTime ? '<span class="stat">' + UnipubI18n.t("cook") + ": " + UnipubSearch.escapeHtml(UnipubI18n.localized(item.cookTime)) + "</span>" : "") +
      "</div>" +
      '<p class="modal__text">' + UnipubSearch.escapeHtml(UnipubI18n.localized(item.desc)) + "</p>" +
      '<p class="modal__section-title">' + UnipubI18n.t("ingredients") + "</p>" +
      '<p class="modal__text">' + UnipubSearch.escapeHtml(UnipubI18n.localized(item.ingredients)) + "</p>" +
      '<p class="modal__section-title">' + UnipubI18n.t("allergens") + "</p>" +
      ((item.allergens || []).length
        ? '<div class="allergens">' + item.allergens.map(function (a) {
            return '<span class="allergen">' + UnipubSearch.escapeHtml(allergenLabel(a)) + "</span>";
          }).join("") + "</div>"
        : '<p class="modal__text">' + UnipubI18n.t("noAllergens") + "</p>") +
      '<div class="modal__actions">' +
      '<button class="btn btn--primary" type="button" id="btnOrder">' + UnipubI18n.t("addOrder") + "</button>" +
      '<button class="btn btn--ghost" type="button" id="btnWaiter">' + UnipubI18n.t("callWaiter") + "</button>" +
      "</div>" +
      '<button class="btn btn--ghost modal__share" type="button" id="btnShare">' + UnipubI18n.t("share") + "</button>";

    els.modal.classList.add("is-on");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    els.modal.classList.remove("is-on");
    if (!state.basketOpen) document.body.style.overflow = "";
    state.activeDishId = null;
  }

  function loadCart() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORAGE.cart) || "{}");
      state.cart = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    } catch (e) {
      state.cart = {};
    }
  }

  function sanitizeCart() {
    var next = {};
    Object.keys(state.cart || {}).forEach(function (id) {
      if (!state.itemsById[id]) return;
      var qty = Math.max(0, Math.min(99, Number(state.cart[id]) || 0));
      if (qty > 0) next[id] = qty;
    });
    state.cart = next;
    saveCart();
  }

  function saveCart() {
    try { localStorage.setItem(STORAGE.cart, JSON.stringify(state.cart)); } catch (e) {}
  }

  function defaultSplitPeople() {
    return [
      { id: "p1", name: UnipubI18n.t("splitMe") },
      { id: "p2", name: UnipubI18n.t("splitFriend") }
    ];
  }

  function loadSplit() {
    try {
      state.splitOn = localStorage.getItem(STORAGE.splitOn) === "1";
      var people = JSON.parse(localStorage.getItem(STORAGE.splitPeople) || "null");
      state.splitPeople = Array.isArray(people) && people.length ? people : defaultSplitPeople();
      var assign = JSON.parse(localStorage.getItem(STORAGE.splitAssign) || "{}");
      state.splitAssign = assign && typeof assign === "object" ? assign : {};
    } catch (e) {
      state.splitOn = false;
      state.splitPeople = defaultSplitPeople();
      state.splitAssign = {};
    }
  }

  function saveSplit() {
    try {
      localStorage.setItem(STORAGE.splitOn, state.splitOn ? "1" : "0");
      localStorage.setItem(STORAGE.splitPeople, JSON.stringify(state.splitPeople));
      localStorage.setItem(STORAGE.splitAssign, JSON.stringify(state.splitAssign));
    } catch (e) {}
  }

  function newPersonId() {
    return "p" + Date.now().toString(36) + Math.floor(Math.random() * 1000);
  }

  function getItemOwner(itemId) {
    var owner = state.splitAssign[itemId];
    if (owner === SHARED_ID) return SHARED_ID;
    var exists = state.splitPeople.some(function (p) { return p.id === owner; });
    return exists ? owner : (state.splitPeople[0] && state.splitPeople[0].id) || SHARED_ID;
  }

  function setItemOwner(itemId, ownerId) {
    state.splitAssign[itemId] = ownerId;
    saveSplit();
    renderBasket();
  }

  function ensureAssignments() {
    Object.keys(state.cart).forEach(function (id) {
      if (!state.cart[id]) return;
      if (!state.splitAssign[id]) {
        state.splitAssign[id] = (state.splitPeople[0] && state.splitPeople[0].id) || SHARED_ID;
      }
    });
    Object.keys(state.splitAssign).forEach(function (id) {
      if (!state.cart[id]) delete state.splitAssign[id];
    });
  }

  /**
   * Считает долю каждого человека: личные позиции + равная доля «Общего» + сервис.
   * Округление: сначала точные доли, потом копейки добиваем в service последнего.
   */
  function calcSplit() {
    ensureAssignments();
    var peopleCount = Math.max(state.splitPeople.length, 1);
    var buckets = {};
    state.splitPeople.forEach(function (p) {
      buckets[p.id] = { id: p.id, name: p.name, sub: 0 };
    });

    Object.keys(state.cart).forEach(function (id) {
      var item = state.itemsById[id];
      var qty = Number(state.cart[id]) || 0;
      if (!item || qty <= 0) return;
      var line = item.price * qty;
      var owner = getItemOwner(id);
      if (owner === SHARED_ID) {
        var share = line / peopleCount;
        state.splitPeople.forEach(function (p) {
          buckets[p.id].sub += share;
        });
      } else if (buckets[owner]) {
        buckets[owner].sub += line;
      }
    });

    var parts = state.splitPeople.map(function (p) {
      var sub = Math.round(buckets[p.id].sub);
      var service = Math.round(sub * SERVICE_RATE);
      return {
        id: p.id,
        name: p.name,
        sub: sub,
        service: service,
        total: sub + service
      };
    });

    var sumParts = parts.reduce(function (s, row) { return s + row.total; }, 0);
    var diff = cartGrandTotal() - sumParts;
    if (diff && parts.length) {
      var last = parts[parts.length - 1];
      last.service += diff;
      last.total += diff;
    }
    return parts;
  }

  function toggleSplit() {
    state.splitOn = !state.splitOn;
    if (state.splitOn && !state.splitPeople.length) {
      state.splitPeople = defaultSplitPeople();
    }
    saveSplit();
    renderBasket();
    if (state.splitOn) {
      window.setTimeout(function () {
        if (els.basketSplitPanel) {
          els.basketSplitPanel.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      }, 40);
    }
  }

  function addSplitPerson() {
    if (state.splitPeople.length >= 8) {
      showToast(UnipubI18n.t("splitMaxPeople"));
      return;
    }
    var name = UnipubI18n.t("splitGuest") + " " + (state.splitPeople.length + 1);
    state.splitPeople.push({ id: newPersonId(), name: name });
    saveSplit();
    renderBasket();
  }

  function removeSplitPerson(personId) {
    if (state.splitPeople.length <= 1) return;
    state.splitPeople = state.splitPeople.filter(function (p) { return p.id !== personId; });
    var fallback = state.splitPeople[0].id;
    Object.keys(state.splitAssign).forEach(function (itemId) {
      if (state.splitAssign[itemId] === personId) state.splitAssign[itemId] = fallback;
    });
    saveSplit();
    renderBasket();
  }

  function renameSplitPerson(personId, name) {
    var next = String(name || "").trim().slice(0, 18);
    if (!next) return;
    var changed = false;
    state.splitPeople.forEach(function (p) {
      if (p.id === personId && p.name !== next) {
        p.name = next;
        changed = true;
      }
    });
    if (!changed) return;
    saveSplit();
    // Не пересобираем весь лист — только суммы (инпуты сохраняют фокус)
    if (els.basketSplitSum) {
      var parts = calcSplit();
      els.basketSplitSum.innerHTML =
        '<p class="split-sum__title">' + UnipubSearch.escapeHtml(UnipubI18n.t("splitByPerson")) + "</p>" +
        parts.map(function (part) {
          return (
            '<div class="split-sum__row">' +
            "<strong>" + UnipubSearch.escapeHtml(part.name) + "</strong>" +
            "<span>" + money(part.total) + "</span>" +
            "</div>" +
            '<div class="split-sum__meta">' +
            UnipubSearch.escapeHtml(UnipubI18n.t("basketSub")) + " " + money(part.sub) +
            " · " + UnipubSearch.escapeHtml(serviceLabel()) + " " + money(part.service) +
            "</div>"
          );
        }).join("");
    }
  }

  function cartCount() {
    return Object.keys(state.cart).reduce(function (sum, id) {
      return sum + (Number(state.cart[id]) || 0);
    }, 0);
  }

  function cartSubtotal() {
    return Object.keys(state.cart).reduce(function (sum, id) {
      var item = state.itemsById[id];
      var qty = Number(state.cart[id]) || 0;
      if (!item || qty <= 0) return sum;
      return sum + item.price * qty;
    }, 0);
  }

  function cartService() {
    return Math.round(cartSubtotal() * SERVICE_RATE);
  }

  function cartGrandTotal() {
    return cartSubtotal() + cartService();
  }

  function getTable() {
    return String((els.basketTable && els.basketTable.value) || "").replace(/\D/g, "").slice(0, 4);
  }

  function saveTable() {
    try { localStorage.setItem(STORAGE.table, getTable()); } catch (e) {}
  }

  function loadTable() {
    try {
      var t = localStorage.getItem(STORAGE.table);
      if (t && els.basketTable) els.basketTable.value = t;
    } catch (e) {}
  }

  function addToCart(item) {
    if (!item || !item.id) return;
    state.cart[item.id] = (Number(state.cart[item.id]) || 0) + 1;
    saveCart();
    renderBasket();
    showToast(UnipubI18n.t("toastOrder"));
  }

  function setCartQty(id, qty) {
    var next = Math.max(0, Math.min(99, Number(qty) || 0));
    if (next <= 0) delete state.cart[id];
    else state.cart[id] = next;
    saveCart();
    renderBasket();
  }

  function clearCart() {
    state.cart = {};
    state.waitersOpen = false;
    state.splitAssign = {};
    saveCart();
    saveSplit();
    state.basketOpen = false;
    renderBasket();
  }

  function buildOrderText(waiterName) {
    var lines = [];
    Object.keys(state.cart).forEach(function (id) {
      var item = state.itemsById[id];
      var qty = Number(state.cart[id]) || 0;
      if (!item || qty <= 0) return;
      var who = "";
      if (state.splitOn) {
        var owner = getItemOwner(id);
        if (owner === SHARED_ID) who = " [" + UnipubI18n.t("splitShared") + "]";
        else {
          var person = state.splitPeople.filter(function (p) { return p.id === owner; })[0];
          if (person) who = " [" + person.name + "]";
        }
      }
      lines.push(qty + "× " + UnipubI18n.localized(item.name) + " — " + money(item.price * qty) + who);
    });

    var table = getTable() || "—";
    var sub = cartSubtotal();
    var service = cartService();
    var total = cartGrandTotal();

    var out = [
      "UNIPUB — заказ",
      "Стол: " + table,
      "Официант: " + waiterName,
      "",
      lines.join("\n"),
      "",
      UnipubI18n.t("basketSub") + ": " + money(sub),
      serviceLabel() + ": " + money(service),
      UnipubI18n.t("basketTotal") + ": " + money(total)
    ];

    if (state.splitOn && state.splitPeople.length) {
      out.push("", UnipubI18n.t("splitByPerson") + ":");
      calcSplit().forEach(function (part) {
        out.push(part.name + " — " + money(part.total));
      });
    }

    return out.join("\n");
  }

  function requireTableAndCart() {
    if (!cartCount()) {
      showToast(UnipubI18n.t("basketEmpty"));
      return false;
    }
    if (!getTable()) {
      showToast(UnipubI18n.t("toastNeedTable"));
      if (els.basketTable) els.basketTable.focus();
      return false;
    }
    return true;
  }

  function showWaitersPicker() {
    if (!cartCount()) {
      showToast(UnipubI18n.t("basketEmpty"));
      return;
    }
    state.waitersOpen = true;
    renderBasket();
    if (!getTable()) {
      showToast(UnipubI18n.t("toastNeedTable"));
      if (els.basketTable) els.basketTable.focus();
    }
    window.setTimeout(function () {
      if (els.basketWaiters) {
        els.basketWaiters.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }, 50);
  }

  function sendToWaiter(waiter) {
    if (!waiter) return;
    if (!requireTableAndCart()) return;
    var text = buildOrderText(waiter.name);
    window.open(whatsappUrl(text, waiter.phone), "_blank", "noopener");
    showToast(UnipubI18n.t("toastSentTo") + " " + waiter.name);
    state.waitersOpen = false;
    renderBasket();
  }

  function renderBasket() {
    if (!els.basketFab) return;
    var count = cartCount();
    var sub = cartSubtotal();
    var service = cartService();
    var total = cartGrandTotal();

    els.basketFab.hidden = count === 0;
    els.basketCount.textContent = String(count);
    els.basketFabLabel.textContent = UnipubI18n.t("basket");
    els.basketFab.setAttribute("aria-expanded", state.basketOpen && count > 0 ? "true" : "false");

    if (count === 0) {
      els.basketPanel.hidden = true;
      state.basketOpen = false;
      state.waitersOpen = false;
      document.body.style.overflow = "";
      return;
    }

    els.basketPanel.hidden = !state.basketOpen;
    els.basketPanel.classList.toggle("is-split", state.splitOn);
    els.basketTitle.textContent = UnipubI18n.t("basket");
    els.basketTableLabel.textContent = UnipubI18n.t("table");
    els.basketSubLabel.textContent = UnipubI18n.t("basketSub");
    els.basketServiceLabel.textContent = serviceLabel();
    els.basketTotalLabel.textContent = UnipubI18n.t("basketTotal");
    els.basketClear.textContent = UnipubI18n.t("basketClear");
    els.basketSend.textContent = UnipubI18n.t("basketChooseWaiter");
    els.basketSubtotal.textContent = money(sub);
    els.basketService.textContent = money(service);
    els.basketTotal.textContent = money(total);
    els.basketWaitersTitle.textContent = UnipubI18n.t("basketWaitersTitle");
    els.basketWaiters.hidden = !state.waitersOpen;

    if (els.basketSplitBtn) {
      els.basketSplitBtn.textContent = state.splitOn
        ? UnipubI18n.t("splitOff")
        : UnipubI18n.t("splitOn");
      els.basketSplitBtn.classList.toggle("is-active", state.splitOn);
    }

    if (els.basketSplitPanel) {
      els.basketSplitPanel.hidden = !state.splitOn;
    }

    if (state.splitOn && els.basketSplitPeople && els.basketSplitSum) {
      ensureAssignments();
      els.basketSplitPeople.innerHTML = state.splitPeople.map(function (p) {
        return (
          '<div class="split-person" data-person="' + p.id + '">' +
          '<input class="split-person__name" type="text" maxlength="18" value="' +
          UnipubSearch.escapeHtml(p.name) + '" data-rename="' + p.id + '" aria-label="' +
          UnipubSearch.escapeHtml(UnipubI18n.t("splitRename")) + '">' +
          (state.splitPeople.length > 1
            ? '<button type="button" class="split-person__remove" data-remove-person="' + p.id + '" aria-label="×">×</button>'
            : "") +
          "</div>"
        );
      }).join("") +
      '<button type="button" class="split-add" id="splitAddBtn">' +
      UnipubSearch.escapeHtml(UnipubI18n.t("splitAdd")) +
      "</button>";

      var parts = calcSplit();
      els.basketSplitSum.innerHTML =
        '<p class="split-sum__title">' + UnipubSearch.escapeHtml(UnipubI18n.t("splitByPerson")) + "</p>" +
        parts.map(function (part) {
          return (
            '<div class="split-sum__row">' +
            "<span>" + UnipubSearch.escapeHtml(part.name) + "</span>" +
            "<strong>" + money(part.total) + "</strong>" +
            "</div>" +
            '<div class="split-sum__meta">' +
            UnipubSearch.escapeHtml(UnipubI18n.t("basketSub")) + " " + money(part.sub) +
            " · " + UnipubSearch.escapeHtml(serviceLabel()) + " " + money(part.service) +
            "</div>"
          );
        }).join("");
    }

    els.basketWaitersGrid.innerHTML = WAITERS.map(function (w) {
      return (
        '<button type="button" class="waiter-btn" data-waiter="' + w.id + '">' +
        UnipubSearch.escapeHtml(w.name) +
        "</button>"
      );
    }).join("");

    var html = [];
    Object.keys(state.cart).forEach(function (id) {
      var item = state.itemsById[id];
      var qty = Number(state.cart[id]) || 0;
      if (!item || qty <= 0) return;
      var owner = getItemOwner(id);
      var whoSelect = "";
      if (state.splitOn) {
        var opts = [{ id: SHARED_ID, name: UnipubI18n.t("splitShared") }].concat(state.splitPeople);
        whoSelect =
          '<label class="basket__who">' +
          "<span>" + UnipubSearch.escapeHtml(UnipubI18n.t("splitWho")) + "</span>" +
          '<select data-split-item="' + id + '">' +
          opts.map(function (p) {
            return (
              '<option value="' + p.id + '"' + (p.id === owner ? " selected" : "") + ">" +
              UnipubSearch.escapeHtml(p.name) +
              "</option>"
            );
          }).join("") +
          "</select></label>";
      }
      html.push(
        '<div class="basket__item" data-cart-id="' + id + '">' +
        '<p class="basket__name">' + UnipubSearch.escapeHtml(UnipubI18n.localized(item.name)) + "</p>" +
        '<p class="basket__price">' + money(item.price * qty) + "</p>" +
        '<div class="basket__qty">' +
        '<button type="button" data-cart-dec="' + id + '" aria-label="-">−</button>' +
        "<span>" + qty + "</span>" +
        '<button type="button" data-cart-inc="' + id + '" aria-label="+">+</button>' +
        "</div>" +
        whoSelect +
        "</div>"
      );
    });
    els.basketList.innerHTML = html.join("") || ("<p class=\"modal__text\">" + UnipubSearch.escapeHtml(UnipubI18n.t("basketEmpty")) + "</p>");
  }

  function shareDish(item) {
    var name = UnipubI18n.localized(item.name);
    var url = location.href.split("#")[0] + "#dish-" + item.id;
    var payload = {
      title: "UNIPUB — " + name,
      text: name + " · " + money(item.price),
      url: url
    };

    if (navigator.share) {
      navigator.share(payload).catch(function () {});
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(payload.url).then(function () {
        showToast(payload.url);
      });
      return;
    }

    showToast(payload.url);
  }

  function setCategory(id) {
    state.category = id || "all";
    renderTabs();
    applyFilters();
    els.rulesPanel.classList.remove("is-on");
    setDock("home");

    if (state.category !== "all") {
      var section = document.getElementById("section-" + state.category);
      if (section && section.style.display !== "none") {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  function setDock(action) {
    Array.prototype.slice.call(document.querySelectorAll(".dock__btn")).forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-action") === action);
    });
  }

  function refreshAllViews() {
    refreshUIText();
    renderHeaderContacts();
    renderTabs();
    renderFilters();
    renderMenu();
    renderRules();
    renderRecent();
    renderBasket();
  }

  function renderLangList(query) {
    var current = UnipubI18n.getWorldCode();
    var list = UnipubLanguages.filter(query);
    els.langList.innerHTML = list.map(function (lang) {
      var active = lang.code === current || lang.mapTo === current || (current === "kz" && lang.code === "kk");
      return (
        '<button type="button" class="lang-option' + (active ? " is-active" : "") + '" data-world-lang="' + lang.code + '">' +
        UnipubSearch.escapeHtml(lang.name) +
        "<small>" + UnipubSearch.escapeHtml(lang.code) + (lang.native ? " · native" : "") + "</small>" +
        "</button>"
      );
    }).join("") || "<p class=\"modal__text\">—</p>";
  }

  function openLangModal() {
    els.langModal.hidden = false;
    els.langModalTitle.textContent = UnipubI18n.t("langTitle");
    els.langSearch.placeholder = UnipubI18n.t("langSearch");
    els.langSearch.value = "";
    renderLangList("");
    setTimeout(function () { els.langSearch.focus(); }, 50);
  }

  function closeLangModal() {
    els.langModal.hidden = true;
  }

  function setTxOverlay(on, text) {
    if (!els.txOverlay) return;
    els.txOverlay.hidden = !on;
    if (text && els.txOverlayText) els.txOverlayText.textContent = text;
  }

  function applyWorldLanguage(code) {
    var langMeta = UnipubLanguages.find(code) || { code: code, name: code };
    var gen = ++langGen;
    closeLangModal();

    if (UnipubTranslate.isNative(code)) {
      UnipubI18n.setWorldLang(code, null);
      refreshAllViews();
      showToast(langMeta.name);
      return;
    }

    setTxOverlay(true, UnipubI18n.t("toastTranslating"));
    withTimeout(UnipubTranslate.prepare(state.data, UnipubI18n.UI.ru, code), 16000)
      .then(function (result) {
        if (gen !== langGen) return;
        UnipubI18n.setWorldLang(code, result.map);
        refreshAllViews();
        showToast(langMeta.name);
      })
      .catch(function () {
        if (gen !== langGen) return;
        UnipubI18n.setWorldLang("ru", null);
        refreshAllViews();
        showToast(UnipubI18n.t("toastTranslateFail"));
      })
      .then(function () {
        if (gen === langGen) setTxOverlay(false);
      });
  }

  function restoreWorldLanguageOnBoot(preferredCode) {
    var code = preferredCode || UnipubI18n.getWorldCode();
    if (!code || UnipubTranslate.isNative(code)) {
      UnipubI18n.setWorldLang(code || "ru", null);
      return Promise.resolve(false);
    }

    var gen = ++langGen;
    return withTimeout(UnipubTranslate.prepare(state.data, UnipubI18n.UI.ru, code), 16000)
      .then(function (result) {
        if (gen !== langGen) return false;
        UnipubI18n.setWorldLang(code, result.map);
        return true;
      })
      .catch(function () {
        if (gen !== langGen) return false;
        // Не затираем сохранённый язык — оставим RU на экране, preference в storage
        UnipubI18n.setWorldLang("ru", null, false);
        return false;
      });
  }

  function refreshUIText() {
    els.search.placeholder = UnipubI18n.t("searchPlaceholder");
    els.searchClear.setAttribute("aria-label", UnipubI18n.t("clearSearch"));
    if (els.splashFee) els.splashFee.textContent = splashServiceLabel();
    if (els.langOpenBtn) {
      var meta = UnipubLanguages.find(UnipubI18n.getWorldCode());
      var code = meta ? meta.code : "ru";
      if (code === "kk") code = "kz";
      els.langOpenBtn.textContent = code.toUpperCase();
      els.langOpenBtn.setAttribute("aria-label", UnipubI18n.t("langBtn"));
    }
    $("dockMenuLabel").textContent = UnipubI18n.t("menu");
    $("dockSectionsLabel").textContent = UnipubI18n.t("sections");
    $("dockRulesLabel").textContent = UnipubI18n.t("rules");
    $("dockTopLabel").textContent = UnipubI18n.t("top");
    setTheme(document.documentElement.getAttribute("data-theme") || "dark");
  }

  function bindEvents() {
    els.tabs.addEventListener("click", function (e) {
      var btn = e.target.closest(".tab");
      if (!btn) return;
      setCategory(btn.getAttribute("data-category"));
    });

    els.filters.addEventListener("click", function (e) {
      var btn = e.target.closest(".filter-btn");
      if (!btn) return;
      var id = btn.getAttribute("data-filter");
      state.filters[id] = !state.filters[id];
      renderFilters();
      applyFilters();
    });

    els.search.addEventListener("input", debounce(function () {
      state.query = UnipubSearch.fold(els.search.value).slice(0, 80);
      els.searchClear.classList.toggle("is-on", Boolean(state.query));
      applyFilters();
    }, 140));

    els.searchClear.addEventListener("click", function () {
      els.search.value = "";
      state.query = "";
      els.searchClear.classList.remove("is-on");
      applyFilters();
      els.search.focus();
    });

    document.addEventListener("click", function (e) {
      var suggest = e.target.closest("[data-suggest]");
      if (suggest) {
        els.search.value = suggest.getAttribute("data-suggest");
        state.query = UnipubSearch.fold(els.search.value);
        els.searchClear.classList.add("is-on");
        applyFilters();
        return;
      }

      var openBtn = e.target.closest("[data-open]");
      if (openBtn) {
        openModal(openBtn.getAttribute("data-open"));
        return;
      }

      // Не открываем модалку из кликов вне меню (корзина/док/модалки)
      if (!e.target.closest("#menuRoot") && !e.target.closest("#recent")) return;

      var card = e.target.closest(".card");
      if (card && !e.target.closest(".card__btn")) {
        openModal(card.getAttribute("data-id"));
      }
    });

    els.menuRoot.addEventListener("keydown", function (e) {
      var card = e.target.closest(".card");
      if (!card) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openModal(card.getAttribute("data-id"));
      }
    });

    els.modal.addEventListener("click", function (e) {
      if (e.target === els.modal) {
        closeModal();
        return;
      }
      if (e.target.closest("#modalClose")) {
        closeModal();
        return;
      }
      if (e.target.closest("#btnOrder")) {
        var dish = state.itemsById[state.activeDishId];
        if (dish) addToCart(dish);
        return;
      }
      if (e.target.closest("#btnWaiter")) {
        showToast(UnipubI18n.t("toastWaiter"));
        return;
      }
      if (e.target.closest("#btnShare")) {
        var shareItem = state.itemsById[state.activeDishId];
        if (shareItem) shareDish(shareItem);
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (els.langModal && !els.langModal.hidden) {
        closeLangModal();
        return;
      }
      if (els.modal && els.modal.classList.contains("is-on")) {
        closeModal();
        return;
      }
      if (state.basketOpen) {
        state.basketOpen = false;
        state.waitersOpen = false;
        renderBasket();
      }
    });

    els.themeBtn.addEventListener("click", function () {
      var cur = document.documentElement.getAttribute("data-theme");
      setTheme(cur === "light" ? "dark" : "light");
    });

    els.basketFab.addEventListener("click", function () {
      state.basketOpen = !state.basketOpen;
      if (!state.basketOpen) state.waitersOpen = false;
      document.body.style.overflow = state.basketOpen ? "hidden" : "";
      renderBasket();
    });

    els.basketClose.addEventListener("click", function () {
      state.basketOpen = false;
      state.waitersOpen = false;
      document.body.style.overflow = "";
      renderBasket();
    });

    els.basketClear.addEventListener("click", clearCart);
    els.basketSend.addEventListener("click", showWaitersPicker);
    if (els.basketSplitBtn) {
      els.basketSplitBtn.addEventListener("click", toggleSplit);
    }

    if (els.basketTable) {
      els.basketTable.addEventListener("input", saveTable);
    }

    if (els.basketSplitPeople) {
      els.basketSplitPeople.addEventListener("click", function (e) {
        if (e.target.closest("#splitAddBtn") || e.target.id === "splitAddBtn") {
          addSplitPerson();
          return;
        }
        var remove = e.target.closest("[data-remove-person]");
        if (remove) {
          removeSplitPerson(remove.getAttribute("data-remove-person"));
        }
      });
      els.basketSplitPeople.addEventListener("change", function (e) {
        var input = e.target.closest("[data-rename]");
        if (!input) return;
        renameSplitPerson(input.getAttribute("data-rename"), input.value);
      });
      // iOS иногда не шлёт change — дублируем на blur
      els.basketSplitPeople.addEventListener("focusout", function (e) {
        var input = e.target.closest("[data-rename]");
        if (!input) return;
        renameSplitPerson(input.getAttribute("data-rename"), input.value);
      });
    }

    els.basketWaitersGrid.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-waiter]");
      if (!btn) return;
      var id = btn.getAttribute("data-waiter");
      var waiter = WAITERS.filter(function (w) { return w.id === id; })[0];
      sendToWaiter(waiter);
    });

    els.basketList.addEventListener("click", function (e) {
      var inc = e.target.closest("[data-cart-inc]");
      var dec = e.target.closest("[data-cart-dec]");
      if (inc) {
        var idInc = inc.getAttribute("data-cart-inc");
        setCartQty(idInc, (Number(state.cart[idInc]) || 0) + 1);
        return;
      }
      if (dec) {
        var idDec = dec.getAttribute("data-cart-dec");
        setCartQty(idDec, (Number(state.cart[idDec]) || 0) - 1);
      }
    });

    els.basketList.addEventListener("change", function (e) {
      var select = e.target.closest("[data-split-item]");
      if (!select) return;
      setItemOwner(select.getAttribute("data-split-item"), select.value);
    });

    els.langOpenBtn && els.langOpenBtn.addEventListener("click", openLangModal);
    els.langCloseBtn && els.langCloseBtn.addEventListener("click", closeLangModal);
    if (els.langModal) {
      els.langModal.addEventListener("click", function (e) {
        if (e.target === els.langModal) closeLangModal();
      });
    }
    if (els.langSearch) {
      els.langSearch.addEventListener("input", debounce(function () {
        renderLangList(els.langSearch.value);
      }, 100));
    }
    if (els.langList) {
      els.langList.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-world-lang]");
        if (!btn) return;
        applyWorldLanguage(btn.getAttribute("data-world-lang"));
      });
    }

    var dock = $("dock");
    if (dock) {
      dock.addEventListener("click", function (e) {
        var btn = e.target.closest(".dock__btn");
        if (!btn) return;
        var action = btn.getAttribute("data-action");

        if (action === "home") {
          els.rulesPanel.classList.remove("is-on");
          setCategory("all");
          $("top").scrollIntoView({ behavior: "smooth" });
          return;
        }
        if (action === "categories") {
          els.rulesPanel.classList.remove("is-on");
          setDock("categories");
          $("stickyNav").scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        if (action === "rules") {
          els.rulesPanel.classList.add("is-on");
          setDock("rules");
          els.rulesPanel.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        if (action === "top") {
          setDock("top");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    }

    window.addEventListener("scroll", throttleRaf(function () {
      if (!els.progress) return;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var ratio = max > 0 ? (window.scrollY / max) * 100 : 0;
      els.progress.style.width = Math.min(100, Math.max(0, ratio)) + "%";

      if (state.category !== "all" || state.query) return;
      var sections = sectionEls.length ? sectionEls : Array.prototype.slice.call(document.querySelectorAll(".section-block"));
      var current = null;
      for (var i = 0; i < sections.length; i += 1) {
        var sec = sections[i];
        if (sec.style.display === "none") continue;
        var rect = sec.getBoundingClientRect();
        if (rect.top <= 140 && rect.bottom > 160) {
          current = sec.getAttribute("data-section");
          break;
        }
      }
      if (current && els.tabs) {
        Array.prototype.slice.call(els.tabs.querySelectorAll(".tab")).forEach(function (tab) {
          tab.classList.toggle("is-spy", tab.getAttribute("data-category") === current);
        });
      }
    }), { passive: true });

    if (location.hash.indexOf("#dish-") === 0) {
      var dishId = location.hash.replace("#dish-", "");
      window.setTimeout(function () { openModal(dishId); }, 700);
    }
  }

  function cacheEls() {
    els = {
      splash: $("splash"),
      progress: $("scrollProgress"),
      greeting: $("greeting"),
      logoSub: $("logoSub"),
      contacts: $("contacts"),
      search: $("search"),
      searchClear: $("searchClear"),
      tabs: $("tabs"),
      filters: $("filters"),
      menuRoot: $("menuRoot"),
      empty: $("emptyState"),
      recent: $("recent"),
      rulesPanel: $("rules"),
      rulesTitle: $("rulesTitle"),
      rulesList: $("rulesList"),
      footerGrid: $("footerGrid"),
      toast: $("toast"),
      modal: $("modal"),
      modalMedia: $("modalMedia"),
      modalBody: $("modalBody"),
      themeBtn: $("themeBtn"),
      basketFab: $("basketFab"),
      basketFabLabel: $("basketFabLabel"),
      basketCount: $("basketCount"),
      basketPanel: $("basketPanel"),
      basketList: $("basketList"),
      basketTitle: $("basketTitle"),
      basketClose: $("basketClose"),
      basketTotal: $("basketTotal"),
      basketTotalLabel: $("basketTotalLabel"),
      basketClear: $("basketClear"),
      basketSend: $("basketSend"),
      basketTable: $("basketTable"),
      basketTableLabel: $("basketTableLabel"),
      basketSubLabel: $("basketSubLabel"),
      basketSubtotal: $("basketSubtotal"),
      basketServiceLabel: $("basketServiceLabel"),
      basketService: $("basketService"),
      basketWaiters: $("basketWaiters"),
      basketWaitersTitle: $("basketWaitersTitle"),
      basketWaitersGrid: $("basketWaitersGrid"),
      basketSplitBtn: $("basketSplitBtn"),
      basketSplitPanel: $("basketSplitPanel"),
      basketSplitPeople: $("basketSplitPeople"),
      basketSplitSum: $("basketSplitSum"),
      splashFee: $("splashFee"),
      langOpenBtn: $("langOpenBtn"),
      langModal: $("langModal"),
      langModalTitle: $("langModalTitle"),
      langCloseBtn: $("langCloseBtn"),
      langSearch: $("langSearch"),
      langList: $("langList"),
      txOverlay: $("txOverlay"),
      txOverlayText: $("txOverlayText")
    };
  }

  function boot(data) {
    applyRuntimeConfig(data);
    state.data = data;
    UnipubI18n.loadSaved();
    cacheEls();
    loadCart();
    loadSplit();
    loadTable();

    try {
      var theme = localStorage.getItem(STORAGE.theme) || "dark";
      setTheme(theme);
    } catch (e) {
      setTheme("dark");
    }

    // Сначала меню на экране; world-lang preference не затираем в storage
    var savedWorld = UnipubI18n.getWorldCode();
    if (!UnipubTranslate.isNative(savedWorld)) {
      UnipubI18n.setWorldLang("ru", null, false);
    } else {
      UnipubI18n.setWorldLang(savedWorld || "ru", null);
    }

    try {
      bindEvents();
    } catch (e) {
      showToast("UI init error");
    }

    // индекс блюд до sanitize/render
    (data.items || []).forEach(function (item) {
      if (item && item.id) state.itemsById[item.id] = item;
    });
    sanitizeCart();

    refreshAllViews();
    startSplash();

    // Фоновый догон перевода, если ранее выбрали мировой язык
    if (savedWorld && !UnipubTranslate.isNative(savedWorld)) {
      restoreWorldLanguageOnBoot(savedWorld).then(function (ok) {
        if (ok) refreshAllViews();
      });
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(function () {});
    }
  }

  cacheEls();

  var bootData = resolveMenuData();
  if (bootData) {
    boot(bootData);
  } else {
    document.body.innerHTML =
      '<main style="padding:2rem;font-family:Manrope,sans-serif;background:#08080a;color:#f5f1ea;min-height:100vh">' +
      '<p class="wordmark" style="font-size:2rem">unipub<span style="color:#ff2d92">.</span></p>' +
      "<p>Не удалось загрузить данные меню.</p></main>";
  }
})();
