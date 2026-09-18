/**
 * Умный поиск: слова + лёгкая морфология RU + транслит.
 * «тунец» находит «тунца», «рибай» ≈ ribeye/ribay.
 */
(function (global) {
  "use strict";

  var TRANSLIT = {
    a: "а", b: "б", v: "в", g: "г", d: "д", e: "е", yo: "ё", zh: "ж", z: "з",
    i: "и", y: "й", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", r: "р",
    s: "с", t: "т", u: "у", f: "ф", h: "х", c: "ц", ch: "ч", sh: "ш", sch: "щ",
    yu: "ю", ya: "я", x: "кс", w: "в", q: "к", j: "дж"
  };

  var ALIASES = {
    "тунец": ["тунц", "tuna"],
    "тунца": ["тунц", "тунец", "tuna"],
    "стейк": ["steak", "рибай", "ribeye", "ribay"],
    "рибай": ["ribeye", "ribay", "стейк", "steak"],
    "ribeye": ["рибай", "ribay", "стейк"],
    "коктейл": ["cocktail", "коктейль"],
    "cocktail": ["коктейл", "коктейль"],
    "сёмг": ["семг", "salmon"],
    "семг": ["сёмг", "salmon"],
    "vip": ["вип"],
    "вип": ["vip"],
    "пив": ["beer", "lager", "ipa"],
    "beer": ["пив"],
    "десерт": ["dessert", "торт", "чизкейк"],
    "паст": ["pasta", "тальятелле", "спагетти"]
  };

  function fold(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function translitToRu(token) {
    var src = String(token || "").toLowerCase();
    if (!/^[a-z]+$/.test(src)) return src;
    var out = "";
    var i = 0;
    while (i < src.length) {
      var three = src.slice(i, i + 3);
      var two = src.slice(i, i + 2);
      if (TRANSLIT[three]) { out += TRANSLIT[three]; i += 3; continue; }
      if (TRANSLIT[two]) { out += TRANSLIT[two]; i += 2; continue; }
      out += TRANSLIT[src[i]] || src[i];
      i += 1;
    }
    return out;
  }

  /** Грубая стемминг-нормализация для RU/EN кулинарии */
  function stem(token) {
    var t = fold(token);
    t = translitToRu(t);
    if (t.length <= 3) return t;

    var endings = [
      "ами", "ями", "ов", "ев", "ей", "ой", "ою", "ией", "ием", "иям", "иях",
      "ах", "ях", "ом", "ем", "ую", "юю", "ая", "яя", "ые", "ие", "ых", "их",
      "ам", "ям", "у", "ю", "а", "я", "ы", "и", "е", "о",
      "ов", "ев", "ий", "ый", "ой",
      "ing", "ers", "ies", "es", "s"
    ];

    for (var i = 0; i < endings.length; i += 1) {
      var end = endings[i];
      if (t.length - end.length >= 3 && t.slice(-end.length) === end) {
        t = t.slice(0, -end.length);
        break;
      }
    }

    // «тунца» / «тунец» → общий корень «тунц»
    if (t.slice(-2) === "ец" && t.length > 4) t = t.slice(0, -2) + "ц";
    if (t.slice(-2) === "ца" && t.length > 4) t = t.slice(0, -1);

    return t;
  }

  function expandToken(token) {
    var base = stem(token);
    var set = {};
    set[base] = true;
    set[fold(token)] = true;
    set[translitToRu(fold(token))] = true;

    Object.keys(ALIASES).forEach(function (key) {
      var keyStem = stem(key);
      if (keyStem === base || fold(key) === fold(token) || stem(key) === stem(token)) {
        set[keyStem] = true;
        ALIASES[key].forEach(function (alias) {
          set[stem(alias)] = true;
          set[fold(alias)] = true;
        });
      }
    });

    return Object.keys(set).filter(Boolean);
  }

  function tokenize(text) {
    return fold(text).split(" ").filter(function (t) { return t.length > 1; });
  }

  function buildIndexText(parts) {
    return fold(parts.filter(Boolean).join(" "));
  }

  /**
   * Проверка совпадения запроса с текстом блюда.
   * @returns {{ok:boolean, score:number}}
   */
  function matchQuery(query, haystackParts) {
    var q = fold(query);
    if (!q) return { ok: true, score: 0 };

    var hay = buildIndexText(haystackParts);
    var hayTokens = tokenize(hay);
    var hayStems = hayTokens.map(stem);
    var queryTokens = tokenize(q);

    var score = 0;
    var allOk = true;

    queryTokens.forEach(function (qt) {
      var variants = expandToken(qt);
      var found = false;

      for (var v = 0; v < variants.length; v += 1) {
        var variant = variants[v];
        if (!variant) continue;

        // полное слово / стем
        if (hayStems.indexOf(variant) !== -1 || hayTokens.indexOf(variant) !== -1) {
          found = true;
          score += 3;
          break;
        }

        // префикс/подстрока по стемам (тунц ⊂ тунца)
        for (var h = 0; h < hayStems.length; h += 1) {
          var hs = hayStems[h];
          if (!hs) continue;
          if (hs.indexOf(variant) === 0 || variant.indexOf(hs) === 0 || hs.indexOf(variant) !== -1) {
            if (Math.min(hs.length, variant.length) >= 3) {
              found = true;
              score += 2;
              break;
            }
          }
        }
        if (found) break;

        // сырой substring по всему hay
        if (variant.length >= 3 && hay.indexOf(variant) !== -1) {
          found = true;
          score += 1;
          break;
        }
      }

      if (!found) allOk = false;
    });

    return { ok: allOk, score: score };
  }

  /** Подсветка найденных фрагментов в HTML-безопасном тексте */
  function highlight(text, query) {
    var raw = String(text || "");
    var q = fold(query);
    if (!q) return escapeHtml(raw);

    var tokens = tokenize(q);
    var patterns = [];
    tokens.forEach(function (t) {
      expandToken(t).forEach(function (v) {
        if (v.length >= 3) patterns.push(v);
      });
      if (t.length >= 3) patterns.push(t);
    });

    patterns = Array.from(new Set(patterns)).sort(function (a, b) { return b.length - a.length; });
    if (!patterns.length) return escapeHtml(raw);

    var re = new RegExp("(" + patterns.map(escapeRegExp).join("|") + ")", "ig");
    return escapeHtml(raw).replace(re, "<mark>$1</mark>");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  global.UnipubSearch = {
    fold: fold,
    stem: stem,
    matchQuery: matchQuery,
    highlight: highlight,
    escapeHtml: escapeHtml
  };
})(window);
