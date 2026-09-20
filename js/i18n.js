/**
 * Простой i18n для UI UNIPUB.
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
      openMaps: "Карта",
      phone: "Позвонить",
      wa: "WhatsApp",
      ig: "Instagram"
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
      openMaps: "Карта",
      phone: "Қоңырау",
      wa: "WhatsApp",
      ig: "Instagram"
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
      openMaps: "Map",
      phone: "Call",
      wa: "WhatsApp",
      ig: "Instagram"
    }
  };

  var lang = "ru";

  function t(key) {
    return (UI[lang] && UI[lang][key]) || (UI.ru && UI.ru[key]) || key;
  }

  function localized(obj) {
    if (!obj || typeof obj !== "object") return String(obj || "");
    return obj[lang] || obj.ru || obj.en || "";
  }

  function setLang(next) {
    lang = next === "kz" || next === "en" ? next : "ru";
    try { localStorage.setItem("unipub:lang", lang); } catch (e) {}
    document.documentElement.lang = lang === "kz" ? "kk" : lang;
  }

  function getLang() { return lang; }

  function loadSaved() {
    try {
      var saved = localStorage.getItem("unipub:lang");
      if (saved) setLang(saved);
    } catch (e) {}
  }

  global.UnipubI18n = {
    t: t,
    localized: localized,
    setLang: setLang,
    getLang: getLang,
    loadSaved: loadSaved,
    UI: UI
  };
})(window);
