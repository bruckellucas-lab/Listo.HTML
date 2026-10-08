/* G1B-1 · Cumplimiento de Google Maps Platform: no se guarda contenido de Google.
   - providers: sólo la fila mínima (google_place_id + datos de LISTO), nunca nombre,
     dirección, rating, web, link de Maps, zona, categoría ni coordenadas (test guardián);
   - "Elegir esta opción": comprobante firmado; no se copia el nombre;
   - propuesta, emails y detalle de /admin: datos del lugar pedidos a Google en el momento,
     con aviso honesto y link a Maps si Google falla;
   - listas de /admin: sin pedidos a Google por fila. */
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
process.env.ADMIN_PASSWORD = "prueba-local-solo-tests-123";
process.env.RESEND_API_KEY = "re_prueba_no_real";

var store = require("../api/_lib/providers-store");
var optionToken = require("../api/_lib/option-token");
var placeDetails = require("../api/_lib/place-details");
var notify = require("../api/_lib/notify");
var auth = require("../api/_lib/admin-auth");
var planOptions = require("../api/plan-options");
var planSelection = require("../api/plan-selection");
var proposal = require("../api/proposal");
var adminInquiries = require("../api/admin-inquiries");
var adminProviders = require("../api/admin-providers");

var SECRET = process.env.PHOTO_SIGNING_SECRET;
var CFG = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY };
var REQ = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";
var PLACE = "ChIJabcdefghij0001";
var adminCookie = auth.sessionCookie().split(";")[0];

function read(rel) { return fs.readFileSync(path.join(h.ROOT, rel), "utf8"); }
function quiet(fn) {
  var orig = console.error; console.error = function () {};
  return Promise.resolve().then(fn).finally(function () { console.error = orig; });
}
function gPlace(i) {
  return { id: "ChIJabcdefghij000" + i, displayName: { text: "Lugar " + i }, formattedAddress: "Calle " + i + ", Palermo",
    addressComponents: [{ types: ["neighborhood"], longText: "Palermo" }], location: { latitude: -34.5, longitude: -58.4 },
    primaryTypeDisplayName: { text: "Restaurante" }, websiteUri: "https://lugar" + i + ".example",
    rating: 4.5, userRatingCount: 100 + i, businessStatus: "OPERATIONAL", googleMapsUri: "https://maps.google.com/?cid=" + i,
    photos: [{ name: "places/ChIJabcdefghij000" + i + "/photos/AbCdEfGhIjKlMnOp" + i, widthPx: 800, heightPx: 600,
      authorAttributions: [{ displayName: "Autora " + i }], googleMapsUri: "https://www.google.com/maps/place//data=!3m4!1e2!3m2!1sFOTO" + i }] };
}
function googleCalls(fetch) { return fetch.calls.filter(function (c) { return /places\.googleapis\.com/.test(c.url); }); }
function providerWrites(fetch) {
  return fetch.calls.filter(function (c) { return c.method !== "GET" && /\/rest\/v1\/providers(\?|$)/.test(c.url); });
}
// Guardián: ninguna escritura a providers lleva contenido de Google (ni siquiera con otro valor).
function assertNoGoogleContent(fetch) {
  providerWrites(fetch).forEach(function (c) {
    var body = JSON.parse(c.body);
    (Array.isArray(body) ? body : [body]).forEach(function (row) {
      Object.keys(row).forEach(function (k) {
        if (store.STORED_FIELDS.indexOf(k) !== -1) return;
        assert.ok(store.GOOGLE_FIELDS.indexOf(k) !== -1 && row[k] === "", "campo no permitido en providers: " + k + "=" + JSON.stringify(row[k]));
      });
    });
  });
}

/* ---------- providers: sólo fila mínima (test guardián) ---------- */

test("plan-options: las tarjetas siguen completas pero a providers sólo va la fila mínima", async function () {
  var fetch = h.mockFetch([
    h.rpcRule(),
    { match: /places:searchText$/, reply: function () { return h.response(200, { places: [gPlace(1), gPlace(2), gPlace(3)] }); } },
    { match: /\/rest\/v1\/providers\?select=google_place_id/, reply: function () { return h.response(200, [{ google_place_id: "ChIJabcdefghij0002" }]); } },
    { match: /\/rest\/v1\/providers/, reply: function () { return h.response(201, ""); } }
  ]);
  global.fetch = fetch;
  var res = h.fakeRes(), req = h.fakeReq("GET", {});
  req.query = { category: "restaurantes", zone: "Palermo" };
  await planOptions(req, res);
  assert.equal(res.statusCode, 200);
  var o = res.json().options.filter(function (x) { return x.google_place_id === PLACE; })[0];
  assert.equal(o.name, "Lugar 1", "el usuario ve la tarjeta completa (búsqueda en vivo)");
  assert.equal(o.address_short, "Calle 1");
  assert.equal(o.rating, 4.5);
  assert.equal(o.maps_url, "https://maps.google.com/?cid=1");

  assertNoGoogleContent(fetch);
  var writes = providerWrites(fetch);
  var insert = writes.filter(function (c) { return c.method === "POST"; })[0];
  assert.deepEqual(JSON.parse(insert.body).map(function (r) { return Object.keys(r).sort().join(","); }),
    ["google_place_id,last_verified_at,provider_status,source", "google_place_id,last_verified_at,provider_status,source"]);
  assert.deepEqual(JSON.parse(insert.body).map(function (r) { return r.google_place_id; }), ["ChIJabcdefghij0001", "ChIJabcdefghij0003"]);
  // El que ya existía: un solo PATCH, sólo con la fecha interna.
  var patches = writes.filter(function (c) { return c.method === "PATCH"; });
  assert.equal(patches.length, 1);
  assert.deepEqual(Object.keys(JSON.parse(patches[0].body)), ["last_verified_at"]);
});

