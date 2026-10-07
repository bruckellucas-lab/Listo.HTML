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
var rateLimit = require("./_lib/rate-limit");

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

  // Límite por visitante (persistente en Supabase; si Supabase no responde, en memoria:
  // la búsqueda nunca se cae por esto).
  if (!(await rateLimit.guard(req, res, "plan_options", { limitMessage: "Hiciste muchas búsquedas seguidas. Esperá unos minutos y probá de nuevo." }))) return;

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
  // Sin PHOTO_SIGNING_SECRET las opciones salen igual, sin foto (placeholder de LISTO).
  var secret = photos.signingSecret();
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

  // Sin caché (políticas de Google Maps Platform): la respuesta trae contenido de Google
  // y nombres de fotos, que no se pueden cachear. Cada búsqueda se pide en el momento.
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  res.end(JSON.stringify({ ok: true, category: category, zone: zone, options: options, providers_saved: saved }));
};
