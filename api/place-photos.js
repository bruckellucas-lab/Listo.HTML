/* =========================================================
   LISTO — Función serverless de Vercel
   Ruta: /api/place-photos?place_id=ChIJ...

   Para el futuro "detalle de proveedor": a partir del
   google_place_id guardado en Supabase, pide a Google las
   fotos ACTUALES del lugar y devuelve links firmados
   (hasta 6), con sus atribuciones.
   Costo: 1 consulta de detalle (sólo el campo "photos").
   Las fotos en sí se cobran recién cuando se muestran.

   Por ahora requiere el encabezado x-listo-token (sólo pruebas).
   ========================================================= */
"use strict";

var http = require("./_lib/http");
var photos = require("./_lib/photos");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return http.sendJson(res, 405, { ok: false, error: "Método no permitido." });
  }
  if (http.env("LISTO_ADMIN_TOKEN").length < 12) {
    return http.sendJson(res, 503, { ok: false, error: "Falta configurar LISTO_ADMIN_TOKEN en Vercel." });
  }
  if (!http.tokenOk(req.headers["x-listo-token"])) {
    return http.sendJson(res, 401, { ok: false, error: "Contraseña de prueba incorrecta." });
  }

  var placeId = String(http.queryOf(req).place_id || "").trim();
  if (!photos.PLACE_ID_RE.test(placeId)) {
    return http.sendJson(res, 400, { ok: false, error: "Pegá un google_place_id válido (por ejemplo, uno de la tabla providers)." });
  }

  var apiKey = http.env("GOOGLE_PLACES_API_KEY");
  if (!apiKey) return http.sendJson(res, 503, { ok: false, error: "Falta GOOGLE_PLACES_API_KEY en Vercel." });

  try {
    var place = await photos.fetchPlacePhotos(apiKey, placeId);
    var list = photos.photosForPlace(place, http.env("LISTO_ADMIN_TOKEN"));
    return http.sendJson(res, 200, { ok: true, google_place_id: placeId, count: list.length, photos: list });
  } catch (err) {
    console.error("[place-photos] Google:", err.status, err.message);
    var msg = err.status === 404 || err.status === 400
      ? "Google no encontró ese lugar. Revisá el google_place_id."
      : "Google no respondió bien (" + (err.status || "sin respuesta") + "): " + err.message;
    return http.sendJson(res, err.status === 404 || err.status === 400 ? 404 : 502, { ok: false, error: msg });
  }
};