test("saveProviders: aunque reciba filas completas, descarta todo lo que es de Google", async function () {
  var fetch = h.mockFetch([
    { match: /\/rest\/v1\/providers\?select=/, reply: function () { return h.response(200, []); } },
    { match: /\/rest\/v1\/providers/, reply: function () { return h.response(201, ""); } }
  ]);
  var full = { google_place_id: PLACE, name: "X", category: "Y", address: "Z", zone: "W", latitude: 1, longitude: 2, rating: 5,
    review_count: 9, website: "https://x", maps_url: "https://m", provider_status: "verified", source: "otra" };
  var out = await store.saveProviders(CFG, [full, full], fetch);
  assert.deepEqual(out, { inserted: 1, updated: 0 });
  assertNoGoogleContent(fetch);
  var row = JSON.parse(providerWrites(fetch)[0].body)[0];
  assert.equal(row.provider_status, "discovered");
  assert.equal(row.source, "google");
});

test("saveProviders: si 'name' sigue siendo NOT NULL, reintenta con texto vacío (nunca con datos de Google)", async function () {
  var posts = 0;
  var fetch = h.mockFetch([
    { match: /\/rest\/v1\/providers\?select=/, reply: function () { return h.response(200, []); } },
    { match: /\/rest\/v1\/providers\?on_conflict/, reply: function (c) {
      posts++;
      var row = JSON.parse(c.body)[0];
      if (row.name === undefined) return h.response(400, { code: "23502", message: 'null value in column "name" of relation "providers" violates not-null constraint' });
      return h.response(201, "");
    } }
  ]);
  await quiet(function () { return store.saveProviders(CFG, [{ google_place_id: PLACE, name: "Lugar 1" }], fetch); });
  assert.equal(posts, 2);
  assert.equal(JSON.parse(fetch.calls[2].body)[0].name, "");
  assertNoGoogleContent(fetch);
});

test("saveProviders: un NOT NULL numérico no se rellena (se informa el error)", async function () {
  var fetch = h.mockFetch([
    { match: /\/rest\/v1\/providers\?select=/, reply: function () { return h.response(200, []); } },
    { match: /\/rest\/v1\/providers\?on_conflict/, reply: function () { return h.response(400, { code: "23502", message: 'null value in column "rating" violates not-null constraint' }); } }
  ]);
  await assert.rejects(store.saveProviders(CFG, [{ google_place_id: PLACE }], fetch), function (e) { return e.code === "23502"; });
});

test("código: nada escribe ni lee contenido de Google guardado en Supabase", function () {
  var api = ["api/plan-options.js", "api/_lib/providers-store.js", "api/_lib/selections.js", "api/_lib/proposals.js",
    "api/_lib/notify.js", "api/admin-inquiries.js", "api/admin-providers.js"].map(function (f) { return [f, read(f)]; });
  api.forEach(function (f) {
    assert.doesNotMatch(f[1], /providers\((name|category|address)/, f[0] + " no embebe datos de Google de providers");
    assert.doesNotMatch(f[1], /provider_name: (provider|row|sel)\./, f[0] + " no copia el nombre");
    assert.doesNotMatch(f[1], /plan_selections\([^)]*provider_name/, f[0] + " no lee provider_name");
  });
  assert.doesNotMatch(read("api/_lib/providers-store.js"), /UPDATABLE/);
  assert.match(read("api/admin-providers.js"), /PROVIDER_FIELDS = "google_place_id,provider_status,last_verified_at"/);
});

/* ---------- Comprobante firmado ---------- */

test("option_token: válido, adulterado, de otro lugar, vencido y sin secreto", function () {
  var now = 1800000000;
  var t = optionToken.sign(SECRET, PLACE, now);
  assert.match(t, /^\d+\.[A-Za-z0-9_-]{43}$/);
  assert.equal(optionToken.verify(SECRET, PLACE, t, now + 60), "");
  assert.equal(optionToken.verify(SECRET, "ChIJabcdefghij0002", t, now + 60), "firma-invalida", "no sirve para otro lugar");
  var parts = t.split(".");
  assert.equal(optionToken.verify(SECRET, PLACE, parts[0] + "." + (parts[1][0] === "A" ? "B" : "A") + parts[1].slice(1), now), "firma-invalida");
  assert.equal(optionToken.verify(SECRET, PLACE, (Number(parts[0]) + 10) + "." + parts[1], now), "firma-invalida", "cambiar el vencimiento rompe la firma");
  assert.equal(optionToken.verify(SECRET, PLACE, t, now + optionToken.TTL_SECONDS + 1), "vencido");
  assert.equal(optionToken.verify(SECRET, PLACE, "", now), "sin-comprobante");
  assert.equal(optionToken.verify("", PLACE, t, now), "sin-secreto");
  assert.equal(optionToken.verify("otro-secreto-de-al-menos-32-caracteres!!", PLACE, t, now), "firma-invalida");
  // La firma de una opción no es una firma de foto (claves derivadas distintas).
  assert.notEqual(parts[1], require("../api/_lib/photos").signedSrc(SECRET, PLACE, 480, now).split("sig=")[1]);
});

test("plan-options entrega un comprobante válido por opción", async function () {
  global.fetch = h.mockFetch([
    h.rpcRule(),
    { match: /places:searchText$/, reply: function () { return h.response(200, { places: [gPlace(1), gPlace(2), gPlace(3)] }); } },
    { match: /\/rest\/v1\/providers/, reply: function () { return h.response(200, []); } }
  ]);
  var res = h.fakeRes(), req = h.fakeReq("GET", {});
  req.query = { category: "restaurantes" };
  await planOptions(req, res);
  res.json().options.forEach(function (o) { assert.equal(optionToken.verify(SECRET, o.google_place_id, o.option_token), "", o.google_place_id); });
});

function selectionWorld() {
  var fetch = h.mockFetch([
    h.rpcRule(),
    { match: /\/rest\/v1\/event_requests\?select=id,dietary_requirements/, reply: function () { return h.response(200, [{ id: REQ, dietary_requirements: null }]); } },
    { match: /\/rest\/v1\/providers\?on_conflict/, reply: function () { return h.response(201, ""); } },
    { match: /\/rest\/v1\/plan_selections\?select=/, reply: function () { return h.response(200, []); } },
    { match: /\/rest\/v1\/plan_selections$/, reply: function (c) { return h.response(201, [Object.assign({ id: "sel-1", created_at: "2026-10-07T12:00:00Z" }, JSON.parse(c.body))]); } }
  ]);
  global.fetch = fetch;
  return fetch;
}
async function choose(body) {
  var res = h.fakeRes();
  await quiet(function () { return planSelection(h.fakeReq("POST", { "content-type": "application/json" }, body), res); });
  return res;
}

test("elegir con comprobante válido: guarda sin copiar el nombre y asegura la fila mínima", async function () {
  var fetch = selectionWorld();
  var res = await choose({ event_request_id: REQ, google_place_id: PLACE, option_token: optionToken.sign(SECRET, PLACE) });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().selection.provider_name, undefined, "la respuesta no devuelve nombre");
  var sel = fetch.calls.filter(function (c) { return c.method === "POST" && /plan_selections$/.test(c.url); })[0];
  var body = JSON.parse(sel.body);
  assert.equal(body.provider_name, "", "sin nombre de Google (vacío hasta G1B-2)");
  assert.equal(body.provider_google_place_id, PLACE);
  assertNoGoogleContent(fetch);
  assert.equal(providerWrites(fetch).length, 1, "fila mínima para el vínculo (ignore-duplicates)");
  assert.equal(googleCalls(fetch).length, 0, "elegir no llama a Google");
});

