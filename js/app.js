/**
 * UNIPUB — основное приложение меню.
 * Загрузка JSON, фильтры, модалка, WhatsApp, recent, PWA hooks.
 */
(function () {
  "use strict";

  var STORAGE = {
    recent: "unipub:recent",
    theme: "unipub:theme"
  };

  var state = {
    data: null,
    category: "all",
    filters: {},
    query: "",
    itemsById: {},
    toastTimer: null,
    activeDishId: null
  };

  var els = {};

  function $(id) { return document.getElementById(id); }

  function money(n) {
    var value = Number(n);
    if (!Number.isFinite(value)) return "— ₸";
    return value.toLocaleString("ru-RU") + " ₸";
  }

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("is-on");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(function () {
      els.toast.classList.remove("is-on");
    }, 2600);
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

  function whatsappUrl(text) {
    var phone = state.data.venue.whatsapp;
    return "https://wa.me/" + phone + "?text=" + encodeURIComponent(text);
  }

  function hideSplash() {
    if (!els.splash) return;
    els.splash.classList.add("is-hidden");
  }

  function startSplash() {
    // Заставка обязательная, без skip; чуть дольше для премиум-ощущения
    window.setTimeout(hideSplash, 3200);
  }

  function renderHeaderContacts() {
    var v = state.data.venue;
    els.logoSub.textContent = UnipubI18n.localized(v.tagline);
    els.welcome.innerHTML = '<span class="dot" aria-hidden="true"></span>' + UnipubSearch.escapeHtml(UnipubI18n.t("welcome"));
    els.greeting.innerHTML = greetingText().replace("UNIPUB", "<strong>UNIPUB</strong>");

    els.contacts.innerHTML = [
      '<a class="contact-pill" href="tel:' + v.phone + '">' + UnipubI18n.t("phone") + ": " + v.phoneDisplay + "</a>",
      '<a class="contact-pill contact-pill--wa" target="_blank" rel="noopener" href="' + whatsappUrl("Здравствуйте! Пишу из меню UNIPUB.") + '">' + UnipubI18n.t("wa") + "</a>",
      '<a class="contact-pill contact-pill--ig" target="_blank" rel="noopener" href="' + v.instagram + '">' + UnipubI18n.t("ig") + "</a>",
      '<a class="contact-pill" target="_blank" rel="noopener" href="' + v.map2gis + '">' + UnipubI18n.t("openMaps") + "</a>"
    ].join("");

    els.footerGrid.innerHTML = [
      "<div><strong>UNIPUB</strong></div>",
      "<div>" + UnipubSearch.escapeHtml(UnipubI18n.localized(v.address)) + "</div>",
      "<div><a href=\"tel:" + v.phone + "\">" + v.phoneDisplay + "</a> · " + UnipubSearch.escapeHtml(UnipubI18n.localized(v.hours)) + "</div>",
      "<div>★ " + v.rating + " · " + v.reviews + " · <a class=\"map-link\" target=\"_blank\" rel=\"noopener\" href=\"" + v.map2gis + "\">" + UnipubI18n.t("map") + "</a></div>"
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
          '<p class="card__meta">' + UnipubSearch.escapeHtml((item.weight || "") + (item.cookTime ? " · " + item.cookTime : "")) + "</p>" +
          '<p class="card__desc" data-field="desc"></p>' +
          '<div class="card__foot"><span class="card__price">' + money(item.price) + "</span>" +
          '<button class="card__btn" type="button" data-open="' + item.id + '">' + UnipubI18n.t("details") + "</button>" +
          "</div></div></article>"
        );
      });

      html.push("</div></section>");
    });

    els.menuRoot.innerHTML = html.join("");

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
        return '<button type="button" data-suggest="' + UnipubSearch.escapeHtml(q) + '">' + UnipubSearch.escapeHtml(q) + "</button>";
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
      "<h3>" + UnipubSearch.escapeHtml(UnipubI18n.t("recent")) + "</h3>" +
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
      (item.weight ? '<span class="stat">' + UnipubI18n.t("weight") + ": " + UnipubSearch.escapeHtml(item.weight) + "</span>" : "") +
      (item.cookTime ? '<span class="stat">' + UnipubI18n.t("cook") + ": " + UnipubSearch.escapeHtml(item.cookTime) + "</span>" : "") +
      "</div>" +
      '<p class="modal__text">' + UnipubSearch.escapeHtml(UnipubI18n.localized(item.desc)) + "</p>" +
      '<p class="modal__section-title">' + UnipubI18n.t("ingredients") + "</p>" +
      '<p class="modal__text">' + UnipubSearch.escapeHtml(UnipubI18n.localized(item.ingredients)) + "</p>" +
      '<p class="modal__section-title">' + UnipubI18n.t("allergens") + "</p>" +
      ((item.allergens || []).length
        ? '<div class="allergens">' + item.allergens.map(function (a) {
            return '<span class="allergen">' + UnipubSearch.escapeHtml(a) + "</span>";
          }).join("") + "</div>"
        : '<p class="modal__text">' + UnipubI18n.t("noAllergens") + "</p>") +
      '<div class="modal__actions">' +
      '<button class="btn btn--primary" type="button" id="btnOrder">' + UnipubI18n.t("addOrder") + "</button>" +
      '<button class="btn btn--ghost" type="button" id="btnWaiter">' + UnipubI18n.t("callWaiter") + "</button>" +
      "</div>" +
      '<button class="btn btn--ghost modal__share" type="button" id="btnShare">' + UnipubI18n.t("share") + "</button>";

    els.modal.classList.add("is-on");
    document.body.style.overflow = "hidden";

    $("modalClose").addEventListener("click", closeModal);
    $("btnOrder").addEventListener("click", function () { orderDish(item, false); });
    $("btnWaiter").addEventListener("click", function () { orderDish(item, true); });
    $("btnShare").addEventListener("click", function () { shareDish(item); });
  }

  function closeModal() {
    els.modal.classList.remove("is-on");
    document.body.style.overflow = "";
    state.activeDishId = null;
  }

  function orderDish(item, waiterOnly) {
    var name = UnipubI18n.localized(item.name);
    var text = waiterOnly
      ? "UNIPUB: позовите официанта. Смотрю: " + name + "."
      : "UNIPUB: хочу заказать «" + name + "» (" + money(item.price) + ").";

    window.open(whatsappUrl(text), "_blank", "noopener");
    showToast(waiterOnly ? UnipubI18n.t("toastWaiter") : UnipubI18n.t("toastOrder"));
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
  }

  function setDock(action) {
    Array.prototype.slice.call(document.querySelectorAll(".dock__btn")).forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-action") === action);
    });
  }

  function refreshUIText() {
    els.search.placeholder = UnipubI18n.t("searchPlaceholder");
    els.searchClear.setAttribute("aria-label", UnipubI18n.t("clearSearch"));
    $("dockMenuLabel").textContent = UnipubI18n.t("menu");
    $("dockSectionsLabel").textContent = UnipubI18n.t("sections");
    $("dockRulesLabel").textContent = UnipubI18n.t("rules");
    $("dockTopLabel").textContent = UnipubI18n.t("top");
    Array.prototype.slice.call(document.querySelectorAll(".lang-switch button")).forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-lang") === UnipubI18n.getLang());
    });
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

    els.search.addEventListener("input", function () {
      state.query = UnipubSearch.fold(els.search.value).slice(0, 80);
      els.searchClear.classList.toggle("is-on", Boolean(state.query));
      applyFilters();
    });

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
      if (e.target === els.modal) closeModal();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && els.modal.classList.contains("is-on")) closeModal();
    });

    els.themeBtn.addEventListener("click", function () {
      var cur = document.documentElement.getAttribute("data-theme");
      setTheme(cur === "light" ? "dark" : "light");
    });

    document.querySelector(".lang-switch").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-lang]");
      if (!btn) return;
      UnipubI18n.setLang(btn.getAttribute("data-lang"));
      refreshUIText();
      renderHeaderContacts();
      renderTabs();
      renderFilters();
      renderMenu();
      renderRules();
      renderRecent();
    });

    $("dock").addEventListener("click", function (e) {
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

    window.addEventListener("scroll", function () {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var ratio = max > 0 ? (window.scrollY / max) * 100 : 0;
      els.progress.style.width = Math.min(100, Math.max(0, ratio)) + "%";

      // Scroll-spy активной секции
      if (state.category !== "all" || state.query) return;
      var sections = Array.prototype.slice.call(document.querySelectorAll(".section-block"));
      var current = null;
      sections.forEach(function (sec) {
        var rect = sec.getBoundingClientRect();
        if (rect.top <= 140 && rect.bottom > 160) current = sec.getAttribute("data-section");
      });
      if (current) {
        Array.prototype.slice.call(els.tabs.querySelectorAll(".tab")).forEach(function (tab) {
          var active = tab.getAttribute("data-category") === current;
          // Не переключаем state.category при spy — только визуальный hint через outline на секции
          tab.classList.toggle("is-spy", active);
        });
      }
    }, { passive: true });

    // Deep-link #dish-id
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
      welcome: $("welcome"),
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
      themeBtn: $("themeBtn")
    };
  }

  function boot(data) {
    state.data = data;
    UnipubI18n.loadSaved();
    cacheEls();

    try {
      var theme = localStorage.getItem(STORAGE.theme) || "dark";
      setTheme(theme);
    } catch (e) {
      setTheme("dark");
    }

    refreshUIText();
    renderHeaderContacts();
    renderTabs();
    renderFilters();
    renderMenu();
    renderRules();
    renderRecent();
    bindEvents();
    startSplash();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(function () {});
    }
  }

  cacheEls();

  if (window.UNIPUB_DATA) {
    boot(window.UNIPUB_DATA);
  } else {
    document.body.innerHTML =
      '<main style="padding:2rem;font-family:Manrope,sans-serif;background:#08080a;color:#f5f1ea;min-height:100vh">' +
      '<p class="wordmark" style="font-size:2rem">unipub<span style="color:#ff2d92">.</span></p>' +
      "<p>Не удалось загрузить данные меню.</p></main>";
  }
})();
