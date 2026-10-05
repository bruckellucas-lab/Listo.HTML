/* =========================================================
   LISTO — Función serverless de Vercel (PANEL INTERNO)
   Ruta: /api/admin-providers
   GET    → proveedores guardados (tabla providers) con sus atributos alimentarios
   POST   { provider_google_place_id, attribute, status, source_type, source_url,
            certifier, kosher_category, verification_notes, verified_at,
            review_after, evidence_valid_until }
          → crea o actualiza (una sola fila por proveedor + atributo)
   DELETE { provider_google_place_id, attribute } → borra un atributo cargado por error

   Sólo con el pase de /admin. Nada de esto se muestra en la web pública.
   Google NUNCA verifica: una señal de Google, reseñas o nombre queda como "No verificado".
   ========================================================= */
"use strict";

var http = require("./_lib/http");
var auth = require("./_lib/admin-auth");
var store = require("./_lib/providers-store");
var dietary = require("./_lib/dietary");

var LIMIT = 1000;
var PROVIDER_FIELDS = "google_place_id,name,category,address,zone,rating,review_count,maps_url,website,provider_status";
var MISSING = ["PGRST200", "PGRST201", "PGRST204", "PGRST205", "42703", "42P01"];

function https(u) { return typeof u === "string" && /^https:\/\//.test(u) ? u : null; }

function explain(err) {
  if (err.code === "PGRST205" || err.code === "42P01") return "Falta la tabla provider_dietary_attributes en Supabase.";
  if (err.code === "23503") return "No encontramos ese proveedor.";
  if (err.code === "23514") return "Supabase rechazó algún dato (fuente, certificador o fechas). Revisá el formulario.";
  if (err.code === "23505") return "Ese atributo ya estaba cargado. Actualizá el panel y probá de nuevo.";
  return "No pudimos hablar con Supabase. Probá de nuevo.";
}

function toProvider(row, today) {
  return {
    google_place_id: row.google_place_id,
    name: row.name || null,
    category: row.category || null,
    address: row.address || null,
    zone: row.zone || null,
    rating: typeof row.rating === "number" ? row.rating : null,
    review_count: typeof row.review_count === "number" ? row.review_count : null,
    maps_url: https(row.maps_url),
    website: https(row.website),
    provider_status: row.provider_status || null,
    attributes: (Array.isArray(row.provider_dietary_attributes) ? row.provider_dietary_attributes : [])
      .map(function (a) { return dietary.withEffective(a, today); })
  };
}

module.exports = async function handler(req, res) {
  if (!auth.isAuthenticated(req)) {
    return http.sendJson(res, 401, { ok: false, error: "Tu sesión no es válida o venció. Volvé a ingresar." });
  }
  if (["GET", "POST", "DELETE"].indexOf(req.method) === -1) {
    res.setHeader("Allow", "GET, POST, DELETE");
    return http.sendJson(res, 405, { ok: false, error: "Método no permitido." });
  }
  var url = http.env("SUPABASE_URL"), key = http.env("SUPABASE_SECRET_KEY");
  if (!url || !key || /^sb_publishable_/.test(key)) return http.sendJson(res, 503, { ok: false, error: "Falta configurar Supabase en Vercel." });
  var base = store.normalizeUrl(url) + "/rest/v1/";
  var call = function (path, method, step, payload, prefer) {
    var opts = { method: method, headers: store.headersFor(key, prefer ? { "Prefer": prefer } : undefined) };
    if (payload) opts.body = JSON.stringify(payload);
    return store.request(fetch, base + path, opts, step);
  };
  var today = dietary.todayAR();

  if (req.method === "GET") {
    try {
      var rows, ready = true;
      try {
        rows = await call("providers?select=" + encodeURIComponent(PROVIDER_FIELDS +
          ",provider_dietary_attributes!provider_dietary_provider_fkey(" + dietary.FIELDS + ")") +
          "&order=name.asc&limit=" + LIMIT, "GET", "listar proveedores");
      } catch (err) {
        // Si la tabla de atributos no estuviera, igual se ven los proveedores.
        if (MISSING.indexOf(err.code) === -1) throw err;
        console.error("[admin-providers] sin atributos:", err.code);
        ready = false;
        rows = await call("providers?select=" + PROVIDER_FIELDS + "&order=name.asc&limit=" + LIMIT, "GET", "listar proveedores");
      }
      var providers = (rows || []).map(function (r) { return toProvider(r, today); });
      return http.sendJson(res, 200, {
        ok: true, today: today, dietary_ready: ready, limit: LIMIT, count: providers.length, providers: providers,
        attributes: dietary.ATTRIBUTES
      });
    } catch (err) {
      console.error("[admin-providers] listar:", err.status || "", err.code || "", err.message);
      return http.sendJson(res, 502, { ok: false, error: explain(err) });
    }
  }

  // Escrituras: además de la sesión, el encabezado del panel (protección extra contra otros sitios).
  if (req.headers["x-listo-admin"] !== "1") return http.sendJson(res, 403, { ok: false, error: "Pedido no permitido." });
  var body = await http.readJson(req, 8000);
  if (!body || typeof body !== "object") return http.sendJson(res, 400, { ok: false, error: "No pudimos leer el pedido." });

  if (req.method === "DELETE") {
    var placeId = String(body.provider_google_place_id || ""), attribute = String(body.attribute || "");
    if (!dietary.PLACE_ID_RE.test(placeId) || dietary.CODES.indexOf(attribute) === -1) {
      return http.sendJson(res, 400, { ok: false, error: "Atributo no válido." });
    }
    try {
      var gone = await call("provider_dietary_attributes?provider_google_place_id=eq." + encodeURIComponent(placeId) +
        "&attribute=eq." + attribute + "&select=id", "DELETE", "borrar atributo", null, "return=representation");
      if (!gone || !gone.length) return http.sendJson(res, 404, { ok: false, error: "Ese atributo no estaba cargado." });
      return http.sendJson(res, 200, { ok: true, deleted: true });
    } catch (err) {
      console.error("[admin-providers] borrar:", err.status || "", err.code || "", err.message);
      return http.sendJson(res, 502, { ok: false, error: explain(err) });
    }
  }

  // POST: crear o actualizar (nunca duplica: una fila por proveedor + atributo).
  var checked = dietary.validate(body, today);
  if (checked.error) return http.sendJson(res, 400, { ok: false, error: checked.error });
  var d = checked.data;
  try {
    var found = await call("providers?select=google_place_id&google_place_id=eq." + encodeURIComponent(d.provider_google_place_id), "GET", "buscar proveedor");
    if (!found || !found[0]) return http.sendJson(res, 404, { ok: false, error: "No encontramos ese proveedor." });
    d.updated_at = new Date().toISOString();
    var saved = await call("provider_dietary_attributes?on_conflict=provider_google_place_id,attribute&select=" + dietary.FIELDS, "POST",
      "guardar atributo", d, "resolution=merge-duplicates,return=representation");
    var row = saved && saved[0];
    return http.sendJson(res, 200, { ok: true, attribute: row ? dietary.withEffective(row, today) : null });
  } catch (err) {
    console.error("[admin-providers] guardar:", err.status || "", err.code || "", err.message);
    return http.sendJson(res, 502, { ok: false, error: explain(err) });
  }
};
