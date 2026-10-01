/* =========================================================
   LISTO — Fotos de Google Places (servidor)

   Cómo funciona, sin exponer la clave de Google:
   1) Google nos da "referencias" de fotos (places/ID/photos/REF)
      junto con la búsqueda o el detalle del lugar.
   2) Por cada referencia armamos un link propio y FIRMADO:
        /api/place-photo?name=...&w=480&exp=...&sig=...
      La firma impide que otros usen ese link para gastar cuota,
      y vence en 1 hora.
   3) Cuando el navegador pide ese link, el servidor le pide la
      foto a Google y lo redirige a la imagen (una URL temporal
      de Google que NO contiene la clave).

   No se guarda nada de esto en Supabase: sólo el google_place_id.
   ========================================================= */
"use strict";

var crypto = require("crypto");

var MEDIA_BASE = "https://places.googleapis.com/v1/";
var DETAILS_BASE = "https://places.googleapis.com/v1/places/";
var ALLOWED_WIDTHS = [320, 480, 800, 1200, 1600];
var LINK_TTL_SECONDS = 60 * 60;           // los links firmados duran 1 hora
var MAX_PHOTOS_PER_PLACE = 6;             // tope para la galería del detalle
var NAME_RE = /^places\/[A-Za-z0-9_-]{10,300}\/photos\/[A-Za-z0-9_-]{10,1000}$/;
var PLACE_ID_RE = /^[A-Za-z0-9_-]{10,300}$/;

function signingKey(secret) {
  return "listo-photo:" + secret;
}

function signature(secret, name, w, exp) {
  return crypto.createHmac("sha256", signingKey(secret))
    .update(name + "|" + w + "|" + exp)
    .digest("base64url");
}

function normalizeWidth(w) {
  var n = parseInt(w, 10) || 480;
  // Redondea al tamaño permitido más cercano hacia arriba (evita pedidos raros).
  for (var i = 0; i < ALLOWED_WIDTHS.length; i++) if (n <= ALLOWED_WIDTHS[i]) return ALLOWED_WIDTHS[i];
  return ALLOWED_WIDTHS[ALLOWED_WIDTHS.length - 1];
}

function signedSrc(secret, name, w, nowSec) {
  var width = normalizeWidth(w);
  var exp = (nowSec || Math.floor(Date.now() / 1000)) + LINK_TTL_SECONDS;
  return "/api/place-photo?name=" + encodeURIComponent(name) +
    "&w=" + width + "&exp=" + exp + "&sig=" + signature(secret, name, width, exp);
}

// Verifica un link firmado. Devuelve "" si está bien o el motivo del rechazo.
function verify(secret, name, w, exp, sig, nowSec) {
  if (!secret) return "sin-secreto";
  if (!NAME_RE.test(String(name || ""))) return "nombre-invalido";
  if (ALLOWED_WIDTHS.indexOf(parseInt(w, 10)) === -1) return "ancho-invalido";
  var e = parseInt(exp, 10);
  var now = nowSec || Math.floor(Date.now() / 1000);
  if (!e || e < now) return "vencido";
  if (e > now + LINK_TTL_SECONDS + 60) return "vencimiento-invalido";
  var expected = Buffer.from(signature(secret, name, parseInt(w, 10), e));
  var given = Buffer.from(String(sig || ""));
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return "firma-invalida";
  return "";
}

// Atribuciones que Google exige mostrar junto a cada foto.
function attributionsOf(photo) {
  return (Array.isArray(photo.authorAttributions) ? photo.authorAttributions : [])
    .filter(function (a) { return a && a.displayName; })
    .map(function (a) {
      var uri = typeof a.uri === "string" && /^https:\/\//.test(a.uri) ? a.uri : null;
      return { name: a.displayName, uri: uri };
    });
}

// Convierte las fotos de un lugar de Google en fotos listas para mostrar (con links firmados).
function photosForPlace(place, secret, opts) {
  opts = opts || {};
  var max = Math.min(MAX_PHOTOS_PER_PLACE, opts.max || MAX_PHOTOS_PER_PLACE);
  var list = place && Array.isArray(place.photos) ? place.photos : [];
  var now = Math.floor(Date.now() / 1000);
  return list.filter(function (p) { return p && NAME_RE.test(String(p.name || "")); })
    .slice(0, max)
    .map(function (p) {
      return {
        thumb: signedSrc(secret, p.name, 480, now),
        large: signedSrc(secret, p.name, 1200, now),
        width: typeof p.widthPx === "number" ? p.widthPx : null,
        height: typeof p.heightPx === "number" ? p.heightPx : null,
        attributions: attributionsOf(p)
      };
    });
}

// Pide a Google la URL temporal de la foto (sin redirigir, para no exponer nada).
function fetchPhotoUri(apiKey, name, width, fetchImpl) {
  var doFetch = fetchImpl || fetch;
  var url = MEDIA_BASE + name + "/media?maxWidthPx=" + width + "&skipHttpRedirect=true";
  return doFetch(url, { method: "GET", headers: { "X-Goog-Api-Key": apiKey } }).then(function (res) {
    return res.text().then(function (text) {
      var data = {};
      try { data = text ? JSON.parse(text) : {}; } catch (e) { data = {}; }
      if (!res.ok) {
        var err = new Error((data.error && data.error.message) || ("Google respondió " + res.status));
        err.status = res.status;
        throw err;
      }
      if (typeof data.photoUri !== "string" || !/^https:\/\//.test(data.photoUri)) {
        var bad = new Error("Google no devolvió una foto válida.");
        bad.status = 502;
        throw bad;
      }
      return data.photoUri;
    });
  });
}

// Detalle de un lugar guardado: pide SÓLO el campo "photos" (lo mínimo para la galería).
function fetchPlacePhotos(apiKey, placeId, fetchImpl) {
  var doFetch = fetchImpl || fetch;
  return doFetch(DETAILS_BASE + encodeURIComponent(placeId) + "?languageCode=es", {
    method: "GET",
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "photos" }
  }).then(function (res) {
    return res.text().then(function (text) {
      var data = {};
      try { data = text ? JSON.parse(text) : {}; } catch (e) { data = {}; }
      if (!res.ok) {
        var err = new Error((data.error && data.error.message) || ("Google respondió " + res.status));
        err.status = res.status;
        throw err;
      }
      return data;
    });
  });
}

module.exports = {
  ALLOWED_WIDTHS: ALLOWED_WIDTHS,
  LINK_TTL_SECONDS: LINK_TTL_SECONDS,
  MAX_PHOTOS_PER_PLACE: MAX_PHOTOS_PER_PLACE,
  PLACE_ID_RE: PLACE_ID_RE,
  signedSrc: signedSrc,
  verify: verify,
  photosForPlace: photosForPlace,
  fetchPhotoUri: fetchPhotoUri,
  fetchPlacePhotos: fetchPlacePhotos
};
