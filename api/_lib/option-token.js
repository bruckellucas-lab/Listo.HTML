/* =========================================================
   LISTO — Comprobante firmado de cada opción ("option_token")

   /api/plan-options entrega, junto con cada lugar, un comprobante:
     "<vencimiento>.<firma>"
   La firma es un HMAC del google_place_id + vencimiento, hecho con el secreto
   del servidor (PHOTO_SIGNING_SECRET, con una clave derivada SÓLO para esto:
   nunca sirve como firma de foto ni al revés).

   /api/plan-selection lo verifica: así sabe que la opción elegida salió de una
   búsqueda real de LISTO, sin tener que guardar datos de Google en Supabase ni
   volver a llamar a Google. El navegador no puede fabricarlo ni cambiar el lugar.
   ========================================================= */
"use strict";

var crypto = require("crypto");
var photos = require("./photos");

var TTL_SECONDS = 24 * 60 * 60;   // vale 24 horas (las opciones viven sólo en memoria del navegador)
var TOKEN_RE = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/;

function key(secret) { return "listo-option:" + secret; }

function signature(secret, placeId, exp) {
  return crypto.createHmac("sha256", key(secret)).update(String(placeId) + "|" + exp).digest("base64url");
}

function sign(secret, placeId, nowSec) {
  if (!secret || !photos.PLACE_ID_RE.test(String(placeId || ""))) return null;
  var exp = (nowSec || Math.floor(Date.now() / 1000)) + TTL_SECONDS;
  return exp + "." + signature(secret, placeId, exp);
}

// Devuelve "" si el comprobante es válido para ese lugar, o el motivo del rechazo.
function verify(secret, placeId, token, nowSec) {
  if (!secret) return "sin-secreto";
  if (!photos.PLACE_ID_RE.test(String(placeId || ""))) return "lugar-invalido";
  var m = TOKEN_RE.exec(String(token || ""));
  if (!m) return "sin-comprobante";
  var exp = parseInt(m[1], 10);
  var now = nowSec || Math.floor(Date.now() / 1000);
  if (exp < now) return "vencido";
  if (exp > now + TTL_SECONDS + 60) return "vencimiento-invalido";
  var expected = Buffer.from(signature(secret, placeId, exp));
  var given = Buffer.from(m[2]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return "firma-invalida";
  return "";
}

module.exports = { TTL_SECONDS: TTL_SECONDS, sign: sign, verify: verify };