test("elegir con comprobante adulterado, de otro lugar, vencido o sin comprobante → 409 y no guarda", async function () {
  var good = optionToken.sign(SECRET, PLACE);
  var bad = [
    good.slice(0, -1) + (good.slice(-1) === "A" ? "B" : "A"),
    optionToken.sign(SECRET, "ChIJabcdefghij0002"),
    optionToken.sign(SECRET, PLACE, Math.floor(Date.now() / 1000) - optionToken.TTL_SECONDS - 10),
    "", undefined
  ];
  for (var t of bad) {
    var fetch = selectionWorld();
    var res = await choose({ event_request_id: REQ, google_place_id: PLACE, option_token: t });
    assert.equal(res.statusCode, 409, String(t));
    assert.match(res.json().error, /Volvé a buscar opciones/);
    assert.equal(fetch.calls.filter(function (c) { return c.method !== "GET" && /plan_selections|providers/.test(c.url); }).length, 0);
  }
});

// Falla cerrado: sin secreto válido no se guarda NINGUNA elección, aunque el lugar exista en providers.
async function withSecret(value, fn) {
  var saved = process.env.PHOTO_SIGNING_SECRET;
  if (value === undefined) delete process.env.PHOTO_SIGNING_SECRET; else process.env.PHOTO_SIGNING_SECRET = value;
  try { return await fn(); } finally { process.env.PHOTO_SIGNING_SECRET = saved; }
}
function failClosedWorld() {
  var fetch = h.mockFetch([
    h.rpcRule(),
    { match: /\/rest\/v1\/event_requests\?select=id,dietary_requirements/, reply: function () { return h.response(200, [{ id: REQ, dietary_requirements: null }]); } },
    { match: /\/rest\/v1\/providers/, reply: function () { return h.response(200, [{ google_place_id: PLACE }]); } },
    { match: /\/rest\/v1\/plan_selections\?select=/, reply: function () { return h.response(200, []); } },
    { match: /\/rest\/v1\/plan_selections$/, reply: function (c) { return h.response(201, [JSON.parse(c.body)]); } }
  ]);
  global.fetch = fetch;
  return fetch;
}

test("falla cerrado: sin PHOTO_SIGNING_SECRET no se guarda la elección (aunque el lugar exista en providers)", async function () {
  var token = optionToken.sign(SECRET, PLACE);
  for (var body of [{ event_request_id: REQ, google_place_id: PLACE }, { event_request_id: REQ, google_place_id: PLACE, option_token: token }]) {
    var fetch = failClosedWorld();
    var res = await withSecret(undefined, function () { return choose(body); });
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().error, "LISTO no puede guardar esta elección en este momento. Volvé a buscar opciones e intentá de nuevo.");
    assert.equal(fetch.calls.filter(function (c) { return /plan_selections|providers/.test(c.url); }).length, 0, "ni siquiera consulta providers");
  }
});

test("falla cerrado: secreto demasiado corto → no se guarda", async function () {
  var fetch = failClosedWorld();
  var short = "corto-" + "x".repeat(10);
  var res = await withSecret(short, function () { return choose({ event_request_id: REQ, google_place_id: PLACE, option_token: optionToken.sign(short, PLACE) }); });
  assert.equal(res.statusCode, 503);
  assert.match(res.json().error, /no puede guardar esta elección/);
  assert.equal(fetch.calls.filter(function (c) { return c.method !== "GET" && /plan_selections|providers/.test(c.url); }).length, 0);
});

