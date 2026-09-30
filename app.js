/* =========================================================
   LISTO — Lógica de la demo
   1) Lee el texto libre del usuario y detecta los datos.
   2) Muestra los datos para que se puedan editar.
   3) Genera 3 propuestas DEMO (sin proveedores ni precios reales).
   ========================================================= */
(function () {
  "use strict";

  /* ---------- Catálogos ---------- */

  // Tipos de evento: el primero que coincida gana, por eso el orden importa.
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
    { label: "Cena", words: ["cena"] },
    { label: "Reunión", words: ["reunion", "juntada", "encuentro"] },
    { label: "Fiesta", words: ["fiesta", "festejo", "festejar", "celebrar", "celebracion"] }
  ];

  // Necesidades que LISTO reconoce.
  var NEEDS = [
    { id: "lugar", label: "Lugar", words: ["lugar", "salon", "espacio", "quinta", "terraza", "local", "venue"] },
    { id: "comida", label: "Comida", words: ["comida", "catering", "picada", "lunch", "finger food", "menu", "cena", "almuerzo", "comer"] },
    { id: "bebida", label: "Bebida", words: ["bebida", "tragos", "barra", "vino", "cerveza", "drinks", "tomar", "brindis"] },
    { id: "musica", label: "Música / DJ", words: ["musica", "dj", "banda", "sonido"] },
    { id: "deco", label: "Decoración", words: ["decoracion", "deco", "ambientacion", "flores", "globos"] },
    { id: "foto", label: "Fotografía", words: ["fotografo", "fotografia", "fotos", "video"] },
    { id: "torta", label: "Torta / mesa dulce", words: ["torta", "pastel", "mesa dulce", "postre"] },
    { id: "staff", label: "Mozos / staff", words: ["mozos", "mozo", "personal", "meseros", "staff", "servicio"] },
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

  function interpret(text) {
    var t = normalize(text);
    return {
      type: detectType(t),
      guests: detectGuests(t),
      zone: detectZone(text, t),
      budget: detectBudget(t),
      needs: detectNeeds(t),
      customNeeds: []
    };
  }

  /* ---------- Estado ---------- */

  var state = {
    text: "",
    data: null,
    selected: null
  };

  /* ---------- Navegación entre pantallas ---------- */

  var SCREENS = { intro: 1, details: 2, proposals: 3 };

  function show(name) {
    Object.keys(SCREENS).forEach(function (key) {
      var el = document.getElementById("screen-" + key);
      var active = key === name;
      el.hidden = !active;
      el.classList.toggle("is-visible", active);
    });
    var current = SCREENS[name];
    document.querySelectorAll(".step").forEach(function (step) {
      var n = parseInt(step.getAttribute("data-step"), 10);
      step.classList.toggle("is-active", n === current);
      step.classList.toggle("is-done", n < current);
      if (n === current) step.setAttribute("aria-current", "step");
      else step.removeAttribute("aria-current");
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

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

  textarea.addEventListener("input", clearIntroError);

  // Enter envía; Shift+Enter hace salto de línea.
  textarea.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      composer.requestSubmit ? composer.requestSubmit() : composer.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  });

  document.querySelectorAll(".chip-example").forEach(function (chip) {
    chip.addEventListener("click", function () {
      textarea.value = chip.getAttribute("data-example");
      clearIntroError();
      textarea.focus();
    });
  });

  composer.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = textarea.value.trim();
    if (text.length < 8) {
      composer.classList.add("has-error");
      hint.classList.add("is-error");
      hint.textContent = "Contanos un poco más: qué festejás, para cuántos y dónde.";
      textarea.focus();
      return;
    }
    state.text = text;
    state.data = interpret(text);
    fillDetails();
    show("details");
  });

  /* ---------- Pantalla 2 ---------- */

  var fType = $("#f-type");
  var fGuests = $("#f-guests");
  var fZone = $("#f-zone");
  var fBudget = $("#f-budget");
  var needsBox = $("#needs");
  var fNeedExtra = $("#f-need-extra");
  var detailsError = $("#details-error");

  function markEmpty(input) {
    input.classList.toggle("is-empty", !input.value.trim());
  }

  function fillDetails() {
    var d = state.data;
    $("#original-quote").textContent = "“" + state.text + "”";
    fType.value = d.type;
    fGuests.value = d.guests || "";
    fZone.value = d.zone;
    fBudget.value = d.budget ? d.budget.toLocaleString("es-AR") : "";
    renderNeeds();
    [fType, fGuests, fZone, fBudget].forEach(markEmpty);
    detailsError.hidden = true;
  }

  function renderNeeds() {
    var d = state.data;
    needsBox.innerHTML = "";
    NEEDS.forEach(function (need) {
      needsBox.appendChild(makeNeedChip(need.label, d.needs.indexOf(need.id) !== -1, function (on) {
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
      NEEDS.some(function (n) { return normalize(n.label) === normalize(label); });
    if (!exists) state.data.customNeeds.push({ label: label, on: true });
    fNeedExtra.value = "";
    renderNeeds();
    detailsError.hidden = true;
  }

  $("#add-need-btn").addEventListener("click", addCustomNeed);
  fNeedExtra.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); addCustomNeed(); }
  });

  document.querySelectorAll(".stepper-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var delta = parseInt(btn.getAttribute("data-step-by"), 10);
      var current = parseInt(fGuests.value, 10) || 0;
      fGuests.value = Math.min(2000, Math.max(1, current + delta));
      markEmpty(fGuests);
    });
  });

  // Formatea el presupuesto con puntos de miles mientras se escribe.
  fBudget.addEventListener("input", function () {
    var digits = digitsOnly(fBudget.value).slice(0, 12);
    fBudget.value = digits ? parseInt(digits, 10).toLocaleString("es-AR") : "";
    markEmpty(fBudget);
  });

  [fType, fGuests, fZone].forEach(function (input) {
    input.addEventListener("input", function () { markEmpty(input); });
  });

  $("#details-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var d = state.data;
    d.type = fType.value.trim();
    var g = parseInt(fGuests.value, 10);
    d.guests = g > 0 ? g : null;
    d.zone = fZone.value.trim();
    var b = parseInt(digitsOnly(fBudget.value), 10);
    d.budget = b > 0 ? b : null;

    var activeNeeds = getActiveNeeds();
    if (!activeNeeds.length) {
      detailsError.textContent = "Elegí al menos una necesidad para poder armar propuestas.";
      detailsError.hidden = false;
      return;
    }
    detailsError.hidden = true;
    state.selected = null;
    show("proposals");
    renderProposals();
  });

  function getActiveNeeds() {
    var d = state.data;
    var list = NEEDS.filter(function (n) { return d.needs.indexOf(n.id) !== -1; })
      .map(function (n) { return { id: n.id, label: n.label }; });
    d.customNeeds.forEach(function (c) { if (c.on) list.push({ id: "custom", label: c.label }); });
    return list;
  }

  /* ---------- Pantalla 3: propuestas DEMO ---------- */

  // Descripciones genéricas por necesidad para cada estilo de propuesta.
  // Nada de nombres de proveedores ni precios: son ideas de ejemplo.
  var NEED_DETAILS = {
    lugar:     ["Espacio privado y cómodo", "Terraza o patio con ambientación", "Salón exclusivo con servicio completo"],
    comida:    ["Picada y finger food", "Catering de pasos informal", "Menú de autor servido"],
    bebida:    ["Bebidas sin alcohol, cerveza y vino", "Barra con tragos clásicos", "Barra premium con bartender"],
    musica:    ["Playlist curada y sonido", "DJ con set a medida", "DJ y show en vivo"],
    deco:      ["Detalles simples y cálidos", "Ambientación temática", "Diseño floral y de iluminación"],
    foto:      ["Cobertura en momentos clave", "Fotógrafo durante el evento", "Foto y video profesional"],
    torta:     ["Torta clásica", "Torta y mesa dulce", "Mesa dulce de autor"],
    staff:     ["Asistencia básica", "Mozos durante todo el evento", "Equipo completo de servicio"],
    animacion: ["Juegos y dinámicas", "Animador profesional", "Show sorpresa"],
    custom:    ["Opción esencial", "Opción recomendada", "Opción especial"]
  };

  var STYLES = [
    {
      tag: "Esencial",
      kicker: "Simple y bien resuelto",
      title: "Íntima",
      desc: "Lo importante, sin excesos. Un encuentro cálido para disfrutar con tu gente.",
      price: "Cotización requerida",
      palette: ["#E9E1D3", "#D8C8AE", "#B89B72", "#F6F1E8"]
    },
    {
      tag: "Recomendada",
      kicker: "El equilibrio justo",
      title: "Equilibrada",
      desc: "Una propuesta completa y armoniosa, pensada para que no tengas que ocuparte de nada.",
      price: "Precio y disponibilidad a confirmar",
      palette: ["#DCE0D6", "#B7BFAC", "#6F7B63", "#F2F3EE"]
    },
    {
      tag: "Experiencia",
      kicker: "Para que se recuerde",
      title: "Memorable",
      desc: "Cada detalle cuidado. Una experiencia que se siente especial de principio a fin.",
      price: "Cotización requerida",
      palette: ["#2A2724", "#4A423A", "#B08D5B", "#EADFCB"]
    }
  ];

  // Ilustraciones abstractas generadas con SVG (sin fotos de terceros).
  function visual(index, p) {
    var shapes = [
      // Arco + sol
      '<rect width="400" height="250" fill="' + p[0] + '"/>' +
      '<circle cx="290" cy="92" r="46" fill="' + p[2] + '" opacity=".85"/>' +
      '<path d="M60 250V150a80 80 0 0 1 160 0v100z" fill="' + p[1] + '"/>' +
      '<path d="M92 250V156a48 48 0 0 1 96 0v94z" fill="' + p[3] + '"/>' +
      '<line x1="0" y1="232" x2="400" y2="232" stroke="' + p[2] + '" stroke-width="1" opacity=".5"/>',
      // Mesa larga con velas
      '<rect width="400" height="250" fill="' + p[0] + '"/>' +
      '<rect x="0" y="165" width="400" height="85" fill="' + p[1] + '"/>' +
      '<rect x="40" y="150" width="320" height="16" rx="8" fill="' + p[2] + '"/>' +
      '<g fill="' + p[3] + '">' +
        '<rect x="110" y="96" width="10" height="54" rx="3"/><rect x="170" y="80" width="10" height="70" rx="3"/>' +
        '<rect x="230" y="88" width="10" height="62" rx="3"/><rect x="290" y="100" width="10" height="50" rx="3"/>' +
      '</g>' +
      '<g fill="#E8B96A"><ellipse cx="115" cy="88" rx="4" ry="7"/><ellipse cx="175" cy="72" rx="4" ry="7"/>' +
      '<ellipse cx="235" cy="80" rx="4" ry="7"/><ellipse cx="295" cy="92" rx="4" ry="7"/></g>',
      // Noche con guirnalda de luces
      '<rect width="400" height="250" fill="' + p[0] + '"/>' +
      '<circle cx="320" cy="70" r="28" fill="' + p[3] + '" opacity=".9"/>' +
      '<circle cx="332" cy="62" r="26" fill="' + p[0] + '"/>' +
      '<path d="M0 60 Q100 130 200 70 T400 80" fill="none" stroke="' + p[2] + '" stroke-width="1.2" opacity=".7"/>' +
      [[30,78],[70,98],[110,108],[150,100],[190,78],[240,62],[290,70],[340,82],[380,82]].map(function (c) {
        return '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="4" fill="#E8B96A"/><circle cx="' + c[0] + '" cy="' + c[1] + '" r="10" fill="#E8B96A" opacity=".15"/>';
      }).join("") +
      '<path d="M0 250V190l60-26 70 18 80-34 90 30 100-22v94z" fill="' + p[1] + '"/>' +
      '<path d="M0 250v-30l90-14 110 16 90-12 110 10v30z" fill="' + p[2] + '" opacity=".35"/>'
    ];
    return '<svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' + shapes[index] + '</svg>';
  }

  function renderProposals() {
    var d = state.data;
    var needs = getActiveNeeds();
    var box = $("#proposals");
    var loading = $("#loading");

    var parts = [];
    parts.push(d.type || "Tu evento");
    if (d.guests) parts.push(d.guests + (d.guests === 1 ? " persona" : " personas"));
    if (d.zone) parts.push(d.zone);
    if (d.budget) parts.push("presupuesto " + formatMoney(d.budget));
    $("#proposals-summary").textContent = parts.join(" · ");

    box.innerHTML = "";
    loading.hidden = false;

    // Pequeña espera para que se sienta como un concierge trabajando.
    setTimeout(function () {
      loading.hidden = true;
      box.innerHTML = STYLES.map(function (style, i) {
        var items = needs.map(function (n) {
          var detail = (NEED_DETAILS[n.id] || NEED_DETAILS.custom)[i];
          if (n.id === "lugar" && d.zone) detail += " en " + d.zone;
          return '<li><span class="item-name">' + escapeHTML(n.label) + '</span>' +
            '<span class="item-detail">' + escapeHTML(detail) + '</span></li>';
        }).join("");

        return '' +
          '<article class="card" data-index="' + i + '">' +
            '<div class="card-visual">' + visual(i, style.palette) +
              '<span class="card-tag">' + style.tag + '</span></div>' +
            '<div class="card-body">' +
              '<p class="card-kicker">' + style.kicker + '</p>' +
              '<h3 class="card-title">' + style.title + '</h3>' +
              '<p class="card-desc">' + style.desc + '</p>' +
              '<ul class="card-list">' + items + '</ul>' +
              '<div class="card-price"><small>Precio estimado</small><strong>' + style.price + '</strong></div>' +
              '<button type="button" class="btn btn-ghost" data-choose="' + i + '">Me interesa</button>' +
            '</div>' +
          '</article>';
      }).join("");
    }, 900);
  }

  $("#proposals").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-choose]");
    if (!btn) return;
    var i = parseInt(btn.getAttribute("data-choose"), 10);
    state.selected = i;
    document.querySelectorAll(".card").forEach(function (card, idx) {
      var on = idx === i;
      card.classList.toggle("is-selected", on);
      var b = card.querySelector("[data-choose]");
      b.textContent = on ? "Elegida ✓" : "Me interesa";
      b.className = on ? "btn btn-primary" : "btn btn-ghost";
    });
    toast("Anotado. En la versión completa, te confirmaríamos precios y disponibilidad de la propuesta “" + STYLES[i].title + "”.");
  });

  /* ---------- Aviso flotante ---------- */

  var toastEl = $("#toast");
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 4200);
  }

  /* ---------- Botones generales ---------- */

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    e.preventDefault();
    var action = el.getAttribute("data-action");
    if (action === "home") {
      show("intro");
      setTimeout(function () { textarea.focus({ preventScroll: true }); }, 50);
    } else if (action === "details" && state.data) {
      fillDetails();
      show("details");
    }
  });

  // Exponemos el intérprete sólo para pruebas.
  window.__listoInterpret = interpret;
})();
