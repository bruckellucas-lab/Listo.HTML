/* P1C: fechas reales y cookies inválidas. Sin servicios externos. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var h = require("./helpers");
var bookings = require("../api/_lib/bookings");
var inquiries = require("../api/_lib/inquiries");
var dietary = require("../api/_lib/dietary");
var auth = require("../api/_lib/admin-auth");

process.env.ADMIN_PASSWORD = "p1c-password-local-solo-tests";
process.env.SUPABASE_URL = "https://ejemplo-de-prueba.supabase.co";
process.env.SUPABASE_SECRET_KEY = "clave-local-solo-tests";
var INQ = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
var QUOTE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
var TODAY = "2026-10-06";

async function call(file, method, body, cookie) {
  var res = h.fakeRes();
  await require("../api/" + file)(h.fakeReq(method, {
    cookie: cookie === undefined ? auth.sessionCookie().split(";")[0] : cookie,
    "content-type": "application/json", "x-listo-admin": "1"
  }, body), res);
  return res;
}

test("calendario: rechaza días imposibles y respeta años bisiestos y siglos", function () {
  ["2027-02-31", "2027-02-29", "2028-02-30", "2026-04-31", "1900-02-29", "2100-02-29",
    "2026-00-01", "2026-13-01", "2026-01-00", "2026-01-32", "2026-2-01", "hola", "", null]
    .forEach(function (d) { assert.equal(bookings.validDate(d), false, String(d)); });
  ["2027-02-28", "2028-02-29", "2000-02-29", "2400-02-29", "2026-04-30", "2026-12-31"]
    .forEach(function (d) { assert.equal(bookings.validDate(d), true, d); });
});

test("solicitudes: rechaza fecha imposible sin normalizarla; admite 29 de febrero real", function () {
  function form(day) { return { name: "Persona de prueba", phone: "1155555555", event_date: day, approximate_time: "21:00" }; }
  ["2027-02-31", "2027-02-29", "2026-11-31"].forEach(function (day) {
    assert.match(inquiries.validate(form(day), TODAY).error || "", /fecha del plan/, day);
  });
  assert.equal(inquiries.validate(form("2028-02-29"), TODAY).data.event_date, "2028-02-29");
  assert.match(inquiries.validate(form("2026-10-05"), TODAY).error, /anterior/);
  assert.match(inquiries.validate(form("2029-01-01"), TODAY).error, /dos años/);
});

test("reservas: confirmación y cobro estimado exigen fechas reales", function () {
  var form = { plan_inquiry_id: INQ, provider_quote_id: QUOTE, acceptance_source: "manual",
    acceptance_channel: "whatsapp", acceptance_note: "Aceptó por WhatsApp.", final_total_amount: "1000",
    currency: "ARS", commission_type: "percentage", commission_rate: "10", confirmed_at: "2026-10-05" };
  assert.match(bookings.validateConfirm(Object.assign({}, form, { confirmed_at: "2026-02-31" }), TODAY).error || "", /confirmación/);
  assert.match(bookings.validateConfirm(Object.assign({}, form, { commission_due_date: "2027-02-31" }), TODAY).error || "", /cobro/);
  assert.equal(bookings.validateConfirm(Object.assign({}, form, { commission_due_date: "2028-02-29" }), TODAY).data.commission_due_date, "2028-02-29");
});

test("atributos: verificación, revisión y evidencia rechazan fechas imposibles", function () {
  var form = { provider_google_place_id: "ChIJabcdefghij1234", attribute: "vegan_options", status: "verified", source_type: "official_website" };
  ["verified_at", "review_after", "evidence_valid_until"].forEach(function (field) {
    var body = Object.assign({}, form);
    body[field] = field === "verified_at" ? "2026-02-31" : "2027-02-31";
    assert.ok(dietary.validate(body, TODAY).error, field);
    body[field] = "2024-02-29";
    assert.ok(dietary.validate(body, "2024-02-29").data, field + " bisiesto");
  });
});

test("cotizaciones: rechaza fechas imposibles antes de guardar; conserva fechas válidas", async function (t) {
  var writes = [];
  t.mock.method(global, "fetch", h.mockFetch([
    { match: /\/plan_inquiries\?/, reply: function () { return h.response(200, [{ id: INQ, status: "inquiry_requested" }]); } },
    { match: /\/provider_quotes\?/, reply: function (c) { writes.push(JSON.parse(c.body)); return h.response(201, [{ id: QUOTE }]); } }
  ]));
  for (var field of ["received_at", "valid_until"]) {
    var form = { plan_inquiry_id: INQ, total_price: "1000" };
    form[field] = field === "received_at" ? "2026-02-31" : "2027-02-31";
    var bad = await call("admin-quotes.js", "POST", form);
    assert.equal(bad.statusCode, 400, field);
    assert.equal(writes.length, 0, "sin escrituras para fecha inválida");
  }
  var ok = await call("admin-quotes.js", "POST", { plan_inquiry_id: INQ, total_price: "1000", received_at: "2024-02-29", valid_until: "2028-02-29" });
  assert.equal(ok.statusCode, 200);
  assert.equal(writes[0].received_at, "2024-02-29T15:00:00.000Z");
  assert.equal(writes[0].valid_until, "2028-02-29");
});

test("comisión pagada: rechaza fecha imposible antes de escribir", async function (t) {
  var writes = [];
  t.mock.method(global, "fetch", h.mockFetch([{ match: /\/plan_bookings\?/, reply: function (c) {
    if (c.method === "PATCH") { writes.push(JSON.parse(c.body)); return h.response(200, [{ id: INQ }]); }
    return h.response(200, [{ id: INQ, booking_status: "confirmed", commission_status: "pending" }]);
  } }]));
  var bad = await call("admin-bookings.js", "PATCH", { booking_id: INQ, action: "paid", paid_at: "2026-02-31" });
  assert.equal(bad.statusCode, 400);
  assert.equal(writes.length, 0);
  var ok = await call("admin-bookings.js", "PATCH", { booking_id: INQ, action: "paid", paid_at: "2024-02-29" });
  assert.equal(ok.statusCode, 200);
  assert.equal(writes[0].commission_paid_at, "2024-02-29T15:00:00.000Z");
});

test("cookies malformadas: autenticación devuelve false sin excepciones", function () {
  ["%", "%ZZ", "%E0%A4%A", "%C0%AF", "", "sin-firma"].forEach(function (value) {
    assert.equal(auth.isAuthenticated(h.fakeReq("GET", { cookie: "listo_admin=" + value })), false, value);
  });
  var cookie = auth.sessionCookie().split(";")[0];
  assert.equal(auth.isAuthenticated(h.fakeReq("GET", { cookie: cookie })), true);
  assert.equal(auth.isAuthenticated(h.fakeReq("GET", { cookie: cookie.replace(/\./, "%2E") })), true);
  assert.equal(auth.isAuthenticated(h.fakeReq("GET", { cookie: "otra=%; " + cookie })), true, "otra cookie inválida no rompe la sesión");
  assert.equal(auth.isAuthenticated(h.fakeReq("GET", { cookie: "listo_admin=%; " + cookie })), false, "no busca una segunda cookie para aceptar una sesión inválida");
});

test("cookie malformada: login informa sin sesión y todos los endpoints del panel rechazan", async function (t) {
  t.mock.method(global, "fetch", function () { throw new Error("No debe acceder a servicios externos"); });
  var login = await call("admin-login.js", "GET", undefined, "listo_admin=%");
  assert.equal(login.statusCode, 200);
  assert.equal(login.json().authenticated, false);
  for (var file of ["admin-inquiries.js", "admin-quotes.js", "admin-providers.js", "admin-proposals.js", "admin-bookings.js"]) {
    assert.equal((await call(file, "POST", {}, "listo_admin=%")).statusCode, 401, file);
  }
});

test("propuesta pública: cookie malformada no impide leerla ni concede preview admin", async function (t) {
  var proposals = require("../api/_lib/proposals");
  t.mock.method(proposals, "loadByCode", async function () { return { id: INQ, status: "proposal_sent" }; });
  t.mock.method(global, "fetch", async function () { return h.response(204, ""); });
  var res = h.fakeRes();
  var req = h.fakeReq("GET", { cookie: "listo_admin=%" });
  req.query = { code: "Ab3dE9xYz2Qk" };
  await require("../api/proposal")(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().preview, undefined);
});
