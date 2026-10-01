/* =========================================================
   LISTO — Lógica de la demo
   1) Lee el texto libre del usuario y detecta los datos.
   2) Muestra lo que entendimos, editable con un toque.
   3) Genera 3 opciones DEMO (sin proveedores, precios ni
      disponibilidad reales).
   ========================================================= */
(function () {
  "use strict";

  document.documentElement.classList.add("js");

  /* ---------- Catálogos ---------- */

  // Tipos de plan: el primero que coincida gana, por eso el orden importa.
  var EVENT_TYPES = [
    { label: "Baby shower", words: ["baby shower", "babyshower"] },
    { label: "Despedida de soltero/a", words: ["despedida de soltero", "despedida de soltera"] },
    { label: "Despedida", words: ["despedida"] },
    { label: "After office", words: ["after office", "afterwork", "after work", "after"] },
    { label: "Casamiento", words: ["casamiento", "boda", "civil", "me caso", "nos casamos"] },
    { label: "Fiesta de 15", words: ["fiesta de 15", "mis 15", "sus 15", "quince"] },
    { label: "Aniversario", words: ["aniversario"] },
    { label: "Bautismo", words: ["bautismo", "bautizo"] },
    { label: "Comunión", words: ["comunion"] },
    { label: "Graduación", words: ["graduacion", "egresados", "egreso", "me recibi", "recibida", "recibido"] },
    { label: "Evento corporativo", words: ["corporativo", "empresa", "empresarial", "lanzamiento", "fin de ano laboral", "equipo de trabajo"] },
    { label: "Cumpleaños", words: ["cumpleanos", "cumple", "cumplo"] },
    { label: "Asado", words: ["asado"] },
    { label: "Cena", words: ["cena", "cenar"] },
    { label: "Juntada", words: ["juntada", "juntarnos", "encuentro"] },
    { label: "Reunión", words: ["reunion"] },
    { label: "Fiesta", words: ["fiesta", "festejo", "festejar", "celebrar", "celebracion"] }
  ];

  // Necesidades que LISTO reconoce. "alt" cambia la etiqueta según cómo lo dijo el usuario.
  var NEEDS = [
    { id: "lugar", label: "Lugar", words: ["lugar", "salon", "espacio", "quinta", "terraza", "local", "venue"] },
    { id: "comida", label: "Comida", words: ["comida", "catering", "picada", "lunch", "finger food", "menu", "cena", "almuerzo", "comer"],
      alt: [{ label: "Cena", words: ["cena", "cenar"] }] },
    { id: "bebida", label: "Bebida", words: ["bebida", "bebidas", "tragos", "barra", "vino", "cerveza", "drinks", "tomar", "brindis"],
      alt: [{ label: "Tragos", words: ["tragos", "barra", "drinks"] }] },
    { id: "musica", label: "Música", words: ["musica", "dj", "banda", "sonido"] },
    { id: "deco", label: "Deco", words: ["decoracion", "deco", "ambientacion", "flores", "globos"] },
    { id: "foto", label: "Fotos", words: ["fotografo", "fotografia", "fotos", "video"] },
    { id: "torta", label: "Torta", words: ["torta", "pastel", "mesa dulce", "postre"] },
    { id: "staff", label: "Staff", words: ["mozos", "mozo", "personal", "meseros", "staff", "servicio"] },
    { id: "animacion", label: "Animación", words: ["animacion", "animador", "show", "entretenimiento"] }
  ];

  // Zonas conocidas (se buscan de la más larga a la más corta).
  var ZONES = [
    "Palermo Soho", "Palermo Hollywood", "Palermo Chico", "Las Cañitas", "Puerto Madero", "San Telmo",
    "Villa Crespo", "Villa Urquiza", "Villa Devoto", "Villa del Parque", "Villa Ortúzar", "La Boca",
    "Palermo", "Belgrano", "Recoleta", "Núñez", "Colegiales", "Chacarita", "Microcentro", "Caballito",
    "Almagro", "Saavedra", "Coghlan", "Retiro", "Barracas", "Boedo", "Flores", "Devoto", "Monserrat",
    "Balvanera", "Agronomía", "Parque Patricios", "Congreso", "Centro",
    "Olivos", "Vicente López", "San Isidro", "Martínez", "Acassuso", "Beccar", "Tigre", "Nordelta",
    "Pilar", "Escobar", "Quilmes", "Lomas de Zamora", "Adrogué", "Banfield", "Lanús", "Avellaneda",
    "Ramos Mejía", "Morón", "Haedo", "Castelar", "Ituzaingó", "San Justo", "La Plata", "Canning",
    "Rosario", "Córdoba", "Mendoza", "Mar del Plata", "Bariloche", "Salta", "Tucumán",
    "Zona Norte", "Zona Sur", "Zona Oeste", "Capital Federal", "CABA", "Buenos Aires"
  ].sort(function (a, b) { return b.length - a.length; });

  /* ---------- Utilidades ---------- */

  // Minúsculas y sin acentos, para comparar sin importar cómo se escribió.
  function normalize(str) {
    return (str || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function hasWord(text, word) {
    return new RegExp("(^|[^a-z0-9])" + escapeRegExp(word) + "([^a-z0-9]|$)").test(text);
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function formatMoney(n) {
    return "$" + Math.round(n).toLocaleString("es-AR");
  }

  function parseNumber(raw) {
    // "1,5" o "1.5" → 1.5 (decimales para "millones").
    return parseFloat(String(raw).replace(",", "."));
  }

  function digitsOnly(str) { return String(str || "").replace(/\D/g, ""); }

  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Interpretación del texto ---------- */

  function detectType(t) {
    for (var i = 0; i < EVENT_TYPES.length; i++) {
      var words = EVENT_TYPES[i].words;
      for (var j = 0; j < words.length; j++) {
        if (hasWord(t, words[j])) return EVENT_TYPES[i].label;
      }
    }
    return "";
  }

  function detectGuests(t) {
    var m = t.match(/(\d{1,4})\s*(personas|persona|invitados|invitadas|invitades|amigos|amigas|pax|comensales|asistentes|adultos|chicos|nenes|ninos|gente)/);
    if (!m) m = t.match(/somos\s*(?:unos|unas)?\s*(\d{1,4})/);
    if (!m) m = t.match(/para\s*(?:unos|unas)?\s*(\d{1,4})(?!\s*(mil|k|millon|\.\d{3}|hs|horas|de\s))/);
    return m ? parseInt(m[1], 10) : null;
  }

  function detectBudget(t) {
    var m;
    if (/\bun\s+millon\b/.test(t)) return 1000000;
    m = t.match(/(\d+(?:[.,]\d+)?)\s*(millones|millon|palos|palo)\b/);
    if (m) return Math.round(parseNumber(m[1]) * 1000000);
    m = t.match(/(\d+(?:[.,]\d+)?)\s*(mil|k)\b/);
    if (m) return Math.round(parseNumber(m[1]) * 1000);
    m = t.match(/\$\s*(\d[\d.,]*)/);
    if (m) return parseInt(digitsOnly(m[1].replace(/[.,]\d{1,2}$/, "")), 10) || null;
    m = t.match(/(\d[\d.]*)\s*(pesos|ars)\b/);
    if (m) return parseInt(digitsOnly(m[1]), 10) || null;
    m = t.match(/presupuesto\s*(?:de|es|:)?\s*(?:unos|aprox\.?|aproximadamente)?\s*(\d[\d.]{3,})/);
    if (m) return parseInt(digitsOnly(m[1]), 10) || null;
    return null;
  }

  function detectZone(original, t) {
    for (var i = 0; i < ZONES.length; i++) {
      if (hasWord(t, normalize(ZONES[i]))) return ZONES[i];
    }
    // Si no está en la lista, tomamos lo que venga después de "en" con mayúscula.
    var m = original.match(/\ben\s+((?:[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)(?:\s+(?:de\s+)?[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)*)/);
    return m ? m[1] : "";
  }

  function detectNeeds(t) {
    return NEEDS.filter(function (need) {
      return need.words.some(function (w) { return hasWord(t, w); });
    }).map(function (need) { return need.id; });
  }

  // Etiquetas que respetan cómo lo dijo el usuario ("cena" en vez de "comida", "tragos" en vez de "bebida").
  function detectNeedLabels(t) {
    var labels = {};
    NEEDS.forEach(function (need) {
      (need.alt || []).forEach(function (alt) {
        if (!labels[need.id] && alt.words.some(function (w) { return hasWord(t, w); })) labels[need.id] = alt.label;
      });
    });
    return labels;
  }

  function interpret(text) {
    var t = normalize(text);
    return {
      type: detectType(t),
      guests: detectGuests(t),
      zone: detectZone(text, t),
      budget: detectBudget(t),
      needs: detectNeeds(t),
      needLabels: detectNeedLabels(t),
      customNeeds: []
    };
  }

  function needLabel(need) {
    return (state.data && state.data.needLabels && state.data.needLabels[need.id]) || need.label;
  }

  /* ---------- Estado (y último plan guardado en este navegador) ---------- */

  var STORAGE_KEY = "listo:last-plan";

  var state = {
    text: "",
    data: null,
    requestId: null,      // id (UUID) del event_request guardado en Supabase
    selected: null,       // google_place_id de la opción elegida
    selectedAt: null,
    options: null,        // las 3 opciones reales que se mostraron
    optionsAt: 0,
    hasProposals: false
  };

  function savePlan() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        text: state.text, data: state.data,
        requestId: state.requestId, requestSig: state.requestId ? lastSaved : "",
        selected: state.selected, selectedAt: state.selectedAt,
        options: state.options, optionsAt: state.optionsAt
      }));
    } catch (e) { /* sin almacenamiento: no pasa nada */ }
  }

  function loadPlan() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var saved = JSON.parse(raw);
      if (!saved || !saved.data || !Array.isArray(saved.data.needs)) return false;
      state.text = saved.text || "";
      state.data = saved.data;
      state.data.customNeeds = state.data.customNeeds || [];
      state.data.needLabels = state.data.needLabels || {};
      state.requestId = typeof saved.requestId === "string" ? saved.requestId : null;
      // Recuerda qué pedido ya está guardado: buscar de nuevo sin cambios no crea otro.
      if (state.requestId && typeof saved.requestSig === "string") lastSaved = saved.requestSig;
      state.selected = typeof saved.selected === "string" ? saved.selected : null;
      state.selectedAt = saved.selectedAt || null;
      state.options = Array.isArray(saved.options) ? saved.options : null;
      state.optionsAt = typeof saved.optionsAt === "number" ? saved.optionsAt : 0;
      return true;
    } catch (e) { return false; }
  }

  /* ---------- Fotos: aparecen suavemente al cargar ---------- */

  function watchImage(img) {
    var fig = img.closest(".photo");
    function done() { img.classList.add("is-loaded"); }
    function fail() { if (fig) fig.classList.add("img-failed"); }
    if (img.complete) {
      if (img.naturalWidth) done(); else fail();
    } else {
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", fail, { once: true });
    }
  }
  $all(".photo img").forEach(watchImage);

  /* ---------- Aparición al hacer scroll ---------- */

  var revealObserver = null;
  if ("IntersectionObserver" in window && !reduceMotion) {
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    $all("[data-reveal]").forEach(function (el) { revealObserver.observe(el); });
  } else {
    $all("[data-reveal]").forEach(function (el) { el.classList.add("in-view"); });
  }

  /* ---------- Navegación entre pantallas ---------- */

  var toastEl = $("#toast");
  var SCREENS = ["intro", "details", "proposals"];
  var ENTER_TARGET = { intro: ".hero", details: ".details-content", proposals: ".proposals-head" };
  var current = "intro";
  var switching = null;

  function enter(name) {
    var target = document.querySelector("#screen-" + name + " " + ENTER_TARGET[name]);
    if (!target) return;
    target.classList.remove("is-in");
    // Doble frame para que el navegador registre el estado inicial y anime.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { target.classList.add("is-in"); });
    });
  }

  function show(name, after) {
    var from = document.getElementById("screen-" + current);
    var to = document.getElementById("screen-" + name);

    function swap() {
      SCREENS.forEach(function (key) {
        var el = document.getElementById("screen-" + key);
        el.hidden = key !== name;
        el.classList.remove("is-leaving", "is-entering", "is-visible");
      });
      to.classList.add("is-visible", "is-entering");
      document.body.setAttribute("data-screen", name);
      toastEl.hidden = true;
      current = name;
      window.scrollTo(0, 0);
      enter(name);
      if (after) after();
    }

    clearTimeout(switching);
    if (from === to || reduceMotion) { swap(); return; }
    from.classList.add("is-leaving");
    switching = setTimeout(swap, 380);
  }

  enter("intro");

  /* ---------- Pantalla 1 ---------- */

  var textarea = $("#event-text");
  var hint = $("#intro-hint");
  var composer = $("#intro-form");
  var HINT_DEFAULT = hint.textContent;

  function clearIntroError() {
    composer.classList.remove("has-error");
    hint.classList.remove("is-error");
    hint.textContent = HINT_DEFAULT;
  }

  function autoGrow() {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 180) + "px";
  }

  textarea.addEventListener("input", function () { clearIntroError(); autoGrow(); });

  // Enter envía; Shift+Enter hace salto de línea.
  textarea.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (composer.requestSubmit) composer.requestSubmit();
      else composer.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  });

  $all(".chip-example").forEach(function (chip) {
    chip.addEventListener("click", function () {
      textarea.value = chip.getAttribute("data-example");
      clearIntroError();
      autoGrow();
      textarea.focus();
    });
  });

  composer.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = textarea.value.trim();
    if (text.length < 8) {
      composer.classList.add("has-error");
      hint.classList.add("is-error");
      hint.textContent = "Contanos un poco más: qué querés hacer, para cuántos y dónde.";
      textarea.focus();
      return;
    }
    state.text = text;
    state.data = interpret(text);
    state.selected = null;
    state.options = null;
    state.hasProposals = false;
    fillDetails();
    show("details");
  });

  /* ---------- Pantalla 2: esto entendimos ---------- */

  var fType = $("#f-type");
  var fGuests = $("#f-guests");
  var fZone = $("#f-zone");
  var fBudget = $("#f-budget");
  var needsBox = $("#needs");
  var fNeedExtra = $("#f-need-extra");
  var detailsError = $("#details-error");
  var guestsSuffix = $("#guests-suffix");

  // El número de personas ocupa sólo el ancho que necesita, así se lee "20 PERSONAS".
  function sizeGuests() {
    var len = fGuests.value ? String(fGuests.value).length : 7;
    fGuests.style.width = (len + 0.4) + "ch";
    var n = parseInt(fGuests.value, 10);
    guestsSuffix.textContent = n === 1 ? "persona" : "personas";
    guestsSuffix.hidden = !fGuests.value;
  }

  function fillDetails() {
    var d = state.data;
    $("#original-quote").textContent = "“" + state.text + "”";
    fType.value = d.type;
    fGuests.value = d.guests || "";
    fZone.value = d.zone;
    fBudget.value = d.budget ? d.budget.toLocaleString("es-AR") : "";
    sizeGuests();
    renderNeeds();
    detailsError.hidden = true;
  }

  function renderNeeds() {
    var d = state.data;
    needsBox.innerHTML = "";
    NEEDS.forEach(function (need) {
      needsBox.appendChild(makeNeedChip(needLabel(need), d.needs.indexOf(need.id) !== -1, function (on) {
        var i = d.needs.indexOf(need.id);
        if (on && i === -1) d.needs.push(need.id);
        if (!on && i !== -1) d.needs.splice(i, 1);
      }));
    });
    d.customNeeds.forEach(function (custom) {
      needsBox.appendChild(makeNeedChip(custom.label, custom.on, function (on) { custom.on = on; }));
    });
  }

  function makeNeedChip(label, on, onToggle) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "need";
    btn.textContent = label;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.addEventListener("click", function () {
      var next = btn.getAttribute("aria-pressed") !== "true";
      btn.setAttribute("aria-pressed", next ? "true" : "false");
      onToggle(next);
      detailsError.hidden = true;
    });
    return btn;
  }

  function addCustomNeed() {
    var label = fNeedExtra.value.trim();
    if (!label) { fNeedExtra.focus(); return; }
    label = label.charAt(0).toUpperCase() + label.slice(1);
    var exists = state.data.customNeeds.some(function (c) { return normalize(c.label) === normalize(label); }) ||
      NEEDS.some(function (n) { return normalize(needLabel(n)) === normalize(label); });
    if (!exists) state.data.customNeeds.push({ label: label, on: true });
    fNeedExtra.value = "";
    renderNeeds();
    detailsError.hidden = true;
  }

  $("#add-need-btn").addEventListener("click", addCustomNeed);
  fNeedExtra.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); addCustomNeed(); }
  });

  $all(".stepper-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var delta = parseInt(btn.getAttribute("data-step-by"), 10);
      var value = parseInt(fGuests.value, 10) || 0;
      fGuests.value = Math.min(2000, Math.max(1, value + delta));
      sizeGuests();
    });
  });

  fGuests.addEventListener("input", function () {
    var digits = digitsOnly(fGuests.value).slice(0, 4);
    if (fGuests.value !== digits) fGuests.value = digits;
    sizeGuests();
  });

  // Formatea el presupuesto con puntos de miles mientras se escribe.
  fBudget.addEventListener("input", function () {
    var digits = digitsOnly(fBudget.value).slice(0, 12);
    fBudget.value = digits ? parseInt(digits, 10).toLocaleString("es-AR") : "";
  });

  // Enter en un dato pasa al siguiente, como en una revista que se completa sola.
  [fType, fGuests, fZone, fBudget].forEach(function (input, i, list) {
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        if (list[i + 1]) list[i + 1].focus(); else input.blur();
      }
    });
  });

  function readDetails() {
    var d = state.data;
    d.type = fType.value.trim();
    var g = parseInt(fGuests.value, 10);
    d.guests = g > 0 ? g : null;
    d.zone = fZone.value.trim();
    var b = parseInt(digitsOnly(fBudget.value), 10);
    d.budget = b > 0 ? b : null;
  }

  $("#details-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (searching) return;           // ya hay una búsqueda en curso: no se duplica
    readDetails();
    if (!getActiveNeeds().length && !state.data.type) {
      detailsError.textContent = "Contanos qué plan es o elegí al menos una cosa que necesites.";
      detailsError.hidden = false;
      return;
    }
    detailsError.hidden = true;
    state.selected = null;
    setSearching(true);              // se bloquea ya mismo, antes de la transición
    show("proposals", function () {
      runSearch();
      saveRequest();
    });
  });

  /* ---------- Guardado del pedido en Supabase ---------- */

  var lastSaved = "";   // evita guardar dos veces exactamente el mismo pedido
  var saving = false;

  function buildRequest() {
    var d = state.data;
    return {
      original_prompt: state.text,
      event_type: d.type || null,
      guests: d.guests || null,
      zone: d.zone || null,
      budget: d.budget || null,
      needs: getActiveNeeds().map(function (n) { return n.label; }),
      status: "new"
    };
  }

  // Un pedido está "vacío" si no hay texto o no se entendió nada útil.
  function isEmptyRequest(row) {
    if (!row.original_prompt || row.original_prompt.trim().length < 8) return true;
    return !row.event_type && !row.guests && !row.zone && !row.budget && !row.needs.length;
  }

  // UUID aleatorio: lo genera el navegador para conocer el id del pedido sin tener que leer la tabla.
  function newUUID() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }

  var requestSave = null;   // promesa del guardado en curso: la elección la espera

  function saveRequest() {
    if (!window.ListoDB || !state.data) return;
    var row = buildRequest();
    if (isEmptyRequest(row)) return;
    var signature = JSON.stringify(row);
    if (saving || signature === lastSaved) return;   // mismo pedido: se reutiliza el id ya guardado
    saving = true;
    state.requestId = null;
    state.selected = null;
    var id = newUUID();
    var withId = {};
    Object.keys(row).forEach(function (k) { withId[k] = row[k]; });
    withId.id = id;

    requestSave = window.ListoDB.saveEventRequest(withId).then(function (result) {
      // Si la columna id no aceptara el UUID, se guarda igual el pedido (sin poder vincular la elección).
      if (!result.ok && result.reason === "bad-data") {
        return window.ListoDB.saveEventRequest(row).then(function (r2) { return { result: r2, id: null }; });
      }
      return { result: result, id: id };
    }).then(function (out) {
      saving = false;
      if (out.result.ok) {
        lastSaved = signature;
        state.requestId = out.id;
        savePlan();
        toast("Listo: guardamos tu pedido.");
      } else {
        toast(out.result.message, 8000);
      }
      return state.requestId;
    }, function () {
      saving = false;
      toast("No pudimos guardar tu pedido. Probá de nuevo en un rato.", 8000);
      return null;
    });
  }

  function getActiveNeeds() {
    var d = state.data;
    var list = NEEDS.filter(function (n) { return d.needs.indexOf(n.id) !== -1; })
      .map(function (n) { return { id: n.id, label: needLabel(n) }; });
    d.customNeeds.forEach(function (c) { if (c.on) list.push({ id: "custom", label: c.label }); });
    return list;
  }

  /* ---------- Pantalla 3: lugares reales (Google Places vía Vercel) ---------- */

  var OPTIONS_TTL_MS = 50 * 60 * 1000;   // los links de fotos duran 1 hora: re-buscamos antes
  var SEARCH_TIMEOUT_MS = 20000;
  var searching = false;
  var searchButton = $("#details-form button[type=submit]");
  var PRICE_NOTE = "Precio y disponibilidad a confirmar";

  // Lógica simple: tragos → bares; eventos grandes → salones; el resto → restaurantes.
  function chooseCategory(d) {
    var ids = d.needs || [];
    var type = normalize(d.type);
    if (/after office|despedida/.test(type)) return "bares";
    if (ids.indexOf("bebida") !== -1 && ids.indexOf("comida") === -1 && !/cena|cumple|asado/.test(type)) return "bares";
    if ((d.guests || 0) >= 40 || /casamiento|fiesta de 15|corporativo|graduacion|bautismo|comunion/.test(type)) return "salones";
    return "restaurantes";
  }

  function renderSummary() {
    var d = state.data;
    var parts = [];
    parts.push(d.type || "Tu plan");
    if (d.guests) parts.push(d.guests + (d.guests === 1 ? " persona" : " personas"));
    if (d.zone) parts.push(d.zone);
    if (d.budget) parts.push("Hasta " + formatMoney(d.budget));
    $("#proposals-summary").textContent = parts.join("  —  ");
  }

  function setSearching(on) {
    searching = on;
    if (searchButton) {
      searchButton.disabled = on;
      searchButton.setAttribute("aria-busy", on ? "true" : "false");
    }
    $("#loading").hidden = !on;
  }

  function searchOptions() {
    if (searching) return;
    setSearching(true);
    runSearch();
  }

  // Hace la búsqueda. Quien la llama ya marcó "buscando" (evita pedidos duplicados).
  function runSearch() {
    var d = state.data;
    var box = $("#proposals");
    renderSummary();
    box.innerHTML = "";
    $("#loading").hidden = false;

    var category = chooseCategory(d);
    var url = "/api/plan-options?category=" + encodeURIComponent(category) + "&zone=" + encodeURIComponent(d.zone || "");
    var controller = "AbortController" in window ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, SEARCH_TIMEOUT_MS) : null;

    fetch(url, { signal: controller ? controller.signal : undefined, headers: { "Accept": "application/json" } })
      .then(function (r) {
        return r.json().catch(function () { return { ok: false, error: "" }; }).then(function (data) {
          if (!r.ok || !data.ok) throw new Error(data.error || "");
          return data;
        });
      })
      .then(function (data) {
        state.options = Array.isArray(data.options) ? data.options : [];
        state.optionsKey = url;
        state.optionsAt = Date.now();
        state.hasProposals = true;
        renderOptions();
        savePlan();
      })
      .catch(function (err) {
        var aborted = err && err.name === "AbortError";
        renderMessage(
          "No pudimos traer opciones.",
          aborted ? "La búsqueda tardó demasiado. Revisá tu conexión y probá de nuevo."
            : (err && err.message) || "Parece un problema de conexión. Probá de nuevo en un momento.",
          true
        );
      })
      .then(function () {
        clearTimeout(timer);
        setSearching(false);
      });
  }

  // Mensaje elegante dentro de LISTO (sin resultados o error). Nunca vuelve a la demo.
  function renderMessage(title, text, canRetry) {
    var box = $("#proposals");
    box.innerHTML =
      '<div class="proposals-message" role="status">' +
        '<p class="proposals-message-title">' + escapeHTML(title) + '</p>' +
        '<p class="proposals-message-text">' + escapeHTML(text) + '</p>' +
        '<div class="proposals-message-actions">' +
          (canRetry ? '<button type="button" class="btn btn-dark" data-retry>Reintentar <span aria-hidden="true">→</span></button>' : '') +
          '<button type="button" class="btn-text" data-action="details">← Ajustar el plan</button>' +
        '</div>' +
      '</div>';
  }

  function ratingText(o) {
    if (typeof o.rating !== "number") return "Sin rating en Google todavía";
    var txt = "★ " + o.rating.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (typeof o.review_count === "number") txt += " · " + o.review_count.toLocaleString("es-AR") + " reseñas en Google";
    return txt;
  }

  function safeHttps(url) {
    return /^https:\/\//.test(url || "") ? url : "";
  }

  function photoHTML(o, num) {
    var p = o.photo;
    var credit = "Sin fotos en Google";
    var img = '<span class="photo-empty" aria-hidden="true">LISTO</span>';
    if (p && p.thumb && p.large) {
      var authors = (p.attributions || []).map(function (a) {
        var href = safeHttps(a.uri);
        return href ? '<a href="' + escapeHTML(href) + '" target="_blank" rel="noopener noreferrer">' + escapeHTML(a.name) + '</a>' : escapeHTML(a.name);
      }).join(", ");
      credit = "Foto: " + (authors ? authors + " · " : "") + "Google Maps";
      img = '<img src="' + escapeHTML(p.large) + '" srcset="' + escapeHTML(p.thumb) + ' 480w, ' + escapeHTML(p.large) + ' 1200w" ' +
        'sizes="(max-width: 720px) 100vw, (max-width: 1024px) 50vw, 33vw" alt="' + escapeHTML(o.name) + '" loading="lazy" referrerpolicy="no-referrer">';
    }
    return '<figure class="card-photo photo' + (p ? '' : ' no-photo') + '">' + img +
      '<span class="card-chosen">Elegido</span>' +
      '<figcaption><span>Fig. ' + num + '</span><span class="photo-credit">' + credit + '</span></figcaption>' +
    '</figure>';
  }

  function renderOptions() {
    var box = $("#proposals");
    var list = state.options || [];
    if (!list.length) {
      renderMessage("Todavía no.", "No encontramos una opción que encaje todavía. Probá ampliando la zona o cambiando algún detalle.", false);
      return;
    }
    box.innerHTML = list.map(function (o, i) {
      var num = "0" + (i + 1);
      var where = [o.zone, o.address_short].filter(Boolean).join(" — ");
      var maps = safeHttps(o.maps_url);
      var web = safeHttps(o.website);
      return '' +
        '<article class="card" data-id="' + escapeHTML(o.google_place_id) + '">' +
          photoHTML(o, num) +
          '<div class="card-body">' +
            '<div class="card-top"><span>' + num + '</span><span>' + escapeHTML(o.category || "Lugar") + '</span></div>' +
            '<h3 class="card-title">' + escapeHTML(o.name) + '</h3>' +
            '<p class="card-zone">' + escapeHTML(where || "Dirección a confirmar") + '</p>' +
            '<p class="card-desc">' + escapeHTML(ratingText(o)) + '</p>' +
            '<p class="card-price">' + PRICE_NOTE + '</p>' +
            '<div class="card-links">' +
              (maps ? '<a class="card-cta" href="' + escapeHTML(maps) + '" target="_blank" rel="noopener noreferrer">Ver en Maps <span aria-hidden="true">→</span></a>' : '') +
              (web ? '<a class="card-cta" href="' + escapeHTML(web) + '" target="_blank" rel="noopener noreferrer">Sitio web <span aria-hidden="true">→</span></a>' : '') +
            '</div>' +
            '<button type="button" class="btn btn-dark card-choose" data-choose="' + i + '">Elegir esta opción</button>' +
            '<div class="card-share">' +
              '<button type="button" class="card-cta" data-share="' + i + '">Compartir plan <span aria-hidden="true">→</span></button>' +
              '<a class="card-wa" href="https://wa.me/?text=' + encodeURIComponent(shareText(o)) + '" target="_blank" rel="noopener noreferrer">WhatsApp</a>' +
            '</div>' +
          '</div>' +
        '</article>';
    }).join("");

    $all("#proposals .photo img").forEach(watchImage);
    if (state.selected) markSelected(state.selected);
  }

  function markSelected(id) {
    $all("#proposals .card").forEach(function (card) {
      var on = card.getAttribute("data-id") === id;
      card.classList.toggle("is-selected", on);
      var b = card.querySelector("[data-choose]");
      if (b) b.innerHTML = on ? "Elegida ✓" : "Elegir esta opción";
    });
  }

  // Texto para compartir: sólo datos públicos del lugar. Sin claves, tokens ni IDs internos.
  function shareText(o) {
    var d = state.data || {};
    var lines = [];
    var head = d.type || "Plan";
    if (d.guests) head += " para " + d.guests;
    lines.push(head + " — armado con LISTO");
    lines.push(o.name + ([o.zone].filter(Boolean).length ? " · " + o.zone : ""));
    if (typeof o.rating === "number") lines.push(ratingText(o));
    if (safeHttps(o.maps_url)) lines.push("Google Maps: " + o.maps_url);
    lines.push(PRICE_NOTE + ".");
    return lines.join("\n");
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) resolve(); else reject(new Error("copy"));
    });
  }

  function sharePlan(o) {
    var text = shareText(o);
    if (navigator.share) {
      navigator.share({ title: "LISTO — " + o.name, text: text }).catch(function (err) {
        if (err && err.name === "AbortError") return;   // el usuario canceló: no es un error
        copyFallback(text);
      });
      return;
    }
    copyFallback(text);
  }

  function copyFallback(text) {
    copyText(text).then(function () {
      toast("Copiamos el plan. Pegalo donde quieras.");
    }, function () {
      toast("No pudimos copiar el plan. Probá con el botón de WhatsApp.", 6000);
    });
  }

  $("#proposals").addEventListener("click", function (e) {
    if (e.target.closest("[data-retry]")) { searchOptions(); return; }
    var share = e.target.closest("[data-share]");
    if (share) { sharePlan(state.options[parseInt(share.getAttribute("data-share"), 10)]); return; }
    var choose = e.target.closest("[data-choose]");
    if (!choose) return;
    var o = state.options[parseInt(choose.getAttribute("data-choose"), 10)];
    if (o) chooseOption(o, choose);
  });

  /* ---------- Elegir una opción (se guarda en plan_selections) ---------- */

  var choosing = false;

  function setChoosing(on, button) {
    choosing = on;
    $all("#proposals [data-choose]").forEach(function (b) { b.disabled = on; });
    if (on && button) button.innerHTML = "Guardando…";
  }

  function postSelection(requestId, o) {
    return fetch("/api/plan-selection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_request_id: requestId, google_place_id: o.google_place_id })
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false }; }).then(function (data) {
        if (!r.ok || !data.ok) throw new Error(data.error || "");
        return data;
      });
    });
  }

  function chooseOption(o, button) {
    if (choosing) return;                                    // evita doble clic
    if (state.selected === o.google_place_id) {
      toast("Ya elegiste " + o.name + ". Si querés, podés elegir otra opción.");
      return;
    }
    var previous = state.selected;
    setChoosing(true, button);

    // Esperamos a que el pedido termine de guardarse para tener su id.
    Promise.resolve(requestSave).then(function () {
      if (!state.requestId) throw new Error("No pudimos vincular tu elección porque el pedido no se guardó. Probá buscar opciones de nuevo.");
      return postSelection(state.requestId, o);
    }).then(function (data) {
      state.selected = o.google_place_id;
      state.selectedAt = (data.selection && data.selection.created_at) || new Date().toISOString();
      savePlan();
      setChoosing(false);
      markSelected(o.google_place_id);
      toast((previous ? "Cambiamos tu elección a " : "Guardamos tu elección: ") + o.name +
        ". No reservamos ni cobramos nada: " + PRICE_NOTE.toLowerCase() + ".", 6000);
    }).catch(function (err) {
      setChoosing(false);
      markSelected(previous);                                // vuelve a como estaba
      toast((err && err.message) || "No pudimos guardar tu elección. Probá de nuevo en un momento.", 8000);
    });
  }

  /* ---------- Aviso flotante ---------- */

  var toastTimer = null;
  function toast(msg, duration) {
    toastEl.hidden = true;
    toastEl.textContent = msg;
    void toastEl.offsetWidth; // reinicia la animación
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, duration || 4600);
  }

  /* ---------- Botones generales y menú ---------- */

  function goStart() {
    if (current !== "intro") {
      show("intro", function () { setTimeout(function () { textarea.focus({ preventScroll: true }); }, 60); });
    } else {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
      setTimeout(function () { textarea.focus({ preventScroll: true }); }, 450);
    }
  }

  function goHow() {
    function scroll() {
      var target = document.getElementById("como-funciona");
      if (target) target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    }
    if (current !== "intro") show("intro", function () { setTimeout(scroll, 60); });
    else scroll();
  }

  function hasFreshOptions() {
    return state.options && state.optionsAt && Date.now() - state.optionsAt < OPTIONS_TTL_MS;
  }

  function showPlans() {
    show("proposals", function () {
      renderSummary();
      if (hasFreshOptions()) renderOptions(); else searchOptions();
    });
  }

  function goPlans() {
    if (state.data && state.hasProposals) {
      if (current !== "proposals") showPlans();
      return;
    }
    if (loadPlan()) {
      state.hasProposals = true;
      showPlans();
      return;
    }
    toast("Todavía no armaste ningún plan. Contanos qué querés hacer y empezamos.");
    goStart();
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    e.preventDefault();
    var action = el.getAttribute("data-action");
    if (action === "home" || action === "start") {
      goStart();
    } else if (action === "how") {
      goHow();
    } else if (action === "plans") {
      goPlans();
    } else if (action === "details" && state.data) {
      fillDetails();
      show("details");
    }
  });

  // Exponemos el intérprete sólo para pruebas.
  window.__listoInterpret = interpret;
})();
