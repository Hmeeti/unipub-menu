/**
 * i18n UNIPUB: нативные RU/KZ/EN + машинный перевод остальных языков меню.
 */
(function (global) {
  "use strict";

  var UI = {
    ru: {
      greetingMorning: "Доброе утро · UNIPUB",
      greetingDay: "Добрый день · UNIPUB",
      greetingEvening: "Добрый вечер · UNIPUB",
      greetingNight: "Ночной вайб · UNIPUB",
      searchPlaceholder: "Поиск блюда, ингредиента, аллергена...",
      clearSearch: "Очистить поиск",
      empty: "Ничего не найдено. Попробуйте другой запрос или популярные слова:",
      details: "Подробнее",
      weight: "Вес",
      cook: "Время",
      ingredients: "Состав",
      allergens: "Аллергены",
      noAllergens: "Без указанных аллергенов",
      callWaiter: "Позвать официанта",
      addOrder: "В заказ",
      share: "Поделиться",
      rulesTitle: "Правила заведения",
      menu: "Меню",
      sections: "Разделы",
      rules: "Правила",
      top: "Наверх",
      recent: "Недавно смотрели",
      map: "2ГИС",
      skip: "Пропустить",
      themeLight: "Светлая",
      themeDark: "Тёмная",
      toastOrder: "Добавлено в корзину",
      toastWaiter: "Нажмите кнопку вызова официанта на вашем столе",
      toastNeedTable: "Укажите номер стола",
      toastSentTo: "Заказ отправляется —",
      toastTranslating: "Переводим меню…",
      toastTranslateFail: "Не удалось перевести. Показан русский.",
      serviceFeeSplash: "Обслуживание 15%",
      table: "Стол №",
      basket: "Корзина",
      basketSub: "Сумма",
      basketService: "Обслуживание 15%",
      basketTotal: "Итого",
      basketClear: "Очистить",
      basketSend: "В WhatsApp",
      basketChooseWaiter: "Выбрать официанта",
      basketWaitersTitle: "Кто ваш официант?",
      basketEmpty: "Корзина пуста",
      basketPay: "Оплатить Kaspi",
      payTitle: "Оплата Kaspi",
      payHint: "Переведите сумму на номер Ильнура. В комментарии укажите стол. Затем нажмите «Я оплатил» — сообщение уйдёт ему на проверку.",
      payAmount: "Сумма",
      payPhone: "Kaspi",
      payComment: "Комментарий",
      payCopyAmount: "Копировать сумму",
      payCopyPhone: "Копировать номер",
      payOpenKaspi: "Открыть Kaspi",
      payConfirm: "Я оплатил — на проверку",
      toastCopied: "Скопировано",
      toastCopiedAmount: "Сумма скопирована",
      toastCopiedPhone: "Номер скопирован",
      toastKaspiOpen: "Откройте перевод в Kaspi",
      toastPaySent: "Отправлено на проверку —",
      openMaps: "Карта",
      phone: "Позвонить",
      wa: "WhatsApp",
      ig: "Instagram",
      langTitle: "Язык меню",
      langSearch: "Поиск языка…",
      langClose: "Закрыть",
      langBtn: "Язык"
    },
    kz: {
      greetingMorning: "Қайырлы таң · UNIPUB",
      greetingDay: "Қайырлы күн · UNIPUB",
      greetingEvening: "Қайырлы кеш · UNIPUB",
      greetingNight: "Түнгі вайб · UNIPUB",
      searchPlaceholder: "Тағам, ингредиент, аллерген іздеу...",
      clearSearch: "Іздеуді тазалау",
      empty: "Ештеңе табылмады. Басқа сөз немесе танымал сұрауларды көріңіз:",
      details: "Толығырақ",
      weight: "Салмақ",
      cook: "Уақыт",
      ingredients: "Құрамы",
      allergens: "Аллергендер",
      noAllergens: "Көрсетілген аллерген жоқ",
      callWaiter: "Даяшыны шақыру",
      addOrder: "Тапсырысқа",
      share: "Бөлісу",
      rulesTitle: "Мекеме ережелері",
      menu: "Мәзір",
      sections: "Бөлімдер",
      rules: "Ережелер",
      top: "Жоғары",
      recent: "Жақында қаралған",
      map: "2ГИС",
      skip: "Өткізу",
      themeLight: "Жарық",
      themeDark: "Қараңғы",
      toastOrder: "Себетке қосылды",
      toastWaiter: "Үстеліңіздегі даяшы шақыру түймесін басыңыз",
      toastNeedTable: "Үстел нөмірін жазыңыз",
      toastSentTo: "Тапсырыс жіберіледі —",
      toastTranslating: "Мәзір аударылуда…",
      toastTranslateFail: "Аудару сәтсіз. Орыс тілі көрсетілді.",
      serviceFeeSplash: "Қызмет көрсету 15%",
      table: "Үстел №",
      basket: "Себет",
      basketSub: "Сома",
      basketService: "Қызмет 15%",
      basketTotal: "Жиыны",
      basketClear: "Тазалау",
      basketSend: "WhatsApp",
      basketChooseWaiter: "Даяшыны таңдау",
      basketWaitersTitle: "Даяшыңыз кім?",
      basketEmpty: "Себет бос",
      basketPay: "Kaspi төлеу",
      payTitle: "Kaspi төлем",
      payHint: "Соманы Ілнұрдың нөміріне аударыңыз. Түсініктемеде үстелді жазыңыз. Сосын «Мен төледім» басыңыз — тексеруге жіберіледі.",
      payAmount: "Сома",
      payPhone: "Kaspi",
      payComment: "Түсініктеме",
      payCopyAmount: "Соманы көшіру",
      payCopyPhone: "Нөмірді көшіру",
      payOpenKaspi: "Kaspi ашу",
      payConfirm: "Мен төледім — тексеруге",
      toastCopied: "Көшірілді",
      toastCopiedAmount: "Сома көшірілді",
      toastCopiedPhone: "Нөмір көшірілді",
      toastKaspiOpen: "Kaspi-де аударымды ашыңыз",
      toastPaySent: "Тексеруге жіберілді —",
      openMaps: "Карта",
      phone: "Қоңырау",
      wa: "WhatsApp",
      ig: "Instagram",
      langTitle: "Мәзір тілі",
      langSearch: "Тілді іздеу…",
      langClose: "Жабу",
      langBtn: "Тіл"
    },
    en: {
      greetingMorning: "Good morning · UNIPUB",
      greetingDay: "Good afternoon · UNIPUB",
      greetingEvening: "Good evening · UNIPUB",
      greetingNight: "Late-night vibes · UNIPUB",
      searchPlaceholder: "Search dish, ingredient, allergen...",
      clearSearch: "Clear search",
      empty: "Nothing found. Try another query or popular suggestions:",
      details: "Details",
      weight: "Weight",
      cook: "Time",
      ingredients: "Ingredients",
      allergens: "Allergens",
      noAllergens: "No listed allergens",
      callWaiter: "Call waiter",
      addOrder: "Add to order",
      share: "Share",
      rulesTitle: "House rules",
      menu: "Menu",
      sections: "Sections",
      rules: "Rules",
      top: "Top",
      recent: "Recently viewed",
      map: "2GIS",
      skip: "Skip",
      themeLight: "Light",
      themeDark: "Dark",
      toastOrder: "Added to cart",
      toastWaiter: "Press the call-waiter button on your table",
      toastNeedTable: "Enter your table number",
      toastSentTo: "Sending order to",
      toastTranslating: "Translating menu…",
      toastTranslateFail: "Translation failed. Showing Russian.",
      serviceFeeSplash: "Service charge 15%",
      table: "Table #",
      basket: "Cart",
      basketSub: "Subtotal",
      basketService: "Service 15%",
      basketTotal: "Total",
      basketClear: "Clear",
      basketSend: "WhatsApp",
      basketChooseWaiter: "Choose waiter",
      basketWaitersTitle: "Who is your waiter?",
      basketEmpty: "Cart is empty",
      basketPay: "Pay with Kaspi",
      payTitle: "Kaspi payment",
      payHint: "Transfer the total to Ilnur Kaspi. Put the table number in the comment. Then tap I've paid — he will get a check message.",
      payAmount: "Amount",
      payPhone: "Kaspi",
      payComment: "Comment",
      payCopyAmount: "Copy amount",
      payCopyPhone: "Copy number",
      payOpenKaspi: "Open Kaspi",
      payConfirm: "I've paid — send for check",
      toastCopied: "Copied",
      toastCopiedAmount: "Amount copied",
      toastCopiedPhone: "Number copied",
      toastKaspiOpen: "Open a transfer in Kaspi",
      toastPaySent: "Sent for verification —",
      openMaps: "Map",
      phone: "Call",
      wa: "WhatsApp",
      ig: "Instagram",
      langTitle: "Menu language",
      langSearch: "Search language…",
      langClose: "Close",
      langBtn: "Language"
    }
  };

  var lang = "ru";
  var worldCode = "ru";
  var txMap = null;

  function t(key) {
    if (txMap && UI.ru[key]) {
      var ruVal = UI.ru[key];
      var tr = UnipubTranslate.applyMap(ruVal, txMap);
      if (tr && tr !== ruVal) return tr;
    }
    var pack = (lang === "kz" || lang === "en") ? lang : "ru";
    return (UI[pack] && UI[pack][key]) || UI.ru[key] || key;
  }

  function localized(obj) {
    if (obj == null) return "";
    if (typeof obj === "string") {
      return txMap ? UnipubTranslate.applyMap(obj, txMap) : obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(function (item) { return localized(item); });
    }
    if (typeof obj !== "object") return String(obj);

    if (!txMap && (lang === "kz" || lang === "en" || lang === "ru")) {
      return obj[lang] || obj.ru || obj.en || "";
    }

    var base = obj.ru || obj.en || obj.kz || "";
    if (Array.isArray(base)) {
      return base.map(function (line) {
        return txMap ? UnipubTranslate.applyMap(line, txMap) : line;
      });
    }
    if (txMap) return UnipubTranslate.applyMap(base, txMap);
    return base;
  }

  function setLang(next) {
    // только нативные быстрые переключения
    lang = next === "kz" || next === "en" ? next : "ru";
    worldCode = lang === "kz" ? "kk" : lang;
    txMap = null;
    try { localStorage.setItem("unipub:lang", worldCode); } catch (e) {}
    document.documentElement.lang = worldCode;
  }

  function setWorldLang(code, map) {
    worldCode = code || "ru";
    if (UnipubTranslate.isNative(worldCode)) {
      lang = UnipubTranslate.nativePack(worldCode);
      txMap = null;
    } else {
      lang = "ru";
      txMap = map || null;
    }
    try { localStorage.setItem("unipub:lang", worldCode); } catch (e) {}
    document.documentElement.lang = UnipubTranslate.googleCode(worldCode);
    document.documentElement.dir = /^(ar|he|fa|ur|ps|sd|yi|ckb)$/i.test(worldCode) ? "rtl" : "ltr";
  }

  function getLang() { return lang; }
  function getWorldCode() { return worldCode; }
  function getTxMap() { return txMap; }

  function loadSaved() {
    try {
      var saved = localStorage.getItem("unipub:lang");
      if (!saved) return;
      if (saved === "ru" || saved === "en" || saved === "kz" || saved === "kk") {
        setLang(saved === "kk" ? "kz" : saved);
      } else {
        worldCode = saved;
      }
    } catch (e) {}
  }

  global.UnipubI18n = {
    t: t,
    localized: localized,
    setLang: setLang,
    setWorldLang: setWorldLang,
    getLang: getLang,
    getWorldCode: getWorldCode,
    getTxMap: getTxMap,
    loadSaved: loadSaved,
    UI: UI
  };
})(window);
