/* Pruebas de la firma de fotos: sólo PHOTO_SIGNING_SECRET firma; LISTO_ADMIN_TOKEN ya no.
   Sin el secreto la búsqueda sigue funcionando (sin foto) y /api/place-photo rechaza. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var h = require("./helpers");

process.env.SUPABASE_URL = "https://ejemplo-de-prueba.supabase.co";
process.env.SUPABASE_SECRET_KEY = "clave-de-prueba-no-real";
process.env.GOOGLE_PLACES_API_KEY = "clave-google-de-prueba";
process.env.RATE_LIMIT_SECRET = "secreto-de-prueba-para-limites-1234567890";
process.env.LISTO_ADMIN_TOKEN = "token-viejo-que-ya-no-firma-fotos";
var PHOTO_SECRET = "secreto-de-fotos-de-prueba-0123456789abcdef";

var photos = require("../api/_lib/photos");
var planOptions = require("../api/plan-options");
var placePhoto = require("../api/place-photo");

var NAME = "places/ChIJabcdefghij1234/photos/AbCdEfGhIjKlMnOp";

function googlePlace(i) {
  return { id: "ChIJabcdefghij00" + i, displayName: { text: "Lugar " + i }, formattedAddress: "Calle " + i + ", Palermo",
    rating: 4.5, userRatingCount: 100 + i, businessStatus: "OPERATIONAL",
    photos: [{ name: "places/ChIJabcdefghij00" + i + "/photos/AbCdEfGhIjKlMnOp" + i, widthPx: 800, heightPx: 600, authorAttributions: [{ displayName: "Autor" }] }] };
}
function internet(opts) {
  opts = opts || {};
  return h.mockFetch([
    h.rpcRule(),
    { match: /places:searchText$/, reply: function () { return h.response(200, { places: [googlePlace(1), googlePlace(2), googlePlace(3)] }); } },
    { match: /\/rest\/v1\/providers/, reply: function () { return opts.supabaseDown ? h.response(500, { message: "caído" }) : h.response(200, []); } },
    { match: /\/media\?/, reply: function () { return h.response(200, { photoUri: "https://lh3.googleusercontent.com/foto" }); } }
  ]);
}
async function search() {
  var res = h.fakeRes();
  var req = h.fakeReq("GET", {});
  req.query = { category: "restaurantes", zone: "Palermo" };
  await planOptions(req, res);
  return res;
}
async function photoGet(query) {
  var res = h.fakeRes();
  var req = h.fakeReq("GET", {});
  req.query = query;
  await placePhoto(req, res);
  return res;
}
function linkQuery(src) {
  return Object.fromEntries(new URL(src, "http://x").searchParams);
}
function quietly(fn) {
  var orig = console.error; console.error = function () {};
  return Promise.resolve().then(fn).finally(function () { console.error = orig; });
}

test("signingSecret: sólo PHOTO_SIGNING_SECRET (32+ caracteres)", function () {
  delete process.env.PHOTO_SIGNING_SECRET;
  assert.equal(photos.signingSecret(), "", "LISTO_ADMIN_TOKEN no cuenta");
  process.env.PHOTO_SIGNING_SECRET = "corto";
  assert.equal(photos.signingSecret(), "");
  process.env.PHOTO_SIGNING_SECRET = PHOTO_SECRET;
  assert.equal(photos.signingSecret(), PHOTO_SECRET);
});

test("con PHOTO_SIGNING_SECRET: la búsqueda trae fotos firmadas que /api/place-photo acepta", async function () {
  process.env.PHOTO_SIGNING_SECRET = PHOTO_SECRET;
  global.fetch = internet();
  var res = await search();
  assert.equal(res.statusCode, 200);
  var data = res.json();
  assert.equal(data.options.length, 3);
  var src = data.options[0].photo.thumb;
  assert.match(src, /^\/api\/place-photo\?name=.*&sig=/);
  assert.equal(src.indexOf(PHOTO_SECRET), -1, "el secreto no viaja");
  assert.equal(res.body.indexOf(PHOTO_SECRET), -1);
  var out = await photoGet(linkQuery(src));
  assert.equal(out.statusCode, 302);
  assert.equal(out.headers.location, "https://lh3.googleusercontent.com/foto");
});

test("LISTO_ADMIN_TOKEN ya no firma fotos", async function () {
  process.env.PHOTO_SIGNING_SECRET = PHOTO_SECRET;
  global.fetch = internet();
  var oldLink = photos.signedSrc(process.env.LISTO_ADMIN_TOKEN, NAME, 480);
  var out = await photoGet(linkQuery(oldLink));
  assert.equal(out.statusCode, 403);
  assert.equal(global.fetch.calls.length, 0, "no se le pide nada a Google");
  var good = await photoGet(linkQuery(photos.signedSrc(PHOTO_SECRET, NAME, 480)));
  assert.equal(good.statusCode, 302);
});

test("sin PHOTO_SIGNING_SECRET: la búsqueda funciona igual, sin foto (placeholder)", async function () {
  delete process.env.PHOTO_SIGNING_SECRET;
  global.fetch = internet();
  var res = await search();
  assert.equal(res.statusCode, 200);
  var data = res.json();
  assert.equal(data.ok, true);
  assert.equal(data.options.length, 3);
  data.options.forEach(function (o) { assert.equal(o.photo, null); assert.ok(o.name); });
});

test("sin PHOTO_SIGNING_SECRET: /api/place-photo rechaza de forma segura", async function () {
  delete process.env.PHOTO_SIGNING_SECRET;
  global.fetch = internet();
  var out = await photoGet(linkQuery(photos.signedSrc(PHOTO_SECRET, NAME, 480)));
  assert.equal(out.statusCode, 503);
  assert.equal(global.fetch.calls.length, 0);
});

test("la búsqueda sigue aunque Supabase falle (providers y límite)", async function () {
  process.env.PHOTO_SIGNING_SECRET = PHOTO_SECRET;
  global.fetch = h.mockFetch([
    { match: /rpc\/listo_rate_limit_hit$/, reply: function () { return h.response(500, {}); } },
    { match: /places:searchText$/, reply: function () { return h.response(200, { places: [googlePlace(1), googlePlace(2), googlePlace(3)] }); } },
    { match: /\/rest\/v1\/providers/, reply: function () { return h.response(500, { message: "caído" }); } }
  ]);
  var res = await quietly(search);
  assert.equal(res.statusCode, 200);
  var data = res.json();
  assert.equal(data.options.length, 3);
  assert.equal(data.providers_saved, false);
});
