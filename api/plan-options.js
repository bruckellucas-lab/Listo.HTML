/* =========================================================
   LISTO — Función serverless de Vercel
   Ruta: /api/plan-options?category=restaurantes&zone=Palermo

   La usa la web principal para mostrar hasta 3 lugares reales.
   - Sólo acepta perfiles o categorías de una lista cerrada (no búsquedas libres).
   - Llama a Google Places (New) desde el servidor: la clave nunca sale de acá.
   - Guarda en "providers" SÓLO la fila mínima (google_place_id + datos de LISTO),
     sin duplicar. Nombre, dirección, rating, etc. no se guardan (G1B).
   - Cada opción lleva un comprobante firmado (option_token) para poder elegirla.
   - Devuelve fotos con links firmados (no guarda URLs temporales).
   - Nunca inventa datos: si Google no informa algo, queda vacío.
   ========================================================= */
"use strict";
var log = require("./_lib/private-log");

var http = require("./_lib/http");
var places = require("./_lib/google-places");
var store = require("./_lib/providers-store");
var photos = require("./_lib/photos");
var optionToken = require("./_lib/option-token");
var plan = require("./_lib/plan");
var rateLimit = require("./_lib/rate-limit");
var cost = require("./_lib/cost-guard");

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
  var hasProfile = Object.prototype.hasOwnProperty.call(q, "profile");
  var profile = hasProfile && typeof q.profile === "string" ? q.profile : "";
  if (hasProfile ? !plan.PROFILES[profile] : !plan.CATEGORIES[category]) return sendError(res, 400, "Tipo de lugar no válido.");
  var safeZone = plan.profileZone(q.zone);
  var zone = safeZone;
  // Mantener mayúsculas de clientes viejos sin perder zonas con sufijo o alias normalizados.
  var legacyZone = !hasProfile ? plan.cleanZone(q.zone) : "";
  if (legacyZone && legacyZone.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === safeZone) zone = legacyZone;
  if (zone === null) return sendError(res, 400, "No reconocemos esa zona. Elegí un barrio o localidad reconocida.");
  var searchKey = (hasProfile ? profile : category) + "|" + safeZone;
  var query = hasProfile ? plan.buildProfileQuery(profile, zone) : plan.buildQuery(category, zone);

  // El límite por visitante conserva su fallback. Los presupuestos globales siguientes
  // fallan cerrado: sin contador persistente no se llama a Google.
  if (!(await rateLimit.guard(req, res, "plan_options", { limitMessage: "Hiciste muchas búsquedas seguidas. Esperá unos minutos y probá de nuevo." }))) return;
  if (!(await cost.guard(req, res, ["search_repeat", "search_all", "search_day"], { key: searchKey }))) return;

  var apiKey = http.env("GOOGLE_PLACES_API_KEY");
  if (!apiKey) return sendError(res, 503, "LISTO no puede buscar lugares en este momento. Probá de nuevo más tarde.");

  // 1) Google Places: 20 resultados cuestan lo mismo que 3, y dan margen para elegir bien.
  var found;
  try {
    found = await places.searchText(apiKey, query, places.MAX_RESULTS);
  } catch (err) {
    log.error("[plan-options] Google:", err);
    return sendError(res, 502, err.status === 429
      ? "Estamos recibiendo muchas búsquedas. Probá de nuevo en un rato."
      : "No pudimos consultar los lugares en este momento. Probá de nuevo.");
  }

  var converted = places.toProviderRows(found, new Date().toISOString());
  var statusById = {}, placeById = {};
  found.forEach(function (p) {
    if (p && p.id && !placeById[p.id]) { placeById[p.id] = p; statusById[p.id] = p.businessStatus; }
  });

  // 2) Fila mínima en providers (sólo google_place_id y datos de LISTO; si falla, igual mostramos las opciones).
  var saved = false;
  var supaUrl = http.env("SUPABASE_URL"), supaKey = http.env("SUPABASE_SECRET_KEY");
  if (supaUrl && supaKey && !/^sb_publishable_/.test(supaKey) && converted.rows.length) {
    try {
      await store.saveProviders({ url: supaUrl, key: supaKey }, converted.rows);
      saved = true;
    } catch (err) {
      log.error("[plan-options] Supabase:", err);
    }
  }

  // 3) Elegir hasta 3 adecuadas y armar lo que ve el usuario (sólo datos informados por Google).
  // Sin PHOTO_SIGNING_SECRET las opciones salen igual, sin foto (placeholder de LISTO).
  var secret = photos.signingSecret();
  var options = plan.pickAdequateOptions(converted.rows, zone, statusById, 3, { profile: hasProfile ? profile : plan.LEGACY_PROFILES[category], placesById: placeById, allowOutsideZone: hasProfile }).map(function (row) {
    var photo = secret ? photos.photosForPlace(placeById[row.google_place_id], secret, { max: 1 })[0] || null : null;
    var zoneNotice = plan.optionZoneNotice(row, zone);
    return {
      outside_zone: !!zoneNotice,
      zone_notice: zoneNotice,
      google_place_id: row.google_place_id,
      name: row.name,
      category: row.category,
      zone: row.zone,
      address_short: plan.shortAddress(row.address),
      rating: row.rating,
      review_count: row.review_count,
      website: row.website,
      maps_url: row.maps_url,
      photo: photo,
      // Comprobante para "Elegir esta opción" (sin secreto no hay comprobante: elegir falla cerrado).
      option_token: secret ? optionToken.sign(secret, row.google_place_id) : null
    };
  });

  // Sin caché (políticas de Google Maps Platform): la respuesta trae contenido de Google
  // y nombres de fotos, que no se pueden cachear. Cada búsqueda se pide en el momento.
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  res.end(JSON.stringify({ ok: true, category: category, profile: hasProfile ? profile : null, zone: zone, options: options, fallback: plan.optionsFeedback(options), providers_saved: saved }));
};
