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
    selected: null,
    hasProposals: false
  };

  function savePlan() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ text: state.text, data: state.data, selected: state.selected }));
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
      state.selected = typeof saved.selected === "number" ? saved.selected : null;
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
    readDetails();
    if (!getActiveNeeds().length) {
      detailsError.textContent = "Elegí al menos una cosa que necesites para poder armar opciones.";
      detailsError.hidden = false;
      return;
    }
    detailsError.hidden = true;
    state.selected = null;
    show("proposals", function () {
      renderProposals();
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

  function saveRequest() {
    if (!window.ListoDB || !state.data) return;
    var row = buildRequest();
    if (isEmptyRequest(row)) return;
    var signature = JSON.stringify(row);
    if (saving || signature === lastSaved) return;
    saving = true;
    window.ListoDB.saveEventRequest(row).then(function (result) {
      saving = false;
      if (result.ok) {
        lastSaved = signature;
        toast("Listo: guardamos tu pedido.");
      } else {
        toast(result.message, 8000);
      }
    }, function () {
      saving = false;
      toast("No pudimos guardar tu pedido. Probá de nuevo en un rato.", 8000);
    });
  }

  function getActiveNeeds() {
    var d = state.data;
    var list = NEEDS.filter(function (n) { return d.needs.indexOf(n.id) !== -1; })
      .map(function (n) { return { id: n.id, label: needLabel(n) }; });
    d.customNeeds.forEach(function (c) { if (c.on) list.push({ id: "custom", label: c.label }); });
    return list;
  }

  /* ---------- Pantalla 3: opciones DEMO ---------- */

  // Descripciones genéricas por necesidad para cada opción.
  // Nada de nombres de proveedores ni precios: son ideas de ejemplo.
  var NEED_DETAILS = {
    lugar:     ["Espacio reservado, íntimo", "Barra o terraza con ambiente", "Salón con una mesa larga"],
    comida:    ["Menú de pasos para compartir", "Finger food y platos de barra", "Cena servida al centro de la mesa"],
    bebida:    ["Vinos para acompañar la cena", "Barra de tragos toda la noche", "Vino, cerveza y un trago de bienvenida"],
    musica:    ["Playlist curada, volumen de charla", "DJ con set a medida", "Música en vivo o playlist propia"],
    deco:      ["Velas y detalles simples", "Luces cálidas y ambientación", "Centros de mesa y guirnaldas de luz"],
    foto:      ["Fotos en momentos clave", "Fotógrafo durante la noche", "Foto y video de la mesa"],
    torta:     ["Torta clásica", "Torta y mesa dulce", "Postre para compartir"],
    staff:     ["Atención de sala", "Bartender y staff de barra", "Mozos durante toda la cena"],
    animacion: ["Dinámicas simples", "Show sorpresa", "Animación a medida"],
    custom:    ["Opción esencial", "Opción recomendada", "Opción especial"]
  };

  var UNSPLASH = "https://images.unsplash.com/photo-";

  var STYLES = [
    {
      title: "Cena íntima",
      kicker: "Simple y bien resuelto",
      desc: "Pocas personas, buena mesa, luz baja. Lo importante, sin excesos.",
      price: "Cotización requerida",
      photo: "1559339352-11d035aa65de",
      alt: "Salón de restaurante con luz cálida"
    },
    {
      title: "Noche abierta",
      kicker: "Barra, música y gente",
      desc: "Un plan que arranca con un trago y termina tarde. Para moverse y encontrarse.",
      price: "Precio y disponibilidad a confirmar",
      photo: "1514933651103-005eec06c04b",
      alt: "Barra de noche con luces ámbar"
    },
    {
      title: "Mesa larga",
      kicker: "Todos en la misma mesa",
      desc: "Una sola mesa, platos al centro y guirnaldas de luz. La cena que se comparte.",
      price: "Cotización requerida",
      photo: "1555396273-367ea4eb4db5",
      alt: "Mesas largas con guirnaldas de luces de noche"
    }
  ];

  function photoURL(id, w) {
    return UNSPLASH + id + "?auto=format&fit=crop&w=" + w + "&h=" + Math.round(w * 1.25) + "&q=72";
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

  function renderProposals() {
    var d = state.data;
    var needs = getActiveNeeds();
    var box = $("#proposals");
    var loading = $("#loading");

    renderSummary();
    box.innerHTML = "";
    loading.hidden = false;

    // Una pausa corta: se siente como alguien armando el plan.
    setTimeout(function () {
      loading.hidden = true;
      box.innerHTML = STYLES.map(function (style, i) {
        var num = "0" + (i + 1);
        var names = needs.map(function (n) { return "<li>" + escapeHTML(n.label) + "</li>"; }).join("");
        var details = needs.map(function (n) {
          var detail = (NEED_DETAILS[n.id] || NEED_DETAILS.custom)[i];
          return "<li><span>" + escapeHTML(n.label) + "</span><span>" + escapeHTML(detail) + "</span></li>";
        }).join("");

        return "" +
          '<article class="card" data-index="' + i + '">' +
            '<figure class="card-photo photo">' +
              '<img src="' + photoURL(style.photo, 900) + '" srcset="' + photoURL(style.photo, 600) + ' 600w, ' + photoURL(style.photo, 900) + ' 900w, ' + photoURL(style.photo, 1200) + ' 1200w" sizes="(max-width: 720px) 100vw, (max-width: 1024px) 50vw, 33vw" alt="' + style.alt + '" loading="lazy">' +
              '<span class="card-chosen">Elegido</span>' +
              '<figcaption><span>Fig. ' + num + '</span><span>Demo</span></figcaption>' +
            '</figure>' +
            '<div class="card-body">' +
              '<div class="card-top"><span>' + num + '</span><span>' + style.kicker + '</span></div>' +
              '<h3 class="card-title">' + style.title + '</h3>' +
              '<p class="card-zone">' + escapeHTML(d.zone || "Zona a definir") + '</p>' +
              '<p class="card-desc">' + style.desc + '</p>' +
              '<ul class="card-needs">' + names + '</ul>' +
              '<p class="card-price">' + style.price + '</p>' +
              '<div class="card-more" id="card-more-' + i + '">' +
                '<div class="card-more-inner">' +
                  '<ul class="card-detail">' + details + '</ul>' +
                  '<p class="card-more-note">Ideas de ejemplo. Precio y disponibilidad a confirmar antes de reservar.</p>' +
                  '<button type="button" class="btn btn-dark card-choose" data-choose="' + i + '">Elegir este plan</button>' +
                '</div>' +
              '</div>' +
              '<button type="button" class="card-cta" data-open="' + i + '" aria-expanded="false" aria-controls="card-more-' + i + '">Ver plan <span aria-hidden="true">→</span></button>' +
            '</div>' +
          '</article>';
      }).join("");

      $all("#proposals .photo img").forEach(watchImage);
      state.hasProposals = true;
      if (state.selected !== null) markSelected(state.selected);
      savePlan();
    }, reduceMotion ? 0 : 1000);
  }

  function markSelected(i) {
    $all(".card").forEach(function (card, idx) {
      var on = idx === i;
      card.classList.toggle("is-selected", on);
      var b = card.querySelector("[data-choose]");
      if (b) b.innerHTML = on ? "Elegido ✓" : "Elegir este plan";
    });
  }

  $("#proposals").addEventListener("click", function (e) {
    var open = e.target.closest("[data-open]");
    if (open) {
      var card = open.closest(".card");
      var isOpen = card.classList.toggle("is-open");
      open.setAttribute("aria-expanded", isOpen ? "true" : "false");
      open.innerHTML = (isOpen ? "Cerrar" : "Ver plan") + ' <span aria-hidden="true">→</span>';
      return;
    }
    var choose = e.target.closest("[data-choose]");
    if (!choose) return;
    var i = parseInt(choose.getAttribute("data-choose"), 10);
    state.selected = i;
    markSelected(i);
    savePlan();
    toast("Anotado. En la versión completa te confirmaríamos precio y disponibilidad de “" + STYLES[i].title + "”.");
  });

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

  function goPlans() {
    if (state.data && state.hasProposals) {
      if (current !== "proposals") show("proposals", renderProposals);
      return;
    }
    if (loadPlan()) {
      state.hasProposals = false;
      show("proposals", renderProposals);
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
