/* Pruebas de /api/event-request y api/_lib/event-requests.js:
   validación, restricciones alimentarias null / [] / lista, límites y guardado. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var h = require("./helpers");

process.env.SUPABASE_URL = "https://ejemplo-de-prueba.supabase.co";
process.env.SUPABASE_SECRET_KEY = "clave-de-prueba-no-real";
process.env.RATE_LIMIT_SECRET = "secreto-de-prueba-para-limites-1234567890";

var requests = require("../api/_lib/event-requests");
var handler = require("../api/event-request");

var ID = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";
function base(extra) {
  return Object.assign({
    id: ID, original_prompt: "Cena para 6 en Palermo", event_type: "Cena", guests: 6, zone: "Palermo",
    budget: 120000, needs: ["Lugar", "Comida"], dietary_requirements: null, status: "new"
  }, extra || {});
}
function ok(extra) { var r = requests.validate(base(extra)); assert.equal(r.error, undefined, r.error); return r.data; }
function bad(extra) { var r = requests.validate(base(extra)); assert.ok(r.error, "tenía que rechazar: " + JSON.stringify(extra)); return r.error; }

test("pedido normal: se guarda tal cual, con status new", function () {
  var d = ok();
  assert.deepEqual(d, { id: ID, original_prompt: "Cena para 6 en Palermo", event_type: "Cena", guests: 6, zone: "Palermo",
    budget: 120000, needs: ["Lugar", "Comida"], dietary_requirements: null, status: "new" });
});

test("restricciones: null, [] y lista se respetan exactamente", function () {
  assert.equal(ok({ dietary_requirements: null }).dietary_requirements, null, "null = nunca se tocaron");
  assert.deepEqual(ok({ dietary_requirements: [] }).dietary_requirements, [], "[] = se tocaron y no quedó ninguna");
  var list = [{ code: "vegan", level: "soft" }, { code: "celiac_safe", level: "hard" }, { code: "allergy", level: "hard", detail: "maní" }];
  assert.deepEqual(ok({ dietary_requirements: list }).dietary_requirements, list);
  var old = base(); delete old.dietary_requirements;
  var r = requests.validate(old);
  assert.equal("dietary_requirements" in r.data, false, "versión vieja de la web: no se toca la columna");
});

test("restricciones: no se corrige ni se inventa nada (se rechaza)", function () {
  bad({ dietary_requirements: [{ code: "kosher", level: "soft" }] });
  bad({ dietary_requirements: [{ code: "halal", level: "soft" }] });
  bad({ dietary_requirements: [{ code: "celiac_safe", level: "soft" }] });
  bad({ dietary_requirements: [{ code: "gluten_free", level: "hard" }] });
  bad({ dietary_requirements: [{ code: "allergy", level: "hard" }] }, "alergia sin detalle");
  bad({ dietary_requirements: [{ code: "allergy", level: "hard", detail: "x" }] });
  bad({ dietary_requirements: [{ code: "allergy", level: "hard", detail: "a".repeat(201) }] });
  bad({ dietary_requirements: [{ code: "vegan", level: "soft", detail: "algo" }] });
  bad({ dietary_requirements: [{ code: "vegan", level: "soft" }, { code: "vegan", level: "hard" }] });
  bad({ dietary_requirements: [{ code: "pizza", level: "soft" }] });
  bad({ dietary_requirements: [{ code: "vegan", level: "maybe" }] });
  bad({ dietary_requirements: [{ code: "vegan", level: "soft", extra: 1 }] });
  bad({ dietary_requirements: ["vegan"] });
  bad({ dietary_requirements: {} });
  bad({ dietary_requirements: "vegan" });
  bad({ dietary_requirements: requests.DIET_CODES.concat(["kids_menu", "vegan"]).map(function (c) { return { code: c, level: "soft" }; }) });
  ok({ dietary_requirements: [{ code: "kosher", level: "hard" }, { code: "gluten_free", level: "soft" }, { code: "vegetarian", level: "hard" }] });
});

test("UUID: obligatorio y válido", function () {
  bad({ id: undefined });
  bad({ id: "" });
  bad({ id: "123" });
  bad({ id: "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0" });
  bad({ id: "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0bz" });
  bad({ id: "' or 1=1 --" });
  bad({ id: 12345 });
  assert.equal(ok({ id: ID.toUpperCase() }).id, ID, "se guarda en minúsculas");
});

test("textos: límites de largo", function () {
  bad({ original_prompt: "corto" });
  bad({ original_prompt: "      x      " });
  bad({ original_prompt: "a".repeat(2001) });
  ok({ original_prompt: "a".repeat(2000) });
  bad({ original_prompt: 123 });
  bad({ event_type: "a".repeat(121) });
  bad({ zone: "a".repeat(121) });
  bad({ zone: 5 });
  assert.equal(ok({ zone: "  " }).zone, null);
  assert.equal(ok({ event_type: "  Cumple  " }).event_type, "Cumple");
});

test("números: personas y presupuesto", function () {
  bad({ guests: 0 });
  bad({ guests: -3 });
  bad({ guests: 2001 });
  bad({ guests: 2.5 });
  bad({ guests: "6" });
  ok({ guests: 2000 });
  assert.equal(ok({ guests: null }).guests, null);
  bad({ budget: 0 });
  bad({ budget: 1e13 });
  bad({ budget: "1000" });
  ok({ budget: 999999999999 });
});

test("necesidades, estado y campos extra", function () {
  bad({ needs: "Lugar" });
  bad({ needs: [1] });
  bad({ needs: [""] });
  bad({ needs: ["a".repeat(101)] });
  bad({ needs: new Array(31).fill("x") });
  assert.deepEqual(ok({ needs: null }).needs, []);
  bad({ status: "confirmed" });
  assert.equal(ok({ status: undefined }).status, "new");
  bad({ contact_email: "x@y.z" });
  bad({ created_at: "2020-01-01" });
  bad({ event_type: null, guests: null, zone: null, budget: null, needs: [] }, "pedido vacío");
});

/* ---------- La función completa ---------- */

