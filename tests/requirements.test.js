/* F0 · Requisitos alimentarios obligatorios: el servidor controla el pedido GUARDADO
   antes de guardar una elección o una solicitud. Kosher, halal, celiaquía y alergias
   (y cualquier requisito "hard") se coordinan a mano. Si no se puede verificar, se rechaza. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var h = require("./helpers");

process.env.SUPABASE_URL = "https://ejemplo-de-prueba.supabase.co";
process.env.SUPABASE_SECRET_KEY = "clave-de-prueba-no-real";
process.env.RATE_LIMIT_SECRET = "secreto-de-prueba-para-limites-1234567890";
process.env.TURNSTILE_SECRET_KEY = "secreto-turnstile-de-prueba";
process.env.PHOTO_SIGNING_SECRET = "secreto-de-fotos-de-prueba-0123456789abcdef";   // G1B: elegir exige comprobante firmado

var requirements = require("../api/_lib/requirements");
var notify = require("../api/_lib/notify");
var planSelection = require("../api/plan-selection");
var planInquiry = require("../api/plan-inquiry");
var optionToken = require("../api/_lib/option-token");

var REQ = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";
var PLACE = "ChIJabcdefghij1234";
var HOST = "listohtml.vercel.app";
var tomorrow = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);

/* ---------- Regla pura ---------- */

test("evaluate: null y [] no bloquean; preferencias no bloquean", function () {
  assert.deepEqual(requirements.evaluate(null), { ok: true });
  assert.deepEqual(requirements.evaluate(undefined), { ok: true });
  assert.deepEqual(requirements.evaluate([]), { ok: true });
  assert.deepEqual(requirements.evaluate([{ code: "vegan", level: "soft" }, { code: "gluten_free", level: "soft" }]), { ok: true });
});

test("evaluate: kosher, halal, celiaquía, alergia y cualquier 'hard' bloquean", function () {
  [["kosher", "hard"], ["halal", "hard"], ["celiac_safe", "hard"], ["allergy", "hard"], ["vegan", "hard"], ["kids_menu", "hard"]].forEach(function (c) {
    var item = { code: c[0], level: c[1] };
    if (c[0] === "allergy") item.detail = "maní";
    assert.deepEqual(requirements.evaluate([item]), { blocking: [c[0]] }, c[0]);
  });
  // Aunque un dato viejo o manipulado diga "soft", estos cuatro siempre son obligatorios.
  ["kosher", "halal", "celiac_safe", "allergy"].forEach(function (code) {
    assert.deepEqual(requirements.evaluate([{ code: code, level: "soft" }]), { blocking: [code] }, code);
  });
  assert.deepEqual(requirements.evaluate([{ code: "vegan", level: "soft" }, { code: "halal", level: "hard" }]), { blocking: ["halal"] });
});

test("evaluate: datos mal formados → no se puede verificar", function () {
  [{}, "kosher", 1, [null], ["kosher"], [{ code: "pizza", level: "soft" }], [{ code: "vegan" }], [{ code: "vegan", level: "maybe" }], [{ level: "hard" }]]
    .forEach(function (d) { assert.deepEqual(requirements.evaluate(d), { unverifiable: true }, JSON.stringify(d)); });
});

test("el mensaje nunca incluye el detalle de la alergia", function () {
  var e = requirements.explain(Object.assign(new Error("x"), { step: requirements.STEP, code: "HARD_REQUIREMENTS", requirements: ["allergy", "kosher"] }));
  assert.equal(e.status, 409);
  assert.match(e.message, /Alergias, Kosher/);
  assert.match(e.message, /WhatsApp/);
});

/* ---------- Supabase simulado ---------- */

