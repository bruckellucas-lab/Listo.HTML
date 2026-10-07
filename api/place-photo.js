/* =========================================================
   LISTO — Función serverless de Vercel
   Ruta: /api/place-photo?name=...&w=480&exp=...&sig=...

   Entrega UNA foto de Google Places sin exponer la clave:
   - sólo acepta links firmados por LISTO (vencen en 1 hora),
   - le pide a Google la URL temporal de la foto,
   - redirige el navegador a esa imagen.
   Cada foto mostrada = 1 consulta "Place Details Photos" en Google.
   ========================================================= */
"use strict";

var http = require("./_lib/http");
var photos = require("./_lib/photos");

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return http.sendJson(res, 405, { ok: false, error: "Método no permitido." });
  }

  var q = http.queryOf(req);
  var problem = photos.verify(photos.signingSecret(), q.name, q.w, q.exp, q.sig);
  if (problem) {
    var status = problem === "sin-secreto" ? 503 : problem === "vencido" ? 410 : 403;
    return http.sendJson(res, status, { ok: false, error: "Link de foto no válido (" + problem + ")." });
  }

  var apiKey = http.env("GOOGLE_PLACES_API_KEY");
  if (!apiKey) return http.sendJson(res, 503, { ok: false, error: "Falta GOOGLE_PLACES_API_KEY en Vercel." });

  try {
    var photoUri = await photos.fetchPhotoUri(apiKey, q.name, parseInt(q.w, 10));
    res.statusCode = 302;
    res.setHeader("Location", photoUri);
    // Sin caché: el link firmado lleva el nombre de la foto, que no se puede cachear.
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Robots-Tag", "noindex");
    return res.end();
  } catch (err) {
    console.error("[place-photo] Google:", err.status, err.message);
    var why = err.status === 403 || err.status === 401
      ? "Google rechazó la clave para fotos: revisá que Places API (New) esté habilitada y permitida en la clave."
      : err.status === 429 ? "Se alcanzó la cuota diaria de fotos en Google."
      : err.status === 404 ? "Google ya no tiene esta foto."
      : "Google no devolvió la foto (" + (err.status || "sin respuesta") + ").";
    return http.sendJson(res, err.status === 404 ? 404 : 502, { ok: false, error: why });
  }
};