test("con secreto válido: token válido acepta; faltante, inválido, de otro lugar o vencido rechaza", async function () {
  var now = Math.floor(Date.now() / 1000);
  var cases = [
    ["válido", optionToken.sign(SECRET, PLACE), 200],
    ["faltante", undefined, 409],
    ["inválido", "123.no-es-una-firma", 409],
    ["adulterado", (function (t) { return t.slice(0, -1) + (t.slice(-1) === "A" ? "B" : "A"); })(optionToken.sign(SECRET, PLACE)), 409],
    ["de otro lugar", optionToken.sign(SECRET, "ChIJabcdefghij0002"), 409],
    ["vencido", optionToken.sign(SECRET, PLACE, now - optionToken.TTL_SECONDS - 5), 409]
  ];
  for (var c of cases) {
    var fetch = selectionWorld();
    var body = { event_request_id: REQ, google_place_id: PLACE };
    if (c[1] !== undefined) body.option_token = c[1];
    var res = await choose(body);
    assert.equal(res.statusCode, c[2], c[0]);
    var saved = fetch.calls.filter(function (x) { return x.method === "POST" && /plan_selections$/.test(x.url); }).length;
    assert.equal(saved, c[2] === 200 ? 1 : 0, c[0]);
  }
});

test("app.js manda el comprobante y no lo guarda en localStorage", function () {
  var app = read("app.js");
  assert.match(app, /option_token: o\.option_token \|\| ""/);
  var save = app.slice(app.indexOf("function savePlan"), app.indexOf("function scrubStoredPlan"));
  assert.doesNotMatch(save, /option_token|options/);
});

/* ---------- Propuesta ---------- */

