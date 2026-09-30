/* =========================================================
   LISTO — Función serverless de Vercel
   Ruta: /api/places-search

   GET  → dice qué configuración falta (sin mostrar ninguna clave).
   POST → busca en Google Places y, si se pide, guarda en providers.
          Cuerpo: { "query": "restaurantes en Palermo", "limit": 10, "save": false }
          Requiere el encabezado  x-listo-token  con la contraseña de prueba.

   Variables de entorno (se cargan en Vercel, nunca en el código):
     GOOGLE_PLACES_API_KEY   clave de Google (Places API New)
     SUPABASE_URL            Project URL de Supabase
     SUPABASE_SECRET_KEY     clave secreta de Supabase (sb_secret_... o service_role)
     LISTO_ADMIN_TOKEN       contraseña para usar esta función (la elegís vos)
   ========================================================= */
"use strict";

var crypto = require("crypto");
var places = require("./_lib/google-places");
var store = require("./_lib/providers-store");

function env(name) { return String(process.env[name] || "").trim(); }

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  res.end(JSON.stringify(payload));
}

function configStatus() {
  var supaKey = env("SUPABASE_SECRET_KEY");
  return {
    GOOGLE_PLACES_API_KEY: !!env("GOOGLE_PLACES_API_KEY"),
    SUPABASE_URL: !!env("SUPABASE_URL"),
    SUPABASE_SECRET_KEY: !!supaKey,
    SUPABASE_SECRET_KEY_es_secreta: supaKey ? !/^sb_publishable_/.test(supaKey) : null,
    LISTO_ADMIN_TOKEN: env("LISTO_ADMIN_TOKEN").length >= 12
  };
}

// Compara la contraseña sin filtrar pistas por el tiempo de respuesta.
function tokenOk(given) {
  var expected = env("LISTO_ADMIN_TOKEN");
  if (expected.length < 12 || typeof given !== "string") return false;
  var a = crypto.createHash("sha256").update(given).digest();
  var b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") {
    try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve(null); }
  }
  return new Promise(function (resolve) {
    var raw = "";
    req.on("data", function (chunk) { raw += chunk; if (raw.length > 10000) req.destroy(); });
    req.on("end", function () { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { resolve(null); } });
    req.on("error", function () { resolve(null); });
  });
}

function explainGoogleError(err) {
  var s = err.status;
  if (s === 400) return "Google no aceptó la búsqueda: " + err.message;
  if (s === 401 || s === 403) return "Google rechazó la clave. Revisá que la API \"Places API (New)\" esté activada, que la facturación esté habilitada y que la clave permita esa API. Detalle: " + err.message;
  if (s === 429) return "Se alcanzó el límite de búsquedas de Google (cuota). Probá más tarde o revisá las cuotas en Google Cloud.";
  return "Google Places no respondió bien (" + (s || "sin respuesta") + "): " + err.message;
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    var cfg = configStatus();
    var ready = cfg.GOOGLE_PLACES_API_KEY && cfg.SUPABASE_URL && cfg.SUPABASE_SECRET_KEY &&
      cfg.SUPABASE_SECRET_KEY_es_secreta && cfg.LISTO_ADMIN_TOKEN;
    return send(res, 200, { ok: true, ready: !!ready, config: cfg });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { ok: false, error: "Método no permitido." });
  }

  if (env("LISTO_ADMIN_TOKEN").length < 12) {
    return send(res, 503, { ok: false, error: "Falta configurar LISTO_ADMIN_TOKEN en Vercel (mínimo 12 caracteres). Hasta entonces la función está cerrada." });
  }
  if (!tokenOk(req.headers["x-listo-token"])) {
    return send(res, 401, { ok: false, error: "Contraseña de prueba incorrecta." });
  }

  var body = await readBody(req);
  if (!body) return send(res, 400, { ok: false, error: "El pedido no tiene un formato válido." });

  var query = String(body.query || "").replace(/\s+/g, " ").trim();
  if (query.length < 3 || query.length > 120) {
    return send(res, 400, { ok: false, error: "Escribí una búsqueda de entre 3 y 120 caracteres, por ejemplo: restaurantes en Palermo." });
  }
  var limit = Math.max(1, Math.min(places.MAX_RESULTS, parseInt(body.limit, 10) || 10));
  var save = body.save === true;

  var googleKey = env("GOOGLE_PLACES_API_KEY");
  if (!googleKey) return send(res, 503, { ok: false, error: "Falta configurar GOOGLE_PLACES_API_KEY en Vercel." });

  // 1) Google Places
  var found;
  try {
    found = await places.searchText(googleKey, query, limit);
  } catch (err) {
    console.error("[places-search] Google:", err.status, err.message);
    return send(res, 502, { ok: false, step: "google", error: explainGoogleError(err) });
  }

  var converted = places.toProviderRows(found, new Date().toISOString());
  var result = {
    ok: true,
    query: query,
    count: converted.rows.length,
    skipped_closed: converted.skippedClosed,
    results: converted.rows,
    saved: null
  };

  if (!save) return send(res, 200, result);

  // 2) Supabase
  var supaUrl = env("SUPABASE_URL");
  var supaKey = env("SUPABASE_SECRET_KEY");
  if (!supaUrl || !supaKey) {
    result.ok = false;
    result.step = "supabase";
    result.error = "La búsqueda funcionó, pero falta configurar SUPABASE_URL o SUPABASE_SECRET_KEY en Vercel para guardar.";
    return send(res, 503, result);
  }
  if (/^sb_publishable_/.test(supaKey)) {
    result.ok = false;
    result.step = "supabase";
    result.error = "SUPABASE_SECRET_KEY tiene la clave pública. Para guardar proveedores hace falta la clave secreta (sb_secret_...).";
    return send(res, 503, result);
  }

  try {
    result.saved = await store.saveProviders({ url: supaUrl, key: supaKey }, converted.rows);
    return send(res, 200, result);
  } catch (err) {
    console.error("[places-search] Supabase:", err.step, err.status, err.code, err.message);
    result.ok = false;
    result.step = "supabase";
    result.error = store.explainStoreError(err);
    return send(res, 502, result);
  }
};