// requestRow: lo que devuelve Supabase para el pedido (o una función que responde).
function supabase(requestRow, extra) {
  extra = extra || {};
  var rules = [
    h.rpcRule(),
    { match: /\/rest\/v1\/event_requests\?select=id,dietary_requirements&id=eq\./, reply: function () {
      if (typeof requestRow === "function") return requestRow();
      return h.response(200, requestRow ? [requestRow] : []);
    } },
    { match: /\/rest\/v1\/providers\?on_conflict=/, reply: function () { return h.response(201, ""); } },
    { match: /\/rest\/v1\/plan_selections\?select=/, reply: function () { return h.response(200, extra.selections || []); } },
    { match: /\/rest\/v1\/plan_selections$/, reply: function (c) { return h.response(201, [Object.assign({ id: "sel-1", status: "interested", created_at: "2026-10-07T12:00:00Z" }, JSON.parse(c.body))]); } },
    { match: /\/rest\/v1\/plan_inquiries\?select=id/, reply: function () { return h.response(200, []); } },
    { match: /\/rest\/v1\/plan_inquiries$/, reply: function () { return h.response(201, ""); } },
    { match: /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify$/, reply: function () { return h.response(200, { success: true, action: "plan_inquiry", hostname: HOST, "error-codes": [] }); } }
  ];
  var fetch = h.mockFetch(rules);
  global.fetch = fetch;
  return fetch;
}
function writes(fetch, table) {
  return fetch.calls.filter(function (c) { return c.method !== "GET" && new RegExp("/rest/v1/" + table + "(\\?|$)").test(c.url); });
}
function quiet(fn) {
  var orig = console.error; console.error = function () {};
  return Promise.resolve().then(fn).finally(function () { console.error = orig; });
}

async function choose(body) {
  var res = h.fakeRes();
  body = Object.assign({ event_request_id: REQ, google_place_id: PLACE }, body);
  if (!("option_token" in body)) body.option_token = optionToken.sign(process.env.PHOTO_SIGNING_SECRET, body.google_place_id);
  await quiet(function () { return planSelection(h.fakeReq("POST", { "content-type": "application/json" }, body), res); });
  return res;
}

var notified;
var realNotify = notify.notifyInquiry;
test.after(function () { notify.notifyInquiry = realNotify; });
function inquiryBody(extra) {
  return Object.assign({ event_request_id: REQ, google_place_id: PLACE, name: "Ana Pérez", phone: "+54 9 11 5555-1234",
    email: "", event_date: tomorrow, approximate_time: "21:00", notes: "", website: "", turnstile_token: "token-de-prueba" }, extra || {});
}
async function advance(body) {
  notified = [];
  notify.notifyInquiry = function (cfg, info) { notified.push(info); return Promise.resolve(true); };
  var res = h.fakeRes();
  await quiet(function () { return planInquiry(h.fakeReq("POST", { "content-type": "application/json", "x-forwarded-host": HOST, host: HOST }, body || inquiryBody()), res); });
  return res;
}

/* ---------- "Elegir esta opción" ---------- */

test("elección normal (sin restricciones, [] o sólo preferencias) se guarda", async function () {
  for (var diet of [null, [], [{ code: "vegan", level: "soft" }]]) {
    var fetch = supabase({ id: REQ, dietary_requirements: diet });
    var res = await choose();
    assert.equal(res.statusCode, 200, JSON.stringify(diet));
    assert.equal(writes(fetch, "plan_selections").length, 1);
  }
});

test("elección con requisito obligatorio → 409 y no se guarda nada", async function () {
  for (var diet of [[{ code: "kosher", level: "hard" }], [{ code: "halal", level: "hard" }], [{ code: "celiac_safe", level: "hard" }],
    [{ code: "allergy", level: "hard", detail: "maní" }], [{ code: "vegan", level: "hard" }]]) {
    var fetch = supabase({ id: REQ, dietary_requirements: diet });
    var res = await choose();
    assert.equal(res.statusCode, 409, diet[0].code);
    assert.match(res.json().error, /coordinamos personalmente/);
    assert.equal(res.body.indexOf("maní"), -1, "no expone el detalle de la alergia");
    assert.equal(writes(fetch, "plan_selections").length, 0);
  }
});

