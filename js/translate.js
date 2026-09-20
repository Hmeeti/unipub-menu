/**
 * Перевод меню на любой язык (Google Translate gtx, без API-ключа).
 * RU / KZ / EN — нативные пакеты; остальные — машинный перевод с кэшем.
 * Параллельные запросы + пакеты строк, чтобы не ждать по одной фразе.
 */
(function (global) {
  "use strict";

  var CACHE_KEY = "unipub:tx-cache:v2";
  var CONCURRENCY = /Mobi|Android|iPhone/i.test(String(navigator.userAgent || "")) ? 4 : 8;
  var BATCH_SIZE = 12;
  var CACHE_MAX = 1800;
  var SEP = "\n⟦UNIPUB⟧\n";
  var memory = {};
  var currentTarget = "ru";

  try {
    memory = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") || {};
  } catch (e) {
    memory = {};
  }

  function trimCache() {
    var keys = Object.keys(memory);
    if (keys.length <= CACHE_MAX) return;
    keys.slice(0, keys.length - CACHE_MAX).forEach(function (k) {
      delete memory[k];
    });
  }

  function saveCache() {
    try {
      trimCache();
      localStorage.setItem(CACHE_KEY, JSON.stringify(memory));
    } catch (e) {
      try {
        memory = {};
        localStorage.removeItem(CACHE_KEY);
      } catch (err) {}
    }
  }

  function cacheKey(text, lang) {
    return lang + "::" + String(text || "");
  }

  function getCached(text, lang) {
    return memory[cacheKey(text, lang || currentTarget)];
  }

  function setCached(text, lang, value) {
    memory[cacheKey(text, lang)] = value;
  }

  function googleCode(code) {
    if (code === "kz") return "kk";
    if (code === "zh") return "zh-CN";
    return code;
  }

  function isNative(code) {
    return code === "ru" || code === "kz" || code === "kk" || code === "en";
  }

  function nativePack(code) {
    if (code === "kk") return "kz";
    return code;
  }

  function parseGtx(data, fallback) {
    var out = "";
    if (data && data[0]) {
      for (var i = 0; i < data[0].length; i += 1) {
        if (data[0][i] && data[0][i][0]) out += data[0][i][0];
      }
    }
    return out || fallback;
  }

  function fetchTranslate(joined, targetLang, sourceLang) {
    var tl = googleCode(targetLang);
    var sl = googleCode(sourceLang || "ru");
    var url =
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=" +
      encodeURIComponent(sl) +
      "&tl=" +
      encodeURIComponent(tl) +
      "&dt=t&q=" +
      encodeURIComponent(joined);

    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = null;
    if (ctrl) {
      timer = setTimeout(function () {
        try { ctrl.abort(); } catch (e) {}
      }, 7000);
    }

    return fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        return parseGtx(data, joined);
      })
      .then(
        function (out) {
          if (timer) clearTimeout(timer);
          return out;
        },
        function (err) {
          if (timer) clearTimeout(timer);
          throw err;
        }
      );
  }

  /**
   * Перевод одной строки (с кэшем).
   */
  function translateOne(text, targetLang, sourceLang) {
    var src = String(text || "").trim();
    if (!src) return Promise.resolve("");
    var tl = googleCode(targetLang);
    var sl = googleCode(sourceLang || "ru");
    if (tl === sl) return Promise.resolve(src);

    var hit = getCached(src, tl);
    if (hit) return Promise.resolve(hit);

    return fetchTranslate(src, tl, sl)
      .then(function (out) {
        setCached(src, tl, out);
        return out;
      })
      .catch(function () {
        return src;
      });
  }

  /**
   * Перевод пакета строк одним запросом.
   */
  function translateBatch(texts, targetLang, sourceLang) {
    var tl = googleCode(targetLang);
    var sl = googleCode(sourceLang || "ru");
    var joined = texts.join(SEP);

    return fetchTranslate(joined, tl, sl)
      .then(function (out) {
        var parts = String(out).split(/\n?⟦UNIPUB⟧\n?/);
        var result = {};
        texts.forEach(function (src, i) {
          var tr = (parts[i] != null ? String(parts[i]).trim() : "") || src;
          setCached(src, tl, tr);
          result[src] = tr;
        });
        return result;
      })
      .catch(function () {
        // если пакет упал — переводим по одной, но параллельно
        return runPool(texts, function (src) {
          return translateOne(src, tl, sl).then(function (tr) {
            var row = {};
            row[src] = tr;
            return row;
          });
        }, CONCURRENCY).then(function (rows) {
          var merged = {};
          rows.forEach(function (row) {
            Object.keys(row).forEach(function (k) { merged[k] = row[k]; });
          });
          return merged;
        });
      });
  }

  function runPool(items, worker, limit) {
    var results = new Array(items.length);
    var next = 0;
    var active = 0;

    return new Promise(function (resolve) {
      function kick() {
        while (active < limit && next < items.length) {
          (function (index) {
            active += 1;
            Promise.resolve(worker(items[index], index))
              .then(function (value) {
                results[index] = value;
              })
              .catch(function () {
                results[index] = null;
              })
              .then(function () {
                active -= 1;
                if (next >= items.length && active === 0) resolve(results);
                else kick();
              });
          })(next);
          next += 1;
        }
        if (items.length === 0) resolve(results);
      }
      kick();
    });
  }

  function chunk(arr, size) {
    var out = [];
    for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  /**
   * Пакетный перевод уникальных строк: кэш → параллельные батчи.
   */
  function translateMany(texts, targetLang, sourceLang) {
    var unique = [];
    var seen = {};
    (texts || []).forEach(function (t) {
      var s = String(t || "").trim();
      if (!s || seen[s]) return;
      seen[s] = true;
      unique.push(s);
    });

    var tl = googleCode(targetLang);
    var map = {};
    var need = [];

    unique.forEach(function (text) {
      var hit = getCached(text, tl);
      if (hit) map[text] = hit;
      else need.push(text);
    });

    if (!need.length) {
      return Promise.resolve(map);
    }

    var batches = chunk(need, BATCH_SIZE);

    return runPool(batches, function (batch) {
      return translateBatch(batch, targetLang, sourceLang);
    }, CONCURRENCY).then(function (batchMaps) {
      batchMaps.forEach(function (part) {
        if (!part) return;
        Object.keys(part).forEach(function (k) { map[k] = part[k]; });
      });
      // добиваем пропуски
      need.forEach(function (text) {
        if (!map[text]) map[text] = text;
      });
      saveCache();
      return map;
    });
  }

  function collectMenuStrings(data) {
    var bag = [];
    if (!data) return bag;

    function push(v) {
      if (!v) return;
      if (typeof v === "string") bag.push(v);
      else if (typeof v === "object") bag.push(v.ru || v.en || "");
    }

    push(data.venue && data.venue.tagline);
    push(data.venue && data.venue.address);
    push(data.venue && data.venue.hours);

    (data.categories || []).forEach(function (c) { push(c.title); });
    (data.filters || []).forEach(function (f) { push(f.title); });

    (data.items || []).forEach(function (item) {
      push(item.name);
      push(item.desc);
      push(item.ingredients);
      (item.allergens || []).forEach(function (a) { bag.push(a); });
      if (item.weight) bag.push(item.weight);
      if (item.cookTime) bag.push(item.cookTime);
    });

    var rules = (data.rules && data.rules.ru) || [];
    rules.forEach(function (line) { bag.push(line); });

    return bag;
  }

  function collectUiStrings(uiRu) {
    return Object.keys(uiRu || {}).map(function (k) { return uiRu[k]; });
  }

  function prepare(data, uiRu, targetLang) {
    currentTarget = targetLang;
    if (isNative(targetLang)) {
      return Promise.resolve({ map: null, pack: nativePack(targetLang) });
    }

    var texts = collectMenuStrings(data).concat(collectUiStrings(uiRu));
    var work = translateMany(texts, targetLang, "ru").then(function (map) {
      return { map: map, pack: null };
    });

    // Жёсткий потолок: телефон не должен висеть на переводе вечно
    var timed = new Promise(function (resolve, reject) {
      setTimeout(function () {
        reject(new Error("translate-timeout"));
      }, 18000);
    });

    return Promise.race([work, timed]);
  }

  function applyMap(text, map) {
    var src = String(text || "");
    if (!map) return src;
    if (map[src]) return map[src];
    var trimmed = src.trim();
    return map[trimmed] || src;
  }

  global.UnipubTranslate = {
    isNative: isNative,
    nativePack: nativePack,
    prepare: prepare,
    applyMap: applyMap,
    getCached: getCached,
    translateOne: translateOne,
    googleCode: googleCode
  };
})(window);
