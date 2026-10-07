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

test("sin PHOTO_SIGNING_SECRET: elegir sigue funcionando si el lugar existe en providers", async function () {
  var saved = process.env.PHOTO_SIGNING_SECRET;
  delete process.env.PHOTO_SIGNING_SECRET;
  try {
    var fetch = h.mockFetch([
      h.rpcRule(),
      { match: /\/rest\/v1\/event_requests\?select=id,dietary_requirements/, reply: function () { return h.response(200, [{ id: REQ, dietary_requirements: null }]); } },
      { match: /\/rest\/v1\/providers\?select=google_place_id&/, reply: function () { return h.response(200, [{ google_place_id: PLACE }]); } },
      { match: /\/rest\/v1\/plan_selections\?select=/, reply: function () { return h.response(200, []); } },
      { match: /\/rest\/v1\/plan_selections$/, reply: function (c) { return h.response(201, [JSON.parse(c.body)]); } }
    ]);
    global.fetch = fetch;
    var res = await choose({ event_request_id: REQ, google_place_id: PLACE });
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(fetch.calls.filter(function (c) { return /plan_selections$/.test(c.url); })[0].body).provider_name, "");
  } finally { process.env.PHOTO_SIGNING_SECRET = saved; }
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
async function openProposal() {
  var res = h.fakeRes(), req = h.fakeReq("GET", {});
  req.query = { code: "AbCdEf123456" };
  await quiet(function () { return proposal(req, res); });
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

test("email de respuesta a propuesta: Google OK y Google caído", async function () {
  var ok = mailWorld(function () { return h.response(200, gPlace(1)); });
  assert.equal(await notify.notifyProposalResponse(CFG, { planInquiryId: "22222222-2222-4222-8222-222222222222", action: "accept", quote: {} }, ok), true);
  var m1 = mailOf(ok);
  assert.match(m1, /Propuesta aceptada · Lugar 1/);
  assert.match(m1, /Calle 1, Palermo/);
  var read1 = decodeURIComponent(ok.calls.filter(function (c) { return /plan_inquiries\?select=/.test(c.url); })[0].url);
  assert.doesNotMatch(read1, /providers\(|provider_name/);

  var down = mailWorld(function () { return h.response(503, {}); });
  assert.equal(await quiet(function () { return notify.notifyProposalResponse(CFG, { planInquiryId: "22222222-2222-4222-8222-222222222222", action: "decline", quote: {} }, down); }), true);
  var m2 = mailOf(down);
  assert.match(m2, /Pidió otra opción · Lugar elegido/);
  assert.match(m2, /Datos del lugar no disponibles en este momento/);
  assert.match(m2, /query_place_id=ChIJabcdefghij0001/);
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
