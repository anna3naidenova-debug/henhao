(function () {
  "use strict";
  var S = window.SITE || {};
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var get = function (path) { return path.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, S); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var fmtPrice = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " "); };
  var store = {
    get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} },
    lget: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    lset: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  /* ---------- Яндекс Метрика ---------- */
  function goal(name) {
    if (S.metrikaId && typeof window.ym === "function") window.ym(S.metrikaId, "reachGoal", name);
  }
  if (S.metrikaId) {
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = 1 * new Date();
      k = e.createElement(t); a = e.getElementsByTagName(t)[0]; k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
    })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
    window.ym(S.metrikaId, "init", { clickmap: true, trackLinks: true, accurateTrackBounce: true });
    if (!store.lget("cookieOk")) {
      $("#cookie").hidden = false;
      $("#cookie-ok").addEventListener("click", function () { store.lset("cookieOk", "1"); $("#cookie").hidden = true; });
    }
  }

  /* ---------- Подстановка значений из конфига ---------- */
  $$("[data-bind]").forEach(function (el) {
    var v = get(el.getAttribute("data-bind"));
    if (v != null) el.textContent = v;
  });
  $$("[data-bind-src]").forEach(function (el) {
    var v = get(el.getAttribute("data-bind-src"));
    if (v) el.src = v;
  });
  var tg = (S.contacts && S.contacts.telegram) || "#";
  $$(".js-tg").forEach(function (a) {
    a.href = tg; a.target = "_blank"; a.rel = "noopener";
    a.addEventListener("click", function () { goal("click_telegram"); });
  });

  /* ---------- Флаги блоков ---------- */
  var F = S.flags || {};
  if (F.showMeetup && S.meetup && S.meetup.date) $("#meetup").hidden = false;
  if (F.showTeacher) $("#teacher").hidden = false;

  /* ---------- QR-узор (декоративный, нарочно без «глазков» — не сканируется) ---------- */
  function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
  function qrPattern(cols, rows, color, seed, density) {
    var r = rng(seed), cells = "";
    for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
      if (r() < density) cells += "M" + x + " " + y + "h1v1h-1z";
    }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + cols + " " + rows + '" width="' + cols * 5 + '" height="' + rows * 5 + '" shape-rendering="crispEdges"><path fill="' + color + '" d="' + cells + '"/></svg>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  }
  $$(".qr-texture").forEach(function (el) {
    el.style.backgroundImage = qrPattern(24, 24, "rgba(80,10,10,0.22)", 7, 0.45);
    // мягко гасим узор к краю блока
    el.style.webkitMaskImage = el.style.maskImage = "linear-gradient(135deg, #000 30%, transparent 85%)";
  });
  $$(".qr-strip").forEach(function (el) {
    el.style.backgroundImage = qrPattern(64, 6, "#111111", 3, 0.5);
    el.style.backgroundSize = "384px 32px";
  });

  /* ---------- Штрихкоды (декор) ---------- */
  function barcodes() {
    $$("svg.barcode").forEach(function (svg) {
      var code = svg.getAttribute("data-code") || "HENHAO", x = 0, out = "";
      for (var i = 0; x < 196; i++) {
        var c = code.charCodeAt(i % code.length) + i * 7;
        var w = 1 + (c % 3), gap = 1 + ((c >> 2) % 3);
        out += '<rect x="' + x + '" y="0" width="' + w * 1.6 + '" height="50"/>';
        x += (w + gap) * 1.6;
      }
      svg.innerHTML = out;
    });
  }

  /* ---------- 7.1 Кинетическое слово ---------- */
  (function kinetic() {
    var el = $("#kinetic"), box = el && el.parentElement;
    if (!el || reduceMotion) return;
    var seq = [];
    (S.kineticWords || []).forEach(function (t) {
      seq.push({ t: t[0], lang: "ru" }, { t: t[1], lang: "zh-Latn-pinyin" }, { t: t[2], lang: "zh-Hans" });
    });
    if (!seq.length) return;
    var i = seq.length - 1, timer = null, visible = true;

    function fit() {
      var cs = getComputedStyle(box);
      var w = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      var h = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      el.style.fontSize = "100px";
      var ratio = el.scrollWidth / 100 || 1;
      var size = Math.min((w * 0.96) / ratio, h * 0.62, el.classList.contains("is-zh") ? 260 : 220);
      el.style.fontSize = Math.max(28, Math.floor(size)) + "px";
    }
    function show(k) {
      var s = seq[k];
      el.textContent = s.t;
      el.setAttribute("lang", s.lang === "ru" ? "ru" : s.lang);
      el.classList.toggle("is-zh", s.lang === "zh-Hans");
      fit();
    }
    function tick() { i = (i + 1) % seq.length; show(i); }
    function start() { if (!timer) timer = setInterval(tick, S.kineticStepMs || 1200); }
    function stop() { clearInterval(timer); timer = null; }

    // старт с «привет»
    i = 0; show(0);
    start();
    window.addEventListener("resize", fit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    document.addEventListener("visibilitychange", function () { document.hidden ? stop() : visible && start(); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) {
        visible = en[0].isIntersecting;
        visible && !document.hidden ? start() : stop();
      }).observe(box);
    }
  })();

  /* ---------- 7.3 Челленджи ---------- */
  var ch = $("#challenges");
  if (ch) ch.innerHTML = (S.challenges || []).map(function (c) {
    return '<li class="sticker">' +
      '<span class="sticker__kind"><span>Челлендж недели</span><svg class="barcode" data-code="' + esc(c.py) + '" viewBox="0 0 200 50" preserveAspectRatio="none" aria-hidden="true"></svg></span>' +
      '<span class="sticker__text">' + esc(c.text) + "</span>" +
      '<span class="sticker__zh"><b lang="zh-Hans">' + esc(c.zh) + '</b><small><i lang="zh-Latn-pinyin">' + esc(c.py) + "</i><br>" + esc(c.note) + "</small></span>" +
      (c.anywhere ? '<span class="sticker__any">можно и не из Китая</span>' : "") +
      "</li>";
  }).join("");
  barcodes();

  /* ---------- 7.5 Трекинг ---------- */
  var tr = $("#track");
  if (tr) {
    tr.innerHTML = (S.track || []).map(function (t) {
      return '<li class="track__item' + (t.future ? " is-future" : "") + '"><span class="track__dot"></span>' +
        '<span class="track__status">' + esc(t.status) + '</span><span class="track__text">' + esc(t.text) + "</span></li>";
    }).join("");
    var track = tr.parentElement;
    var items = $$(".track__item:not(.is-future)", track);
    items.forEach(function (li, k) {
      [li, $(".track__dot", li), $(".track__status", li)].forEach(function (n) { n.style.transitionDelay = (reduceMotion ? 0 : k * 0.18) + "s"; });
    });
    if (reduceMotion || !("IntersectionObserver" in window)) track.classList.add("is-lit");
    else {
      var io = new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) { track.classList.add("is-lit"); io.disconnect(); }
      }, { threshold: 0.35 });
      io.observe(track);
    }
  }

  /* ---------- 7.6 Световое меню: матрица «преподаватель × ритм» ---------- */
  var cur = (S.currency && S.currency.main) || "₽";
  var rows = [], cols = [];
  (S.tariffs || []).forEach(function (t) {
    if (t.teacherType === "native" && !F.showNative) return;
    var r = rows.filter(function (x) { return x.type === t.teacherType; })[0];
    if (!r) rows.push(r = { type: t.teacherType, name: t.name, items: {} });
    if (cols.indexOf(t.rhythm) === -1) cols.push(t.rhythm);
    r.items[t.rhythm] = t;
  });
  function panel(t) {
    var price = '<p class="price"><span class="price__plate">' + fmtPrice(t.price) + " " + cur + '<small>/мес</small></span>' +
      '<span class="price__cap">цена первого потока</span>' +
      (F.showStrikePrice && t.nextPrice ? '<span class="price__next">со следующего потока — <s>' + fmtPrice(t.nextPrice) + " " + cur + "</s></span>" : "") +
      "</p>";
    return '<article class="panel" data-tariff="' + esc(t.id) + '">' +
      '<div class="panel__box"><span class="panel__menuno"><span lang="zh-Hans">' + esc(t.menuNo) + '</span><small lang="zh-Latn-pinyin">' + esc(t.menuPinyin || "") + "</small></span>" +
      '<span class="panel__big" lang="zh-Hans" aria-hidden="true">' + esc(String(t.menuNo).slice(-1)) + "</span></div>" +
      '<div class="panel__body"><h4 class="vh">' + esc(t.name) + ", " + esc(t.rhythm) + "</h4>" + price +
      (t.available ? '<a class="btn btn--sm js-cta" href="#form" data-cta="' + esc(t.id) + '">Выбрать</a>' : "") +
      "</div></article>";
  }
  var menu = $("#menu");
  if (menu) {
    menu.innerHTML = '<div class="matrix__corner" aria-hidden="true"></div>' +
      cols.map(function (c) { return '<p class="matrix__col" aria-hidden="true">' + esc(c) + "</p>"; }).join("") +
      rows.map(function (r) {
        return '<h3 class="matrix__row">' + esc(r.name) + "</h3>" +
          cols.map(function (c) { return r.items[c] ? panel(r.items[c]) : '<div class="matrix__empty"></div>'; }).join("");
      }).join("");
  }

  var check = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="1" width="22" height="22" rx="3" fill="#CE403B"/><path d="M6 12.5 10 16l8-8.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var inc = $("#includes");
  if (inc) inc.innerHTML = (S.includes || []).map(function (x) { return "<li>" + check + esc(x) + "</li>"; }).join("");

  /* ---------- 7.7 Табло времени ---------- */
  var boards = $$(".board__time");
  function clocks() {
    boards.forEach(function (b) {
      try {
        b.textContent = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: b.getAttribute("data-tz") }).format(new Date());
      } catch (e) {}
    });
  }
  clocks(); setInterval(clocks, 10000);

  /* ---------- 7.13 Вопросы ---------- */
  var fl = $("#faq-list");
  if (fl) fl.innerHTML = (S.faq || []).map(function (f) {
    return '<details class="qa"><summary>' + esc(f.q) + "</summary><p>" + esc(f.a) + "</p></details>";
  }).join("");

  /* ---------- Подвал: настоящий QR ---------- */
  var qrTg = $("#qr-tg");
  if (qrTg && window.qrcode && tg && tg !== "#") {
    var q = window.qrcode(0, "M"); q.addData(tg); q.make();
    qrTg.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true, alt: "QR-код Telegram школы" });
  }
  var qrWc = $("#qr-wechat");
  if (qrWc) {
    if (S.contacts && S.contacts.wechatQr) qrWc.innerHTML = '<img src="' + esc(S.contacts.wechatQr) + '" alt="QR-код WeChat школы">';
    else qrWc.textContent = "QR из WeChat появится здесь";
  }

  /* ---------- 7.14 Форма ---------- */
  var form = $("#lead-form");
  var FC = S.form || {};
  var startedAt = Date.now();

  // UTM из ссылки — запоминаем на время сессии
  var utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];
  var params = new URLSearchParams(location.search);
  utmKeys.forEach(function (k) { if (params.get(k)) store.set(k, params.get(k)); });

  // WeChat не открывается ссылкой — копируем ID и подсказываем
  var wcBtn = $(".js-wechat", form), wcNote = $("#wechat-note");
  var wcId = S.contacts && S.contacts.wechatId;
  if (!wcId) wcBtn.hidden = true;
  wcBtn.addEventListener("click", function () {
    goal("click_wechat");
    var qr = S.contacts && S.contacts.wechatQr;
    wcNote.innerHTML = (qr ? '<img src="' + esc(qr) + '" width="160" height="157" alt="QR-код WeChat школы">' : "") +
      '<span>Отсканируй QR в WeChat или добавь нас по ID: <b>' + esc(wcId) + "</b></span>";
    wcNote.hidden = false;
    if (navigator.clipboard) navigator.clipboard.writeText(wcId).then(function () {
      $("span", wcNote).insertAdjacentHTML("beforeend", " — ID скопирован");
    }, function () {});
  });

  // Телефон: код страны
  var countries = FC.phoneCountries || [];
  var countrySel = $("#f-country"), phoneInput = $("#f-phone");
  countrySel.innerHTML = countries.map(function (c, k) {
    return '<option value="' + k + '">' + esc(c.flag + " " + c.code) + "</option>";
  }).join("");
  $$("option", countrySel).forEach(function (o, k) { o.title = countries[k].name; });
  function syncCountry() {
    var c = countries[countrySel.value] || {};
    phoneInput.placeholder = c.placeholder || "";
    countrySel.setAttribute("aria-label", "Код страны: " + (c.name || ""));
  }
  countrySel.addEventListener("change", syncCountry);
  syncCountry();

  form.addEventListener("change", function (e) { var f = e.target.closest(".field"); if (f) f.classList.remove("is-invalid"); });
  form.addEventListener("input", function (e) { var f = e.target.closest(".field"); if (f) f.classList.remove("is-invalid"); });

  var formOpened = false;
  $$(".js-cta").forEach(function (a) {
    a.addEventListener("click", function () {
      form.elements["cta_source"].value = a.getAttribute("data-cta") || "direct";
      if (!a.closest(".panel")) goal("click_manager");
      $("#form-success").hidden = true; form.hidden = false;
    });
  });

  function checked(name) { return $$('[name="' + name + '"]:checked', form).map(function (i) { return i.value; }); }
  function invalid(key) { var e = form.querySelector('[data-err="' + key + '"]'); if (e) e.closest(".field").classList.add("is-invalid"); }

  function validate() {
    $$(".field.is-invalid", form).forEach(function (f) { f.classList.remove("is-invalid"); });
    var ok = true, first = null;
    function bad(k) { ok = false; invalid(k); if (!first) first = form.querySelector('[data-err="' + k + '"]').closest(".field"); }
    if (!form.elements["name"].value.trim()) bad("name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.elements["email"].value.trim())) bad("email");
    if (form.elements["phone"].value.replace(/\D/g, "").length < 6) bad("phone");
    if (!form.elements["consent"].checked) bad("consent");
    if (first) { first.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" }); var inp = first.querySelector("input"); if (inp) inp.focus({ preventScroll: true }); }
    return ok;
  }

  function payload() {
    var c = countries[countrySel.value] || {};
    var num = form.elements["phone"].value.trim();
    var tgNick = form.elements["telegram"].value.trim();
    if (tgNick && !/^[@+]|^https?:|t\.me/.test(tgNick)) tgNick = "@" + tgNick;
    var p = {
      name: form.elements["name"].value.trim(),
      email: form.elements["email"].value.trim(),
      phone: (c.code && c.code !== "+" ? c.code + " " : "") + num + (c.name ? " (" + c.name + ")" : ""),
      telegram: tgNick,
      browser_tz: (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ""; } })(),
      cta_source: form.elements["cta_source"].value,
      website: form.elements["website"].value,
      elapsed: Math.round((Date.now() - startedAt) / 1000),
      sent_at: new Date().toISOString(),
      page: location.href.split("#")[0]
    };
    utmKeys.forEach(function (k) { p[k] = store.get(k) || ""; });
    return p;
  }

  function success() {
    form.hidden = true;
    var s = $("#form-success"); s.hidden = false; s.focus();
    goal("submit_form");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    $("#form-error").hidden = true;
    if (!validate()) return;
    var p = payload();
    var btn = $("#form-submit");
    // ловушка для ботов: тихо «принимаем», но не отправляем
    if (p.website || p.elapsed < (FC.minFillSeconds || 4)) { success(); return; }
    btn.disabled = true;
    var done = function () { btn.disabled = false; };
    if (FC.demoMode) { setTimeout(function () { done(); success(); }, 500); return; }
    fetch(FC.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) })
      .then(function (r) { if (!r.ok) throw new Error(r.status); done(); success(); })
      .catch(function () { done(); $("#form-error").hidden = false; });
  });

  /* ---------- Нижняя плашка и цели просмотра ---------- */
  var dock = $("#dock"), heroIn = true, formIn = false;
  function syncDock() {
    var show = !heroIn && !formIn;
    dock.classList.toggle("is-shown", show);
    dock.setAttribute("aria-hidden", show ? "false" : "true");
    $("a", dock).tabIndex = show ? 0 : -1;
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) { heroIn = en[0].isIntersecting; syncDock(); }).observe($(".hero__text"));
    new IntersectionObserver(function (en) {
      formIn = en[0].isIntersecting; syncDock();
      if (formIn && !formOpened) { formOpened = true; goal("form_open"); }
    }).observe($("#form"));
    var seenMenu = false;
    new IntersectionObserver(function (en) {
      if (en[0].isIntersecting && !seenMenu) { seenMenu = true; goal("view_tariffs"); }
    }, { threshold: 0.3 }).observe($("#tariffs"));
  }
})();
