/* =========================================================
   LISTO — Datos de un lugar en tiempo real (Google Places, Place Details New)
   Corre SOLO en el servidor (la clave de Google nunca sale de Vercel).

   Políticas de Google Maps Platform: nombre, dirección, rating, web, link de
   Maps, zona, categoría y coordenadas NO se guardan en Supabase. Lo único que
   se guarda es el google_place_id. Cuando hay que MOSTRAR o ENVIAR datos de un
   lugar (propuesta, emails, detalle en /admin), se piden acá, en el momento,
   y se usan sólo para esa respuesta.

   - Se piden únicamente los campos necesarios para cada caso (menos campos =
     menos costo).
   - Si Google falla o tarda, devuelve { ok: false } con un link a Maps armado
     desde el place_id: nunca se inventa un dato.
   ========================================================= */
"use strict";

var DETAILS_BASE = "https://places.googleapis.com/v1/places/";
var PLACE_ID_RE = /^[A-Za-z0-9_-]{10,500}$/;
var TIMEOUT_MS = 5000;

// Campos por caso de uso.
var FIELDS = {
  email: "displayName,formattedAddress,googleMapsUri",
  proposal: "displayName,formattedAddress,googleMapsUri,primaryTypeDisplayName,photos",
  admin: "displayName,formattedAddress,googleMapsUri,primaryTypeDisplayName,websiteUri,rating,userRatingCount,businessStatus"
};

var UNAVAILABLE = "Datos del lugar no disponibles en este momento.";

function https(u) { return typeof u === "string" && /^https:\/\//.test(u) ? u : null; }
function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }
function text(v) { return v && typeof v.text === "string" && v.text ? v.text : null; }

// Link a Google Maps armado sólo con el place_id (formato "Maps URLs" de Google),
// para cuando no hay datos en tiempo real. No contiene contenido de Google.
function mapsLinkFor(placeId) {
  if (!PLACE_ID_RE.test(String(placeId || ""))) return null;
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(placeId) +
    "&query_place_id=" + encodeURIComponent(placeId);
}

// Lo que se puede mostrar de un lugar (sin datos inventados: lo que Google no informa queda null).
function toPlace(placeId, data) {
  return {
    ok: true,
    google_place_id: placeId,
    name: text(data.displayName),
    address: data.formattedAddress || null,
    category: text(data.primaryTypeDisplayName),
    maps_url: https(data.googleMapsUri) || mapsLinkFor(placeId),
    website: https(data.websiteUri),
    rating: num(data.rating),
    review_count: num(data.userRatingCount),
    business_status: data.businessStatus || null
  };
}

function unavailable(placeId) {
  return {
    ok: false, google_place_id: placeId || null, name: null, address: null, category: null,
    maps_url: mapsLinkFor(placeId), website: null, rating: null, review_count: null, business_status: null,
    message: UNAVAILABLE
  };
}

// Pide a Google los campos del caso ("email", "proposal" o "admin").
// Nunca lanza: si algo falla devuelve unavailable(placeId). raw = respuesta de Google (sólo en memoria).
function fetchPlace(placeId, use, opts) {
  opts = opts || {};
  var id = String(placeId || "");
  var apiKey = opts.apiKey !== undefined ? opts.apiKey : String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
  var fields = FIELDS[use];
  if (!PLACE_ID_RE.test(id) || !apiKey || !fields) return Promise.resolve(unavailable(PLACE_ID_RE.test(id) ? id : null));

  var doFetch = opts.fetch || fetch;
  var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  var timer = controller ? setTimeout(function () { controller.abort(); }, opts.timeoutMs || TIMEOUT_MS) : null;
  return Promise.resolve().then(function () {
    return doFetch(DETAILS_BASE + encodeURIComponent(id) + "?languageCode=es&regionCode=AR", {
      method: "GET",
      headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": fields },
      signal: controller ? controller.signal : undefined
    });
  }).then(function (res) {
    return res.text().then(function (body) {
      var data = {};
      try { data = body ? JSON.parse(body) : {}; } catch (e) { data = {}; }
      if (!res.ok) {
        var err = new Error("Google respondió " + res.status);
        err.status = res.status;
        throw err;
      }
      var out = toPlace(id, data || {});
      Object.defineProperty(out, "raw", { value: data || {}, enumerable: false });   // no viaja en JSON
      return out;
    });
  }).catch(function (err) {
    console.error("[place-details] " + use + ":", err && err.name === "AbortError" ? "tiempo de espera agotado" : (err && (err.status || err.message)));
    return unavailable(id);
  }).then(function (out) { clearTimeout(timer); return out; });
}

module.exports = {
  FIELDS: FIELDS, TIMEOUT_MS: TIMEOUT_MS, UNAVAILABLE: UNAVAILABLE, PLACE_ID_RE: PLACE_ID_RE,
  mapsLinkFor: mapsLinkFor, fetchPlace: fetchPlace, unavailable: unavailable
};