test("intento de saltar el control: lo que diga el navegador no importa", async function () {
  var fetch = supabase({ id: REQ, dietary_requirements: [{ code: "kosher", level: "hard" }] });
  var res = await choose({ event_request_id: REQ, google_place_id: PLACE, dietary_requirements: [], hard: false, override: true });
  assert.equal(res.statusCode, 409);
  assert.equal(writes(fetch, "plan_selections").length, 0);
});

test("si no se puede verificar el pedido → se rechaza sin guardar", async function () {
  var cases = [
    function () { return h.response(400, { code: "42703", message: "column event_requests.dietary_requirements does not exist" }); },
    function () { return h.response(500, { code: "XX000", message: "caído" }); },
    function () { return Promise.reject(new Error("sin red")); },
    function () { return h.response(200, [{ id: REQ }]); },                                      // falta el campo
    function () { return h.response(200, [{ id: REQ, dietary_requirements: "kosher" }]); }       // mal formado
  ];
  for (var reply of cases) {
    var fetch = supabase(reply);
    var res = await choose();
    assert.equal(res.statusCode, 503);
    assert.equal(writes(fetch, "plan_selections").length, 0);
  }
  var missing = supabase(null);
  assert.equal((await choose()).statusCode, 404, "pedido inexistente");
  assert.equal(writes(missing, "plan_selections").length, 0);
});

/* ---------- "Quiero avanzar" (con Turnstile) ---------- */

test("envío normal con Turnstile sigue funcionando (sin restricciones o sólo preferencias)", async function () {
  for (var diet of [null, [], [{ code: "lactose_free", level: "soft" }]]) {
    var fetch = supabase({ id: REQ, dietary_requirements: diet }, { selections: [{ id: "sel-1", provider_google_place_id: PLACE }] });
    var res = await advance();
    assert.equal(res.statusCode, 200, JSON.stringify(diet));
    assert.equal(fetch.calls.filter(function (c) { return /siteverify/.test(c.url); }).length, 1);
    assert.equal(writes(fetch, "plan_inquiries").length, 1);
    assert.equal(notified.length, 1);
  }
});

test("'Quiero avanzar' con requisito obligatorio → 409, sin solicitud ni email (aunque haya una elección guardada)", async function () {
  for (var diet of [[{ code: "kosher", level: "hard" }], [{ code: "allergy", level: "hard", detail: "nueces" }], [{ code: "celiac_safe", level: "soft" }]]) {
    var fetch = supabase({ id: REQ, dietary_requirements: diet }, { selections: [{ id: "sel-1", provider_google_place_id: PLACE }] });
    var res = await advance(inquiryBody({ dietary_requirements: [] }));
    assert.equal(res.statusCode, 409, diet[0].code);
    assert.equal(writes(fetch, "plan_inquiries").length, 0);
    assert.equal(notified.length, 0);
    assert.equal(res.body.indexOf("nueces"), -1);
  }
});

test("'Quiero avanzar' sin poder verificar el pedido → 503, sin solicitud ni email", async function () {
  var fetch = supabase(function () { return h.response(400, { code: "PGRST204", message: "dietary_requirements" }); },
    { selections: [{ id: "sel-1", provider_google_place_id: PLACE }] });
  var res = await advance();
  assert.equal(res.statusCode, 503);
  assert.equal(writes(fetch, "plan_inquiries").length, 0);
  assert.equal(notified.length, 0);
});

test("el control no reemplaza a Turnstile: sin token se rechaza antes de leer el pedido", async function () {
  var fetch = supabase({ id: REQ, dietary_requirements: null }, { selections: [{ id: "sel-1", provider_google_place_id: PLACE }] });
  var res = await advance(inquiryBody({ turnstile_token: "" }));
  assert.equal(res.statusCode, 400);
  assert.equal(fetch.calls.filter(function (c) { return /event_requests/.test(c.url); }).length, 0);
  assert.equal(writes(fetch, "plan_inquiries").length, 0);
});
