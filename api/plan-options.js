/* =========================================================
   LISTO — Función serverless de Vercel
   Ruta: /api/plan-options?category=restaurantes&zone=Palermo

   La usa la web principal para mostrar 3 lugares reales.
   - Sólo acepta categorías de una lista cerrada (no búsquedas libres).
   - Llama a Google Places (New) desde el servidor: la clave nunca sale de acá.
   - Guarda/actualiza los lugares en "providers" sin duplicar (google_place_id).
   - Devuelve fotos con links firmados (no guarda URLs temporales).
   - Nunca inventa datos: si Google no informa algo, queda vacío.
   ========================================================= */
"use strict";

var http = require("./_lib/http");
var places = require("./_lib/google-places");
var store = require("./_lib/providers-store");
var photos = require("./_lib/photos");
var plan = require("./_lib/plan");

// Límite simple por visitante (por instancia del servidor): evita ráfagas que gasten cuota.
var WINDOW_MS = 10 * 60 * 1000;
var MAX_PER_WINDOW = 30;
var hits = {};

function rateLimited(req) {
  var ip = String(req.headers["x-forwarded-for"] || req.socket && req.socket.remoteAddress || "?").split(",")[0].trim();
  var now = Date.now();
  var list = (hits[ip] || []).filter(function (t) { return now - t < WINDOW_MS; });
  list.push(now);
  hits[ip] = list;
  if (Object.keys(hits).length > 5000) hits = {};
  return list.length > MAX_PER_WINDOW;
}

function sendError(res, status, message) {
  return http.sendJson(res, status, { ok: false, error: message });
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendError(res, 405, "Método no permitido.");
  }

  var q = http.queryOf(req);
  var category = String(q.category || "");
  if (!plan.CATEGORIES[category]) return sendError(res, 400, "Tipo de lugar no válido.");
  var zone = plan.cleanZone(q.zone);

  if (rateLimited(req)) {
    return sendError(res, 429, "Hiciste muchas búsquedas seguidas. Esperá unos minutos y probá de nuevo.");
  }

  var apiKey = http.env("GOOGLE_PLACES_API_KEY");
  if (!apiKey) return sendError(res, 503, "LISTO no puede buscar lugares en este momento. Probá de nuevo más tarde.");

  // 1) Google Places: 20 resultados cuestan lo mismo que 3, y dan margen para elegir bien.
  var found;
  try {
    found = await places.searchText(apiKey, plan.buildQuery(category, zone), places.MAX_RESULTS);
  } catch (err) {
    console.error("[plan-options] Google:", err.status, err.message);
    return sendError(res, 502, err.status === 429
      ? "Estamos recibiendo muchas búsquedas. Probá de nuevo en un rato."
      : "No pudimos consultar los lugares en este momento. Probá de nuevo.");
  }

  var converted = places.toProviderRows(found, new Date().toISOString());
  var statusById = {}, placeById = {};
  found.forEach(function (p) {
    if (p && p.id && !placeById[p.id]) { placeById[p.id] = p; statusById[p.id] = p.businessStatus; }
  });

  // 2) Guardar/actualizar en providers (si falla, igual mostramos las opciones).
  var saved = false;
  var supaUrl = http.env("SUPABASE_URL"), supaKey = http.env("SUPABASE_SECRET_KEY");
  if (supaUrl && supaKey && !/^sb_publishable_/.test(supaKey) && converted.rows.length) {
    try {
      await store.saveProviders({ url: supaUrl, key: supaKey }, converted.rows);
      saved = true;
    } catch (err) {
      console.error("[plan-options] Supabase:", err.step, err.status, err.code, err.message);
    }
  }

  // 3) Elegir 3 y armar lo que ve el usuario (sólo datos informados por Google).
  var secret = http.env("LISTO_ADMIN_TOKEN");
  var options = plan.pickOptions(converted.rows, zone, statusById, 3).map(function (row) {
    var photo = secret ? photos.photosForPlace(placeById[row.google_place_id], secret, { max: 1 })[0] || null : null;
    return {
      google_place_id: row.google_place_id,
      name: row.name,
      category: row.category,
      zone: row.zone,
      address_short: plan.shortAddress(row.address),
      rating: row.rating,
      review_count: row.review_count,
      website: row.website,
      maps_url: row.maps_url,
      photo: photo
    };
  });

  // Caché corta en Vercel: la misma búsqueda en los próximos minutos no vuelve a pagar Google.
  // (Menor a la hora de vida de los links firmados de las fotos.)
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=600");
  res.setHeader("X-Robots-Tag", "noindex");
  res.end(JSON.stringify({ ok: true, category: category, zone: zone, options: options, providers_saved: saved }));
};
