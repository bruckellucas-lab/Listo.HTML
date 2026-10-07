/* Cotizaciones: concurrencia y guardado parcial, con Supabase simulado. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var h = require("./helpers");
var auth = require("../api/_lib/admin-auth");
var handler = require("../api/admin-quotes");

process.env.ADMIN_PASSWORD = "password-local-cotizaciones-tests";
process.env.SUPABASE_URL = "https://ejemplo-de-prueba.supabase.co";
process.env.SUPABASE_SECRET_KEY = "clave-local-solo-tests";
var INQ = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
var QUOTE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// El cambio concurrente ocurre DESPUÉS de leer la solicitud, al guardar la cotización.
// El simulador aplica las condiciones del PATCH al estado actual, como PostgREST.
function database(t, opts) {
  opts = opts || {};
  var row = { id: INQ, status: opts.initial || "inquiry_requested", updated_at: "2026-10-01T12:00:00Z" };
  var quotes = [], patches = [], reads = 0;
  t.mock.method(global, "fetch", async function (url, req) {
    var parsed = new URL(url), q = parsed.searchParams;
    if (parsed.pathname === "/rest/v1/provider_quotes") {
      assert.equal(req.method, "POST");
      if (opts.insertFails) return h.response(503, { code: "AUDIT_INSERT", message: "fallo de prueba" });
      quotes.push(Object.assign({ id: QUOTE }, JSON.parse(req.body)));
      if (opts.concurrent) row.status = opts.concurrent;
      return h.response(201, [quotes[0]]);
    }
    assert.equal(parsed.pathname, "/rest/v1/plan_inquiries");
    if (req.method === "GET") {
      reads++;
      if (reads === 1 && opts.readFails || reads > 1 && opts.refreshFails) return h.response(503, { code: "AUDIT_READ", message: "fallo de prueba" });
      return h.response(200, opts.missing || reads > 1 && opts.removed ? [] : [Object.assign({}, row)]);
    }
    assert.equal(req.method, "PATCH");
    var patch = JSON.parse(req.body);
    patches.push({ query: q, body: patch });
    if (opts.patchFails) return h.response(503, { code: "AUDIT_PATCH", message: "fallo de prueba" });
    if (q.has("status") && q.get("status") !== "eq." + row.status) return h.response(200, []);
    Object.assign(row, patch);
    if (opts.patchResponseLost) throw new Error("respuesta perdida después de actualizar");
    return h.response(200, [Object.assign({}, row)]);
  });
  t.mock.method(console, "error", function () {});
  return { row: row, quotes: quotes, patches: patches };
}

async function save() {
  var res = h.fakeRes();
  await handler(h.fakeReq("POST", { cookie: auth.sessionCookie().split(";")[0],
    "x-listo-admin": "1", "content-type": "application/json" }, { plan_inquiry_id: INQ, total_price: "1000" }), res);
  return { status: res.statusCode, data: res.json() };
}

for (let status of ["confirmed", "cancelled", "completed"]) {
  test("cotización: conserva cambio concurrente a " + status, async function (t) {
    for (var initial of ["inquiry_requested", "provider_contacted", "quoted"]) {
      var db = database(t, { initial: initial, concurrent: status });
      var out = await save();
      assert.equal(db.row.status, status, initial);
      assert.equal(out.status, 200, "la cotización YA se guardó: no pedir un nuevo POST");
      assert.equal(out.data.ok, true);
      assert.equal(out.data.quote.id, QUOTE);
      assert.equal(out.data.item.status, status);
      assert.equal(out.data.status_changed, false);
      assert.match(out.data.warning || "", /guardada/);
      assert.equal(db.quotes.length, 1);
    }
  });
}

test("cotización: no pisa un cambio concurrente entre estados iniciales", async function (t) {
  var db = database(t, { concurrent: "provider_contacted" });
  var out = await save();
  assert.equal(db.row.status, "provider_contacted");
  assert.equal(out.data.item.status, "provider_contacted");
  assert.equal(out.data.status_changed, false);
});

test("cotización: sin concurrencia mantiene las transiciones existentes", async function (t) {
  for (var initial of ["inquiry_requested", "provider_contacted", "quoted", "confirmed", "cancelled", "completed"]) {
    var db = database(t, { initial: initial });
    var out = await save();
    var moves = ["inquiry_requested", "provider_contacted", "quoted"].includes(initial);
    assert.equal(out.status, 200);
    assert.equal(db.row.status, moves ? "quoted" : initial, initial);
    assert.equal(out.data.status_changed, moves && initial !== "quoted", initial);
    assert.equal(out.data.warning, undefined, initial);
    assert.equal(db.quotes.length, 1);
    assert.notEqual(db.row.updated_at, "2026-10-01T12:00:00Z");
  }
});

test("cotización: PATCH fallido informa guardado parcial, conserva quote y no reintenta INSERT", async function (t) {
  var db = database(t, { patchFails: true });
  var out = await save();
  assert.equal(out.status, 200);
  assert.equal(out.data.ok, true);
  assert.equal(out.data.quote.id, QUOTE);
  assert.equal(out.data.status_changed, false);
  assert.equal(out.data.status_pending, true);
  assert.match(out.data.warning || "", /guardada/);
  assert.equal(db.row.status, "inquiry_requested");
  assert.equal(db.quotes.length, 1);
  assert.equal(db.patches.length, 1);
});

test("cotización: respuesta de PATCH perdida no provoca otro INSERT ni afirma transición", async function (t) {
  var db = database(t, { patchResponseLost: true });
  var out = await save();
  assert.equal(out.status, 200);
  assert.equal(out.data.quote.id, QUOTE);
  assert.equal(out.data.status_changed, false);
  assert.equal(out.data.status_pending, true);
  assert.equal(db.row.status, "quoted");
  assert.equal(db.quotes.length, 1);
});

test("cotización: conflicto más lectura fallida sigue confirmando cotización guardada", async function (t) {
  var db = database(t, { concurrent: "completed", refreshFails: true });
  var out = await save();
  assert.equal(out.status, 200);
  assert.equal(out.data.quote.id, QUOTE);
  assert.equal(out.data.item, null, "no devolver el estado viejo como si fuera actual");
  assert.equal(out.data.status_changed, false);
  assert.match(out.data.warning || "", /guardada/);
  assert.equal(db.row.status, "completed");
  assert.equal(db.quotes.length, 1);
});

test("cotización: solicitud ausente al refrescar no transforma el guardado en error", async function (t) {
  var db = database(t, { concurrent: "cancelled", removed: true });
  var out = await save();
  assert.equal(out.status, 200);
  assert.equal(out.data.quote.id, QUOTE);
  assert.equal(out.data.item, null);
  assert.equal(out.data.status_changed, false);
  assert.match(out.data.warning || "", /guardada/);
  assert.equal(db.quotes.length, 1);
});

test("cotización: fallo anterior al INSERT sigue siendo error y no guarda", async function (t) {
  for (var opts of [{ readFails: true }, { insertFails: true }, { missing: true }]) {
    var db = database(t, opts);
    var out = await save();
    assert.equal(out.status, opts.missing ? 404 : 502);
    assert.equal(out.data.ok, false);
    assert.equal(db.quotes.length, 0);
    assert.equal(db.patches.length, 0);
  }
});

test("panel: guardado parcial muestra aviso, incorpora una cotización y conserva el estado", async function () {
  var fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
  var html = fs.readFileSync(path.join(h.ROOT, "admin/index.html"), "utf8");
  var start = html.indexOf('api("POST", "/api/admin-quotes", v).then');
  var end = html.indexOf('save.textContent = "Guardar cotización"; });', start) + 'save.textContent = "Guardar cotización"; });'.length;
  var item = { id: INQ, status: "confirmed", quotes: [] }, messages = [], calls = 0;
  var error = { hidden: true }, button = { disabled: true };
  var warning = "La cotización quedó guardada, pero no pudimos confirmar la actualización del estado.";
  var context = { it: item, v: {}, err: error, save: button, saving: true,
    api: async function (method, url) {
      calls++;
      assert.equal(method, "POST");
      assert.equal(url, "/api/admin-quotes");
      return { ok: true, quote: { id: QUOTE }, item: null, status_changed: false, warning: warning };
    },
    toast: function (msg) { messages.push(msg); }, render: function () {}, openDetail: function () {} };
  await vm.runInNewContext(html.slice(start, end), context);
  assert.equal(calls, 1);
  assert.equal(item.quotes.length, 1);
  assert.equal(item.quotes[0].id, QUOTE);
  assert.equal(item.status, "confirmed");
  assert.deepEqual(messages, [warning]);
  assert.equal(error.hidden, true);
  assert.equal(button.disabled, false);
});
