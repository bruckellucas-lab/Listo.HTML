/* G1A · Cumplimiento de Google Maps Platform (sin migration):
   - /api/plan-options y /api/place-photo sin caché (no se cachean nombres de foto);
   - /api/proposal sin caché de fotos en el servidor;
   - fotos con autor y acceso a la foto en Google Maps (googleMapsUri);
   - el navegador no guarda contenido de Google (sólo ids y datos del pedido);
   - atribución "Google Maps" en tarjetas, propuesta, /admin y emails;
   - página de Términos con el aviso de Google Maps (ToS §3.2.2(a));
   - compartir sin rating de Google. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var h = require("./helpers");

process.env.SUPABASE_URL = "https://ejemplo-de-prueba.supabase.co";
process.env.SUPABASE_SECRET_KEY = "clave-de-prueba-no-real";
process.env.GOOGLE_PLACES_API_KEY = "clave-google-de-prueba";
process.env.RATE_LIMIT_SECRET = "secreto-de-prueba-para-limites-1234567890";
process.env.PHOTO_SIGNING_SECRET = "secreto-de-fotos-de-prueba-0123456789abcdef";

var photos = require("../api/_lib/photos");
var notify = require("../api/_lib/notify");
var planOptions = require("../api/plan-options");
var placePhoto = require("../api/place-photo");
var proposal = require("../api/proposal");

function read(rel) { return fs.readFileSync(path.join(h.ROOT, rel), "utf8"); }
var PHOTO_NAME = "places/ChIJabcdefghij0001/photos/AbCdEfGhIjKlMnOp1";
var PHOTO_SOURCE = "https://www.google.com/maps/place//data=!3m4!1e2!3m2!1sFOTO1";

function gPlace(i) {
  return { id: "ChIJabcdefghij000" + i, displayName: { text: "Lugar " + i }, formattedAddress: "Calle " + i + ", Palermo",
    rating: 4.5, userRatingCount: 100 + i, businessStatus: "OPERATIONAL", googleMapsUri: "https://maps.google.com/?cid=" + i,
    photos: [{ name: "places/ChIJabcdefghij000" + i + "/photos/AbCdEfGhIjKlMnOp" + i, widthPx: 800, heightPx: 600,
      authorAttributions: [{ displayName: "Autora " + i, uri: "https://maps.google.com/maps/contrib/" + i }],
      googleMapsUri: i === 1 ? PHOTO_SOURCE : "https://www.google.com/maps/place//data=!3m4!1e2!3m2!1sFOTO" + i }] };
}
function quiet(fn) {
  var orig = console.error; console.error = function () {};
  return Promise.resolve().then(fn).finally(function () { console.error = orig; });
}

/* ---------- Servidor: cachés y fotos ---------- */

test("/api/plan-options responde Cache-Control: no-store", async function () {
  global.fetch = h.mockFetch([
    h.rpcRule(),
    { match: /places:searchText$/, reply: function () { return h.response(200, { places: [gPlace(1), gPlace(2), gPlace(3)] }); } },
    { match: /\/rest\/v1\/providers/, reply: function () { return h.response(200, []); } }
  ]);
  var res = h.fakeRes(), req = h.fakeReq("GET", {});
  req.query = { category: "restaurantes", zone: "Palermo" };
  await planOptions(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["cache-control"], "no-store");
  assert.doesNotMatch(res.headers["cache-control"], /s-maxage|public|max-age=[1-9]/);
  var photo = res.json().options.filter(function (o) { return o.google_place_id === "ChIJabcdefghij0001"; })[0].photo;
  assert.deepEqual(photo.attributions, [{ name: "Autora 1", uri: "https://maps.google.com/maps/contrib/1" }], "autor de la foto");
  assert.equal(photo.source, PHOTO_SOURCE, "acceso a la foto en Google Maps");
});

test("/api/place-photo no cachea (redirección con no-store)", async function () {
  global.fetch = h.mockFetch([{ match: /\/media\?/, reply: function () { return h.response(200, { photoUri: "https://lh3.googleusercontent.com/x" }); } }]);
  var link = new URL(photos.signedSrc(process.env.PHOTO_SIGNING_SECRET, PHOTO_NAME, 480), "http://x");
  var res = h.fakeRes(), req = h.fakeReq("GET", {});
  req.query = Object.fromEntries(link.searchParams);
  await placePhoto(req, res);
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers["cache-control"], "no-store");
});

test("photosForPlace: autor, link del autor y fuente de la foto (sólo https)", function () {
  var place = { photos: [
    { name: PHOTO_NAME, authorAttributions: [{ displayName: "Ana", uri: "https://maps.google.com/contrib/1" }], googleMapsUri: PHOTO_SOURCE },
    { name: PHOTO_NAME.replace("p1", "p2"), authorAttributions: [{ displayName: "Beto", uri: "javascript:alert(1)" }], googleMapsUri: "http://inseguro" }
  ] };
  var list = photos.photosForPlace(place, process.env.PHOTO_SIGNING_SECRET);
  assert.equal(list[0].source, PHOTO_SOURCE);
  assert.deepEqual(list[0].attributions, [{ name: "Ana", uri: "https://maps.google.com/contrib/1" }]);
  assert.equal(list[1].source, null);
  assert.equal(list[1].attributions[0].uri, null);
});