function proposalRow() {
  return {
    id: "11111111-1111-4111-8111-111111111111", status: "proposal_sent", public_code: "AbCdEf123456", view_count: 0,
    plan_inquiry_id: "22222222-2222-4222-8222-222222222222", provider_quote_id: "q",
    provider_quotes: { id: "q", total_price: 150000, currency: "ARS", availability: "yes", valid_until: null },
    plan_inquiries: { id: "i", event_date: "2026-11-01", approximate_time: "21:00",
      plan_selections: { provider_google_place_id: PLACE, event_requests: { event_type: "cena", guests: 6, zone: "Palermo" } } }
  };
}
function proposalWorld(google) {
  var fetch = h.mockFetch([
    h.rpcRule(),
    { match: /\/rest\/v1\/plan_proposals\?select=/, reply: function () { return h.response(200, [proposalRow()]); } },
    { match: /\/rest\/v1\/plan_proposals\?id=eq\./, reply: function () { return h.response(204, ""); } },
    { match: /places\.googleapis\.com\/v1\/places\//, reply: google }
  ]);
  global.fetch = fetch;
  return fetch;
}
async function openProposal(ip, handler) {
  var res = h.fakeRes(), req = h.fakeReq("GET", {}, undefined, ip);
  req.query = { code: "AbCdEf123456" };
  await quiet(function () { return (handler || proposal)(req, res); });
  return res;
}

test("propuesta con Google OK: nombre, dirección, categoría, Maps y foto en UN pedido a Google", async function () {
  var fetch = proposalWorld(function () { return h.response(200, gPlace(1)); });
  var res = await openProposal();
  assert.equal(res.statusCode, 200);
  var p = res.json().proposal;
  assert.equal(p.place.name, "Lugar 1");
  assert.equal(p.place.address, "Calle 1, Palermo");
  assert.equal(p.place.category, "Restaurante");
  assert.equal(p.place.maps_url, "https://maps.google.com/?cid=1");
  assert.equal(p.place.unavailable, false);
  assert.match(p.photo.large, /^\/api\/place-photo\?/);
  var g = googleCalls(fetch);
  assert.equal(g.length, 1, "un solo pedido de Place Details por apertura");
  assert.equal(g[0].headers["X-Goog-FieldMask"], placeDetails.FIELDS.proposal);
  assert.doesNotMatch(g[0].headers["X-Goog-FieldMask"], /rating|website|location|reviews/, "campos mínimos");
  var read = decodeURIComponent(fetch.calls.filter(function (c) { return /plan_proposals\?select=/.test(c.url); })[0].url);
  assert.doesNotMatch(read, /providers\(|provider_name/, "no lee datos de Google guardados");
});

test("propuesta con Google caído: abre igual, sin datos inventados, con aviso y link a Maps", async function () {
  proposalWorld(function () { return h.response(500, { error: { message: "caído" } }); });
  var res = await openProposal();
  assert.equal(res.statusCode, 200);
  var p = res.json().proposal;
  assert.equal(p.place.name, null);
  assert.equal(p.place.address, null);
  assert.equal(p.place.unavailable, true);
  assert.match(p.place.message, /no disponibles/);
  assert.equal(p.place.maps_url, "https://www.google.com/maps/search/?api=1&query=" + PLACE + "&query_place_id=" + PLACE);
  assert.equal(p.photo, null);
  assert.equal(p.quote.total_price, 150000, "la cotización se muestra igual");
  var page = read("propuesta/index.html");
  assert.match(page, /place\.unavailable \? \(place\.message/);
  assert.match(page, /place: data && data\.place/, "al responder se conserva el lugar (sin volver a llamar a Google)");
});

test("propuesta: responder (POST) no llama a Google", async function () {
  var fetch = h.mockFetch([
    h.rpcRule(),
    { match: /\/rest\/v1\/plan_proposals\?select=/, reply: function () { var r = proposalRow(); r.status = "proposal_accepted"; return h.response(200, [r]); } }
  ]);
  global.fetch = fetch;
  var res = h.fakeRes();
  await quiet(function () { return proposal(h.fakeReq("POST", { "content-type": "application/json" }, { code: "AbCdEf123456", action: "accept" }), res); });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().proposal.place, null);
  assert.equal(googleCalls(fetch).length, 0);
});

/* ---------- Límite persistente antes de pedir datos del lugar (propuesta) ---------- */

var rl = require("../api/_lib/rate-limit");
// "Supabase" compartido: el conteo vive acá (como la tabla api_rate_limits), no en cada copia de la función.
function sharedStore() {
  var counts = {}, bodies = [];
  return {
    bodies: bodies,
    rule: { match: /\/rest\/v1\/rpc\/listo_rate_limit_hit$/, reply: function (c) {
      var b = JSON.parse(c.body); bodies.push(b);
      var id = b.p_scope + "|" + b.p_key + "|" + b.p_window_seconds;
      counts[id] = (counts[id] || 0) + 1;
      return h.response(200, { allowed: counts[id] <= b.p_max, hits: counts[id], retry_after: 60 });
    } }
  };
}
function limitedWorld(store, google) {
  var fetch = h.mockFetch([
    store.rule,
    { match: /\/rest\/v1\/plan_proposals\?select=/, reply: function () { return h.response(200, [proposalRow()]); } },
    { match: /\/rest\/v1\/plan_proposals\?id=eq\./, reply: function () { return h.response(204, ""); } },
    { match: /places\.googleapis\.com\/v1\/places\//, reply: google || function () { return h.response(200, gPlace(1)); } }
  ]);
  global.fetch = fetch;
  return fetch;
}
function assertFallback(res) {
  assert.equal(res.statusCode, 200, "la propuesta abre igual");
  var p = res.json().proposal;
  assert.equal(p.place.name, null);
  assert.equal(p.place.unavailable, true);
  assert.equal(p.place.message, "Datos del lugar no disponibles en este momento.");
  assert.equal(p.place.maps_url, "https://www.google.com/maps/search/?api=1&query=" + PLACE + "&query_place_id=" + PLACE);
  assert.equal(p.quote.total_price, 150000);
}
async function withLimits(over, fn) {
  var saved = {};
  Object.keys(over).forEach(function (k) { saved[k] = rl.LIMITS[k].max; rl.LIMITS[k].max = over[k]; });
  try { return await fn(); } finally { Object.keys(saved).forEach(function (k) { rl.LIMITS[k].max = saved[k]; }); }
}

test("límite de propuesta: apertura normal → consulta el límite persistente y llama 1 vez a Google", async function () {
  var store = sharedStore(), fetch = limitedWorld(store);
  var res = await openProposal("10.9.0.1");
  assert.equal(res.json().proposal.place.name, "Lugar 1");
  assert.equal(googleCalls(fetch).length, 1);
  // Antes de Google: por visitante + tope total, en la fila que la función de Supabase ya acepta (sin migration).
  assert.deepEqual(store.bodies.map(function (b) { return [b.p_scope, b.p_max, b.p_window_seconds]; }),
    [["proposal_response", rl.LIMITS.proposal_details.max, 600], ["proposal_response", rl.LIMITS.proposal_details_all.max, 3600]]);
  var gIdx = fetch.calls.indexOf(googleCalls(fetch)[0]);
  assert.ok(fetch.calls.findIndex(function (c) { return /rpc\/listo_rate_limit_hit/.test(c.url); }) < gIdx, "el límite se consulta ANTES de Google");
  // Huellas distintas a las de "aceptar / pedir otra opción" (nunca se mezclan los conteos).
  var respKey = rl.visitorKey(process.env.RATE_LIMIT_SECRET, "proposal_response", "10.9.0.1");
  assert.ok(store.bodies.every(function (b) { return b.p_key !== respKey && /^[0-9a-f]{64}$/.test(b.p_key); }));
});

test("límite de propuesta: excedido → no llama a Google y la propuesta abre con aviso y link a Maps", async function () {
  await withLimits({ proposal_details: 2 }, async function () {
    var store = sharedStore(), fetch = limitedWorld(store);
    await openProposal("10.9.0.2"); await openProposal("10.9.0.2");
    assert.equal(googleCalls(fetch).length, 2);
    var res = await openProposal("10.9.0.2");
    assertFallback(res);
    assert.equal(googleCalls(fetch).length, 2, "la tercera no llamó a Google");
    assert.equal((await openProposal("10.9.0.3")).json().proposal.place.name, "Lugar 1", "otro visitante sigue viendo los datos");
  });
});

test("límite de propuesta: tope total compartido entre visitantes", async function () {
  await withLimits({ proposal_details_all: 3 }, async function () {
    var store = sharedStore(), fetch = limitedWorld(store);
    for (var i = 1; i <= 3; i++) await openProposal("10.9.1." + i);
    assertFallback(await openProposal("10.9.1.9"));
    assert.equal(googleCalls(fetch).length, 3);
  });
});

test("límite de propuesta: si el límite persistente no está disponible → no llama a Google y abre igual", async function () {
  for (var down of [
    function () { return h.response(404, { code: "PGRST202", message: "Could not find the function" }); },
    function () { return h.response(500, { message: "caído" }); },
    function () { return Promise.reject(new Error("sin red")); }
  ]) {
    var fetch = limitedWorld({ rule: { match: /\/rest\/v1\/rpc\/listo_rate_limit_hit$/, reply: down } });
    assertFallback(await openProposal("10.9.2.1"));
    assert.equal(googleCalls(fetch).length, 0);
  }
  var saved = process.env.RATE_LIMIT_SECRET;
  process.env.RATE_LIMIT_SECRET = "corto";
  try {
    var f2 = limitedWorld(sharedStore());
    assertFallback(await openProposal("10.9.2.2"));
    assert.equal(googleCalls(f2).length, 0, "sin secreto del límite tampoco se llama a Google");
  } finally { process.env.RATE_LIMIT_SECRET = saved; }
});

test("límite de propuesta: dos copias independientes de la función comparten el conteo (Supabase)", async function () {
  await withLimits({ proposal_details: 3 }, async function () {
    var store = sharedStore(), fetch = limitedWorld(store);
    var copyA = h.fresh("api/proposal.js"), copyB = h.fresh("api/proposal.js");
    assert.notEqual(copyA, copyB);
    await openProposal("10.9.3.1", copyA); await openProposal("10.9.3.1", copyB); await openProposal("10.9.3.1", copyA);
    assert.equal(googleCalls(fetch).length, 3);
    assertFallback(await openProposal("10.9.3.1", copyB));
    assert.equal(googleCalls(fetch).length, 3, "la copia B ve el conteo de la copia A");
  });
});

test("límite de propuesta: no afecta aceptar/rechazar (POST), ni /admin, ni emails", async function () {
  var store = sharedStore();
  var fetch = h.mockFetch([
    store.rule,
    { match: /\/rest\/v1\/plan_proposals\?select=/, reply: function () { var r = proposalRow(); r.status = "proposal_accepted"; return h.response(200, [r]); } }
  ]);
  global.fetch = fetch;
  var res = h.fakeRes();
  await quiet(function () { return proposal(h.fakeReq("POST", { "content-type": "application/json" }, { code: "AbCdEf123456", action: "accept" }), res); });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(store.bodies.map(function (b) { return b.p_window_seconds; }), [600], "sólo el límite de respuestas de siempre");
  assert.equal(store.bodies[0].p_max, rl.LIMITS.proposal_response.max);
  assert.equal(googleCalls(fetch).length, 0);

  var admin = h.mockFetch([{ match: /places\.googleapis\.com/, reply: function () { return h.response(200, gPlace(1)); } }]);
  global.fetch = admin;
  var r2 = h.fakeRes();
  await adminProviders(adminReq("GET", { place_id: PLACE }), r2);
  assert.equal(r2.json().place.name, "Lugar 1");
  assert.equal(admin.calls.filter(function (c) { return /rpc/.test(c.url); }).length, 0, "/admin no usa este límite");

  var mail = mailWorld(function () { return h.response(200, gPlace(1)); });
  assert.equal(await notify.notifyInquiry(CFG, INQ, mail), true);
  assert.match(mailOf(mail), /Lugar 1/);
  assert.equal(mail.calls.filter(function (c) { return /rpc/.test(c.url); }).length, 0, "los emails no usan este límite");
});

/* ---------- Emails ---------- */

function mailWorld(google) {
  var fetch = h.mockFetch([
    { match: /\/rest\/v1\/event_requests\?/, reply: function () { return h.response(200, [{ event_type: "Cena", guests: 6, zone: "Palermo" }]); } },
    { match: /\/rest\/v1\/plan_inquiries\?select=/, reply: function () {
      return h.response(200, [{ contact_name: "Ana", contact_phone: "11 5555 1234", event_date: "2026-11-20", approximate_time: "21:30",
        plan_selections: { provider_google_place_id: PLACE, event_requests: { event_type: "Cena", guests: 6, zone: "Palermo" } } }]);
    } },
    { match: /\/rest\/v1\/plan_inquiries/, reply: function () { return h.response(204, ""); } },
    { match: /places\.googleapis\.com\/v1\/places\//, reply: google },
    { match: /api\.resend\.com/, reply: function () { return h.response(200, { id: "x" }); } }
  ]);
  return fetch;
}
function mailOf(fetch) { var m = JSON.parse(fetch.calls.filter(function (c) { return /resend/.test(c.url); })[0].body); return m.subject + "\n" + m.html + "\n" + m.text; }
var INQ = { eventRequestId: "11111111-2222-4333-8444-555555555555", placeId: PLACE, selectionId: "66666666-7777-4888-9999-000000000000",
  contact: { contact_name: "Ana", contact_phone: "11 5555 1234", event_date: "2026-11-20", approximate_time: "21:30" }, updated: false };

test("email 'Quiero avanzar' con Google OK: nombre y Maps pedidos al enviar (no a Supabase)", async function () {
  var fetch = mailWorld(function () { return h.response(200, gPlace(1)); });
  assert.equal(await notify.notifyInquiry(CFG, INQ, fetch), true);
  var mail = mailOf(fetch);
  assert.match(mail, /Lugar 1/);
  assert.match(mail, /https:\/\/maps\.google\.com\/\?cid=1/);
  assert.match(mail, /Datos del lugar: (<span[^>]*>)?Google Maps/);
  assert.equal(fetch.calls.filter(function (c) { return /\/rest\/v1\/providers/.test(c.url); }).length, 0, "no lee providers");
  var g = googleCalls(fetch);
  assert.equal(g.length, 1);
  assert.equal(g[0].headers["X-Goog-FieldMask"], "displayName,formattedAddress,googleMapsUri");
});

test("email 'Quiero avanzar' con Google caído: sale igual, sin nombre inventado, con aviso y link a Maps", async function () {
  var fetch = mailWorld(function () { return Promise.reject(new Error("sin red")); });
  var sent = await quiet(function () { return notify.notifyInquiry(CFG, INQ, fetch); });
  assert.equal(sent, true);
  var mail = mailOf(fetch);
  assert.doesNotMatch(mail, /Lugar 1/);
  assert.match(mail, /Datos del lugar no disponibles en este momento/);
  assert.match(mail, /query_place_id=ChIJabcdefghij0001/);
  assert.match(mail, /· LISTO/, "asunto sin nombre inventado");
});

test("email de respuesta a propuesta: sin Google, con 'Lugar elegido' y link a Maps del place_id", async function () {
  for (var action of ["accept", "decline"]) {
    var fetch = mailWorld(function () { return h.response(200, gPlace(1)); });
    assert.equal(await notify.notifyProposalResponse(CFG, { planInquiryId: "22222222-2222-4222-8222-222222222222", action: action, quote: {} }, fetch), true);
    var m = mailOf(fetch);
    assert.match(m, action === "accept" ? /Propuesta aceptada · Lugar elegido/ : /Pidió otra opción · Lugar elegido/);
    assert.match(m, /https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=ChIJabcdefghij0001&amp;query_place_id=ChIJabcdefghij0001/);
    assert.doesNotMatch(m, /Lugar 1|Calle 1|no disponibles/, "ni datos de Google ni aviso de falla");
    assert.equal(googleCalls(fetch).length, 0, "no llama a Google");
    var read1 = decodeURIComponent(fetch.calls.filter(function (c) { return /plan_inquiries\?select=/.test(c.url); })[0].url);
    assert.doesNotMatch(read1, /providers\(|provider_name/);
  }
});

// Recorrido completo de aceptar / rechazar: guarda, responde 200, manda email y hace 0 consultas a Google.
function answerWorld(initial) {
  var state = { status: initial || "proposal_sent", patches: [] };
  var fetch = h.mockFetch([
    h.rpcRule(),
    { match: /\/rest\/v1\/plan_proposals\?select=/, reply: function () { var r = proposalRow(); r.status = state.status; return h.response(200, [r]); } },
    { match: /\/rest\/v1\/plan_proposals\?id=eq\./, reply: function (c) {
      var b = JSON.parse(c.body); state.patches.push(b);
      if (state.status !== "proposal_sent") return h.response(200, []);
      state.status = b.status; return h.response(200, [{ id: "p", status: b.status }]);
    } },
    { match: /\/rest\/v1\/plan_inquiries\?select=/, reply: function () {
      return h.response(200, [{ contact_name: "Ana", contact_phone: "11 5555 1234", event_date: "2026-11-20", approximate_time: "21:30",
        plan_selections: { provider_google_place_id: PLACE, event_requests: { event_type: "Cena", guests: 6, zone: "Palermo" } } }]);
    } },
    { match: /places\.googleapis\.com/, reply: function () { return h.response(200, gPlace(1)); } },
    { match: /api\.resend\.com/, reply: function () { return h.response(200, { id: "x" }); } }
  ]);
  global.fetch = fetch;
  fetch.state = state;
  return fetch;
}
async function answer(action) {
  var res = h.fakeRes();
  await quiet(function () { return proposal(h.fakeReq("POST", { "content-type": "application/json", host: "listohtml.vercel.app" }, { code: "AbCdEf123456", action: action, comment: action === "decline" ? "Otra zona" : "" }), res); });
  return res;
}
function mails(fetch) { return fetch.calls.filter(function (c) { return /api\.resend\.com/.test(c.url); }); }

test("aceptar (primera vez, con Resend): guarda, 200, manda email y 0 llamadas a Google", async function () {
  assert.ok(process.env.RESEND_API_KEY, "Resend configurado");
  var fetch = answerWorld();
  var res = await answer("accept");
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().proposal.status, "proposal_accepted");
  assert.equal(fetch.state.patches.length, 1);
  assert.equal(fetch.state.patches[0].status, "proposal_accepted");
  assert.equal(mails(fetch).length, 1);
  assert.match(JSON.parse(mails(fetch)[0].body).subject, /^Propuesta aceptada · Lugar elegido$/);
  assert.equal(googleCalls(fetch).length, 0);
});

test("rechazar (primera vez, con Resend): guarda, 200, manda email y 0 llamadas a Google", async function () {
  var fetch = answerWorld();
  var res = await answer("decline");
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().proposal.status, "proposal_declined");
  assert.equal(fetch.state.patches[0].status, "proposal_declined");
  assert.equal(fetch.state.patches[0].user_comment, "Otra zona");
  assert.equal(mails(fetch).length, 1);
  var m = JSON.parse(mails(fetch)[0].body);
  assert.match(m.subject, /^Pidió otra opción · Lugar elegido$/);
  assert.match(m.html, /Otra zona/);
  assert.equal(googleCalls(fetch).length, 0);
});

test("doble toque / propuesta ya respondida: 0 llamadas a Google y sin email repetido", async function () {
  var fetch = answerWorld();
  assert.equal((await answer("accept")).statusCode, 200);
  var again = await answer("accept");
  assert.equal(again.statusCode, 200, "misma respuesta → se confirma");
  var other = await answer("decline");
  assert.equal(other.statusCode, 409, "ya respondida: no admite otra respuesta");
  assert.equal(mails(fetch).length, 1);
  assert.equal(googleCalls(fetch).length, 0);

  var answered = answerWorld("proposal_declined");
  assert.equal((await answer("decline")).statusCode, 200);
  assert.equal(answered.state.patches.length, 0);
  assert.equal(googleCalls(answered).length, 0);
});

test("después de responder, abrir la propuesta (GET) sigue trayendo los datos del lugar", async function () {
  var fetch = answerWorld();
  await answer("accept");
  var res = await openProposal("10.9.4.1");
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().proposal.status, "proposal_accepted");
  assert.equal(res.json().proposal.place.name, "Lugar 1");
  assert.equal(googleCalls(fetch).length, 1, "sólo el GET llama a Google");
});

/* ---------- /admin ---------- */

function adminReq(method, query) {
  var req = h.fakeReq(method, { cookie: adminCookie });
  req.query = query || {};
  return req;
}

test("admin: lista de solicitudes sin pedidos a Google (sólo place_id + link a Maps)", async function () {
  var rows = [];
  for (var i = 1; i <= 50; i++) {
    rows.push({ id: "i" + i, status: "inquiry_requested", contact_name: "Ana", plan_selection_id: "s" + i,
      plan_selections: { provider_google_place_id: "ChIJabcdefghij" + String(1000 + i), event_requests: { event_type: "Cena" } } });
  }
  var fetch = h.mockFetch([
    { match: /\/rest\/v1\/plan_inquiries\?select=/, reply: function () { return h.response(200, rows); } },
    { match: /\/rest\/v1\/plan_bookings/, reply: function () { return h.response(200, []); } }
  ]);
  global.fetch = fetch;
  var res = h.fakeRes();
  await quiet(function () { return adminInquiries(adminReq("GET"), res); });
  assert.equal(res.statusCode, 200);
  var items = res.json().items;
  assert.equal(items.length, 50);
  assert.deepEqual(Object.keys(items[0].provider).sort(), ["google_place_id", "maps_url"]);
  assert.match(items[0].provider.maps_url, /query_place_id=ChIJabcdefghij1001/);
  assert.equal(googleCalls(fetch).length, 0, "ningún pedido a Google para la lista");
  assert.doesNotMatch(decodeURIComponent(fetch.calls[0].url), /providers\(|provider_name/);
});

test("admin: lista de proveedores sin pedidos a Google ni datos de Google", async function () {
  var fetch = h.mockFetch([
    { match: /\/rest\/v1\/providers\?select=/, reply: function () {
      return h.response(200, [{ google_place_id: PLACE, provider_status: "discovered", last_verified_at: "2026-10-07T12:00:00Z", provider_dietary_attributes: [] }]);
    } }
  ]);
  global.fetch = fetch;
  var res = h.fakeRes();
  await adminProviders(adminReq("GET"), res);
  assert.equal(res.statusCode, 200);
  var p = res.json().providers[0];
  assert.deepEqual(Object.keys(p).sort(), ["attributes", "google_place_id", "last_verified_at", "maps_url", "provider_status"]);
  assert.equal(googleCalls(fetch).length, 0);
  var url = decodeURIComponent(fetch.calls[0].url);
  assert.doesNotMatch(url, /[,=](name|category|address|zone|rating|review_count|maps_url|website)[,&]/);
  assert.doesNotMatch(url, /order=name/);
});

test("admin: detalle de UN lugar pedido a Google en el momento; si falla, aviso + link a Maps", async function () {
  var fetch = h.mockFetch([{ match: /places\.googleapis\.com\/v1\/places\/ChIJabcdefghij0001/, reply: function () { return h.response(200, gPlace(1)); } }]);
  global.fetch = fetch;
  var res = h.fakeRes();
  await adminProviders(adminReq("GET", { place_id: PLACE }), res);
  var pl = res.json().place;
  assert.equal(pl.ok, true);
  assert.equal(pl.name, "Lugar 1");
  assert.equal(pl.website, "https://lugar1.example");
  assert.equal(pl.rating, 4.5);
  assert.equal(googleCalls(fetch).length, 1);
  assert.equal(fetch.calls.filter(function (c) { return /supabase/.test(c.url); }).length, 0, "no guarda nada");

  global.fetch = h.mockFetch([{ match: /places\.googleapis\.com/, reply: function () { return h.response(429, {}); } }]);
  res = h.fakeRes();
  await quiet(function () { return adminProviders(adminReq("GET", { place_id: PLACE }), res); });
  pl = res.json().place;
  assert.equal(res.statusCode, 200);
  assert.equal(pl.ok, false);
  assert.equal(pl.name, null);
  assert.match(pl.message, /no disponibles/);
  assert.match(pl.maps_url, /query_place_id=ChIJabcdefghij0001/);

  res = h.fakeRes();
  await adminProviders(adminReq("GET", { place_id: "../../x" }), res);
  assert.equal(res.statusCode, 400);
  res = h.fakeRes();
  await adminProviders(h.fakeReq("GET", {}), res);
  assert.equal(res.statusCode, 401, "sólo con sesión de /admin");
});

test("admin (panel): listas sin nombre ni filtros de zona/categoría; mensaje de cumplimiento", function () {
  var admin = read("admin/index.html");
  assert.doesNotMatch(admin, /id="p-search"|id="p-zone"|id="p-category"/);
  assert.match(admin, /Los datos del lugar se consultan al abrir el detalle por cumplimiento de Google Maps\./);
  assert.doesNotMatch(admin, /it\.provider\.(name|website|rating|address)|pr\.(name|address|rating)|p\.(rating|address|review_count|website)\b/);
  assert.match(admin, /\/api\/admin-providers\?place_id=/);
});

/* ---------- Funciones ---------- */

test("/api sigue en 12/12 funciones (los archivos nuevos son internos de _lib)", function () {
  var fns = fs.readdirSync(path.join(h.ROOT, "api")).filter(function (f) { return /\.js$/.test(f); });
  assert.equal(fns.length, 12);
  assert.ok(fs.existsSync(path.join(h.ROOT, "api/_lib/place-details.js")));
  assert.ok(fs.existsSync(path.join(h.ROOT, "api/_lib/option-token.js")));
});