function setup(rules) {
  var fetch = h.mockFetch([h.rpcRule()].concat(rules || [{ match: /\/rest\/v1\/event_requests$/, reply: function () { return h.response(201, ""); } }]));
  global.fetch = fetch;
  return fetch;
}
async function call(body, headers, ip) {
  var res = h.fakeRes();
  await handler(h.fakeReq("POST", Object.assign({ "content-type": "application/json" }, headers || {}), body, ip), res);
  return res;
}

test("POST guarda con la clave secreta y devuelve sólo { ok, id }", async function () {
  var fetch = setup();
  var res = await call(base({ dietary_requirements: [] }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true, id: ID });
  var insert = fetch.calls.filter(function (c) { return /event_requests$/.test(c.url); })[0];
  assert.equal(insert.method, "POST");
  assert.equal(insert.headers.apikey, "clave-de-prueba-no-real");
  assert.equal(insert.headers.Prefer, "return=minimal");
  assert.deepEqual(JSON.parse(insert.body).dietary_requirements, []);
});

test("POST: método, Content-Type y tamaño", async function () {
  setup();
  var r = h.fakeRes();
  await handler(h.fakeReq("GET", {}), r);
  assert.equal(r.statusCode, 405);
  assert.equal((await call(base(), { "content-type": "text/plain" })).statusCode, 415);
  assert.equal((await call(base(), { "content-type": "application/x-www-form-urlencoded" })).statusCode, 415);
  assert.equal((await call(base(), { "content-length": "99999" })).statusCode, 413);
  assert.equal((await call(base({ original_prompt: "€".repeat(12000) }))).statusCode, 413);
  assert.equal((await call(base({ original_prompt: "€".repeat(2000), needs: new Array(30).fill("ñ€".repeat(50)), dietary_requirements: [{ code: "allergy", level: "hard", detail: "€".repeat(200) }] }))).statusCode, 200, "el pedido válido más pesado entra");
  assert.equal((await call(base({ id: "nope" }))).statusCode, 400);
  assert.equal((await call("{no es json")).statusCode, 400);
});

test("POST: si 'needs' es texto en Supabase, reintenta como 'Lugar, Comida'", async function () {
  var fetch = setup([{ match: /\/rest\/v1\/event_requests$/, reply: function (c) {
    return Array.isArray(JSON.parse(c.body).needs) ? h.response(400, { code: "22P02", message: "malformed array literal" }) : h.response(201, "");
  } }]);
  var res = await call(base());
  assert.equal(res.statusCode, 200);
  var inserts = fetch.calls.filter(function (c) { return /event_requests$/.test(c.url); });
  assert.equal(inserts.length, 2);
  assert.equal(JSON.parse(inserts[1].body).needs, "Lugar, Comida");
});

test("POST: si falta la columna dietary_requirements, guarda sin ella", async function () {
  var fetch = setup([{ match: /\/rest\/v1\/event_requests$/, reply: function (c) {
    return "dietary_requirements" in JSON.parse(c.body)
      ? h.response(400, { code: "PGRST204", message: "Could not find the 'dietary_requirements' column" }) : h.response(201, "");
  } }]);
  assert.equal((await call(base({ dietary_requirements: [{ code: "vegan", level: "soft" }] }))).statusCode, 200);
  var inserts = fetch.calls.filter(function (c) { return /event_requests$/.test(c.url); });
  assert.equal("dietary_requirements" in JSON.parse(inserts[1].body), false);
});

test("POST: errores de Supabase no exponen detalles", async function () {
  setup([{ match: /\/rest\/v1\/event_requests$/, reply: function () { return h.response(500, { code: "XX000", message: "detalle interno secreto" }); } }]);
  var res = await call(base());
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.indexOf("secreto"), -1);
  setup([{ match: /\/rest\/v1\/event_requests$/, reply: function () { return h.response(409, { code: "23505", message: "duplicate key" }); } }]);
  assert.equal((await call(base())).statusCode, 409);
});

test("POST: con el límite superado responde 429 y no guarda", async function () {
  var fetch = h.mockFetch([h.rpcRule(0), { match: /event_requests$/, reply: function () { return h.response(201, ""); } }]);
  global.fetch = fetch;
  var res = await call(base());
  assert.equal(res.statusCode, 429);
  assert.ok(res.headers["retry-after"]);
  assert.equal(fetch.calls.filter(function (c) { return /event_requests$/.test(c.url); }).length, 0);
});

test("POST: sin la migration de límites, se frena (503) en vez de fallar en silencio", async function () {
  var fetch = h.mockFetch([{ match: /rpc\/listo_rate_limit_hit$/, reply: function () { return h.response(404, { code: "PGRST202", message: "Could not find the function" }); } },
    { match: /event_requests$/, reply: function () { return h.response(201, ""); } }]);
  global.fetch = fetch;
  var logs = [], orig = console.error;
  console.error = function () { logs.push(Array.prototype.join.call(arguments, " ")); };
  try { var res = await call(base()); } finally { console.error = orig; }
  assert.equal(res.statusCode, 503);
  assert.equal(fetch.calls.filter(function (c) { return /event_requests$/.test(c.url); }).length, 0);
  assert.ok(logs.some(function (l) { return /falta correr la migration/.test(l); }), "el registro dice qué falta");
});