test("/api/proposal pide la foto a Google en cada apertura (sin caché de nombres de foto)", async function () {
  var row = { id: "11111111-1111-4111-8111-111111111111", status: "proposal_sent", view_count: 0,
    provider_quotes: { total_price: 100000, currency: "ARS", availability: "yes" },
    plan_inquiries: { event_date: "2026-11-01", plan_selections: { provider_google_place_id: "ChIJabcdefghij0001", provider_name: "Lugar 1",
      event_requests: { event_type: "Cena", guests: 4, zone: "Palermo" }, providers: { name: "Lugar 1", maps_url: "https://maps.google.com/?cid=1" } } } };
  var fetch = h.mockFetch([
    h.rpcRule(),   // G1B-1: límite persistente antes de pedir datos del lugar
    { match: /\/rest\/v1\/plan_proposals\?select=/, reply: function () { return h.response(200, [row]); } },
    { match: /\/rest\/v1\/plan_proposals\?id=eq\./, reply: function () { return h.response(204, ""); } },
    { match: /places\.googleapis\.com\/v1\/places\/ChIJ/, reply: function () { return h.response(200, { photos: gPlace(1).photos }); } }
  ]);
  global.fetch = fetch;
  for (var i = 0; i < 2; i++) {
    var res = h.fakeRes(), req = h.fakeReq("GET", {}, undefined, "203.0.113." + (10 + i));
    req.query = { code: "AbCdEf123456" };
    await quiet(function () { return proposal(req, res); });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["cache-control"], "no-store");
    var p = res.json().proposal.photo;
    assert.equal(p.source, PHOTO_SOURCE);
    assert.equal(p.attributions[0].name, "Autora 1");
  }
  assert.equal(fetch.calls.filter(function (c) { return /places\.googleapis\.com\/v1\/places\//.test(c.url); }).length, 2, "dos aperturas → dos consultas");
  assert.doesNotMatch(read("api/proposal.js"), /photoCache|PHOTO_TTL/);
});

/* ---------- Navegador ---------- */

// Extrae funciones de app.js sin modificarlo (igual que la línea base de matching).
function grab(src, name) {
  var start = src.indexOf("  function " + name + "(");
  assert.ok(start !== -1, "no encontré " + name);
  return src.slice(start, src.indexOf("\n  }\n", start) + 4);
}
var APP = read("app.js");
function browserFns() {
  var gm = /\n  var GMAPS = [^\n]+\n/.exec(APP)[0];
  var code = "var PRICE_NOTE = 'Precio y disponibilidad a confirmar'; var state = { data: { type: 'Cena', guests: 4 } };" + gm +
    ["escapeHTML", "safeHttps", "ratingText", "photoHTML", "shareText"].map(function (n) { return grab(APP, n); }).join("\n") +
    "return { photoHTML: photoHTML, shareText: shareText, ratingText: ratingText };";
  return new Function(code)();
}

test("localStorage guarda sólo ids y datos del pedido (nada de Google)", function () {
  var save = grab(APP, "savePlan");
  var keys = /JSON\.stringify\(\{([\s\S]*?)\}\)/.exec(save)[1].match(/\b([a-zA-Z]+):/g).map(function (k) { return k.slice(0, -1); });
  assert.deepEqual(keys.sort(), ["data", "inquiries", "requestId", "requestSig", "selected", "selectedAt", "selectionId", "text"]);
  assert.doesNotMatch(save, /options|photo|rating|name|address/);
  var load = grab(APP, "loadPlan");
  assert.match(load, /state\.options = null;/, "al volver, las opciones se piden de nuevo");
  assert.doesNotMatch(load, /saved\.options/);
  var scrub = grab(APP, "scrubStoredPlan");
  assert.match(scrub, /delete saved\.options;/);
  assert.match(APP, /\n  scrubStoredPlan\(\);\n/, "se limpia al cargar la página");
  ["event-request.js", "turnstile-client.js", "admin/index.html", "propuesta/index.html"].forEach(function (f) {
    assert.doesNotMatch(read(f), /localStorage|sessionStorage|indexedDB/, f);
  });
});

test("scrubStoredPlan borra opciones de Google guardadas por versiones anteriores", function () {
  var store = { "listo:last-plan": JSON.stringify({ text: "Cena para 4", data: { needs: [] }, selected: "ChIJx", options: [{ name: "Lugar", rating: 4.5 }], optionsAt: 1 }) };
  var localStorage = { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = v; }, removeItem: function (k) { delete store[k]; } };
  new Function("localStorage", "var STORAGE_KEY = 'listo:last-plan';" + grab(APP, "scrubStoredPlan") + "scrubStoredPlan();")(localStorage);
  var saved = JSON.parse(store["listo:last-plan"]);
  assert.equal("options" in saved, false);
  assert.equal("optionsAt" in saved, false);
  assert.equal(saved.selected, "ChIJx", "se conservan los ids");
  assert.equal(store["listo:last-plan"].indexOf("Lugar"), -1);
});

test("tarjeta: autor de la foto, acceso a la foto en Google Maps y atribución del lugar", function () {
  var fn = browserFns();
  var html = fn.photoHTML({ name: "Lugar 1", photo: { thumb: "/a", large: "/b", source: PHOTO_SOURCE,
    attributions: [{ name: "Autora 1", uri: "https://maps.google.com/maps/contrib/1" }] } }, "01");
  assert.match(html, /<a href="https:\/\/maps\.google\.com\/maps\/contrib\/1"[^>]*>Autora 1<\/a>/);
  assert.match(html, /<a class="gmaps-attr" href="https:\/\/www\.google\.com\/maps\/place\/\/data=![^"]*"[^>]*>Google Maps<\/a>/);
  var noSource = fn.photoHTML({ name: "L", photo: { thumb: "/a", large: "/b", attributions: [] } }, "02");
  assert.match(noSource, /<span class="gmaps-attr">Google Maps<\/span>/);
  var card = grab(APP, "renderOptions");
  assert.match(card, /card-attr">Datos del lugar: ' \+ GMAPS/);
  assert.doesNotMatch(fn.ratingText({ rating: 4.6, review_count: 10 }), /Google(?! Maps)/);
});

test("compartir: sin rating de Google; nombre y link del lugar en Google Maps", function () {
  var fn = browserFns();
  var txt = fn.shareText({ name: "Lugar 1", zone: "Palermo", rating: 4.6, review_count: 900, maps_url: "https://maps.google.com/?cid=1" });
  assert.doesNotMatch(txt, /4[,.]6|★|reseñas|900/);
  assert.match(txt, /Lugar 1/);
  assert.match(txt, /Ver en Google Maps: https:\/\/maps\.google\.com\/\?cid=1/);
});

test("atribución \"Google Maps\" en home, propuesta, /admin y emails", function () {
  var css = read("styles.css");
  assert.match(css, /\.gmaps-attr \{[^}]*text-transform: none;[^}]*\}/);
  assert.match(css, /\.gmaps-attr \{[^}]*font-size: 12px;/);
  var index = read("index.html");
  assert.match(index, /<span class="notice-badge gmaps-attr">Google Maps<\/span>/);
  var prop = read("propuesta/index.html");
  assert.match(prop, /id="place-attr"[^>]*>Datos del lugar: <span class="gmaps-attr">Google Maps<\/span>/);
  assert.match(prop, /el\(p\.photo\.source && [^\n]*\? "a" : "span", "gmaps-attr", "Google Maps"\)/, "foto de la propuesta con acceso a la fuente");
  assert.match(prop, /gm\.href = p\.photo\.source;/);
  var admin = read("admin/index.html");
  assert.match(admin, /function gmapsNote\(\)/);
  // G1B: las listas ya no muestran datos de Google (sólo place_id + link a Maps); el detalle sí, con atribución.
  assert.match(admin, /function livePlace\([\s\S]*?box\.appendChild\(gmapsNote\(\)\)/, "detalle (datos en tiempo real) con atribución");
  var e1 = notify.buildEmail({ request: { event_type: "Cena" }, provider: { name: "Lugar", maps_url: "https://maps.google.com/?cid=1" }, contact: {} });
  var e2 = notify.buildProposalEmail({ action: "accept", contact: {}, quote: {}, request: {}, provider: { name: "Lugar", address: "Calle 1", maps_url: "https://maps.google.com/?cid=1" } });
  [e1, e2].forEach(function (e) {
    assert.match(e.html, /Datos del lugar: <span[^>]*>Google Maps<\/span>/);
    assert.match(e.text, /Datos del lugar: Google Maps/);
  });
});

test("Términos: aviso de Google Maps (ToS §3.2.2(a)) y links desde el footer", function () {
  var t = read("terminos.html");
  assert.match(t, /LISTO incluye funciones y contenido de <span class="gmaps-attr">Google Maps<\/span>/);
  assert.match(t, /href="https:\/\/maps\.google\.com\/help\/terms_maps\/"/);
  assert.match(t, /href="https:\/\/policies\.google\.com\/privacy"/);
  assert.match(t, /Pendiente de revisión legal/);
  assert.match(read("index.html"), /<footer[\s\S]*<a href="terminos\.html">Términos<\/a>[\s\S]*<\/footer>/);
  assert.match(read("propuesta/index.html"), /<footer>[\s\S]*href="\/terminos\.html">Términos<\/a><\/footer>/);
});
