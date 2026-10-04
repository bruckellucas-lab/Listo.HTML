/* =========================================================
   LISTO — Guardado de pedidos en Supabase
   Envía cada pedido a la tabla "event_requests" usando la
   API pública de Supabase (sin librerías extra).
   Sólo inserta: la web nunca lee ni borra datos.
   ========================================================= */
(function () {
  "use strict";

  var TABLE = "event_requests";
  var TIMEOUT_MS = 12000;

  function readConfig() {
    var cfg = window.LISTO_CONFIG || {};
    var url = String(cfg.supabaseUrl || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
    var key = String(cfg.supabaseKey || "").trim();
    return { url: url, key: key };
  }

  // Lee el "rol" de una clave vieja tipo JWT (eyJ...) para detectar la service_role.
  function jwtRole(key) {
    try {
      var part = key.split(".")[1];
      if (!part) return "";
      var json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(json).role || "";
    } catch (e) { return ""; }
  }

  // Devuelve un problema de configuración, o "" si está todo bien.
  function configProblem(cfg) {
    if (!cfg.url || cfg.url.indexOf("PEGAR_ACA") !== -1 || !cfg.key || cfg.key.indexOf("PEGAR_ACA") !== -1) {
      return "missing";
    }
    if (!/^https:\/\/[^\s/]+$/i.test(cfg.url)) {
      return "bad-url";
    }
    // Protección: nunca usar claves secretas en una web pública.
    if (/^sb_secret_/i.test(cfg.key) || jwtRole(cfg.key) === "service_role") {
      return "secret-key";
    }
    return "";
  }

  var MESSAGES = {
    "missing": "El guardado todavía no está activado: faltan los datos de Supabase en config.js.",
    "bad-url": "La dirección de Supabase en config.js no parece correcta. Revisá que empiece con https://",
    "secret-key": "Por seguridad no guardamos nada: en config.js hay una clave secreta. Usá la clave pública (publishable o anon).",
    "offline": "No pudimos guardar tu pedido: parece que no hay conexión a internet. Probá de nuevo en un rato.",
    "timeout": "No pudimos guardar tu pedido: Supabase tardó demasiado en responder. Probá de nuevo.",
    "network": "No pudimos conectarnos con la base de datos. Revisá la dirección de Supabase en config.js.",
    "permission": "No pudimos guardar tu pedido: falta darle permiso a la web para crear pedidos en Supabase.",
    "bad-key": "No pudimos guardar tu pedido: la clave de Supabase en config.js no es válida.",
    "no-table": "No pudimos guardar tu pedido: no encontramos la tabla event_requests en Supabase.",
    "bad-data": "No pudimos guardar tu pedido: algún dato no coincide con las columnas de la tabla.",
    "server": "No pudimos guardar tu pedido: Supabase tuvo un problema. Probá de nuevo en un rato."
  };

  function post(cfg, row) {
    var headers = {
      "apikey": cfg.key,
      "Content-Type": "application/json",
      // "minimal": no pedimos que nos devuelva la fila, así la web no necesita permiso de lectura.
      "Prefer": "return=minimal"
    };
    // Las claves viejas (anon, eyJ...) también van como Authorization. Las nuevas (sb_publishable_) no hace falta.
    if (/^eyJ/.test(cfg.key)) headers["Authorization"] = "Bearer " + cfg.key;

    var controller = "AbortController" in window ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;

    return fetch(cfg.url + "/rest/v1/" + TABLE, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(row),
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      clearTimeout(timer);
      if (res.ok) return { ok: true };
      return res.text().then(function (text) {
        var info = {};
        try { info = JSON.parse(text) || {}; } catch (e) { info = { message: text }; }
        return { ok: false, status: res.status, code: info.code || "", detail: info.message || text || "" };
      });
    }, function (err) {
      clearTimeout(timer);
      return { ok: false, status: 0, code: err && err.name === "AbortError" ? "timeout" : "network", detail: String(err) };
    });
  }

  function classify(r) {
    if (r.code === "timeout") return "timeout";
    if (r.status === 0) return navigator.onLine === false ? "offline" : "network";
    if (r.code === "42501" || r.status === 403) return "permission";
    if (r.status === 401) return /row-level security|permission/i.test(r.detail) ? "permission" : "bad-key";
    if (r.code === "42P01" || r.code === "PGRST205" || r.status === 404) return "no-table";
    if (r.status === 400 || r.status === 409 || r.status === 422) return "bad-data";
    return "server";
  }

  // Si la columna "needs" es de texto (y no una lista), reintentamos con las necesidades separadas por coma.
  function looksLikeNeedsFormatError(r) {
    return r.status === 400 && /needs|array|malformed|json/i.test(r.detail + " " + r.code);
  }

  function saveEventRequest(row) {
    var cfg = readConfig();
    var problem = configProblem(cfg);
    if (problem) {
      if (window.console) console.warn("[LISTO] Supabase:", MESSAGES[problem]);
      return Promise.resolve({ ok: false, reason: problem, message: MESSAGES[problem] });
    }

    return post(cfg, row).then(function (r) {
      if (!r.ok && Array.isArray(row.needs) && looksLikeNeedsFormatError(r)) {
        var retry = {};
        Object.keys(row).forEach(function (k) { retry[k] = row[k]; });
        retry.needs = row.needs.join(", ");
        return post(cfg, retry);
      }
      return r;
    }).then(function (r) {
      // Si la base todavía no tuviera la columna de restricciones, el pedido se guarda igual (sin ellas).
      if (!r.ok && "dietary_requirements" in row && (r.code === "PGRST204" || r.code === "42703") && /dietary_requirements/.test(r.detail)) {
        var plain = {};
        Object.keys(row).forEach(function (k) { if (k !== "dietary_requirements") plain[k] = row[k]; });
        return post(cfg, plain);
      }
      return r;
    }).then(function (r) {
      if (r.ok) return { ok: true };
      var reason = classify(r);
      if (window.console) console.error("[LISTO] Supabase no guardó el pedido (" + (r.status || "sin respuesta") + " " + r.code + "):", r.detail);
      return { ok: false, reason: reason, message: MESSAGES[reason] };
    });
  }

  window.ListoDB = {
    saveEventRequest: saveEventRequest,
    isConfigured: function () { return !configProblem(readConfig()); }
  };
})();
