"use strict";
var test = require("node:test"), assert = require("node:assert/strict");
var h = require("./helpers"), auth = require("../api/_lib/admin-auth"), handler = require("../api/admin-inquiries");
var fixture = require("./fixtures/admin/inbox");
process.env.ADMIN_PASSWORD = "local-inbox-password-123456789";
process.env.SUPABASE_URL = "https://synthetic.invalid";
process.env.SUPABASE_SECRET_KEY = "synthetic-test-key";
async function call(query, search, headers) {
  var req = h.fakeReq("GET", Object.assign({ cookie: auth.sessionCookie().split(";")[0], "x-listo-search": encodeURIComponent(search || "") }, headers));
  req.query = query || {};
  var res = h.fakeRes(); await handler(req, res); return res;
}
async function page(query, search) { var res = await call(query, search); assert.equal(res.statusCode, 200, res.body); return res.json(); }
function world(t, rows, opts) { var f = fixture.transport(rows, opts); t.mock.method(global, "fetch", f); t.mock.method(console, "error", function () {}); return f; }
async function all(status, search) {
  var out = [], pages = [], cursor;
  do {
    var p = await page(Object.assign({ status: status }, cursor ? { cursor: cursor } : {}), search);
    out = out.concat(p.items); pages.push(p); cursor = p.next_cursor;
    assert.ok(pages.length < 100, "pagination must terminate");
  } while (cursor);
  return { items: out, pages: pages };
}
test("CO-2a >500: abiertas filtradas antes del límite, incluida la más antigua", async function (t) {
  var rows = Array.from({ length: 620 }, function (_, n) { return fixture.inquiry(n + 1, n < 115 ? "inquiry_requested" : "completed"); });
  var f = world(t, rows);
  var result = await all("open");
  assert.equal(result.items.length, 115); assert.equal(result.pages.length, 3);
  assert.equal(new Set(result.items.map(function (r) { return r.id; })).size, 115);
  assert.equal(result.items.at(-1).id, fixture.id(1));
  result.pages.forEach(function (p) { assert.equal(p.total, 115); });
  assert.deepEqual(result.pages.map(function (p) { return p.count; }), [50, 50, 15]);
  var requests = f.calls.filter(function (c) { return c.url.includes("plan_inquiries"); });
  requests.forEach(function (c) { assert.equal(new URL(c.url).searchParams.get("status"), "in.(inquiry_requested,provider_contacted,quoted,confirmed)"); });
  var everything = await all("all"); assert.equal(everything.items.length, 620); assert.equal(everything.pages[0].total, 620);
});
test("CO-2a cursor: empates, microsegundos e inserciones/borrados no desplazan páginas", async function (t) {
  var rows = Array.from({ length: 130 }, function (_, n) { return fixture.inquiry(n + 1); }); world(t, rows);
  var first = await page({ status: "open" });
  var removed = rows.findIndex(function (r) { return r.id === first.items[0].id; }); rows.splice(removed, 1);
  var newest = fixture.inquiry(999); newest.created_at = "2099-01-01T00:00:00Z"; rows.push(newest);
  var between = fixture.inquiry(998); between.created_at = "2026-10-01T12:00:01.000000Z"; rows.push(between);
  // Updates of already loaded commercial state do not change the creation cursor.
  rows.find(function (r) { return r.id === first.items[1].id; }).status = "completed";
  var result = first.items.slice(), cursor = first.next_cursor;
  while (cursor) { var p = await page({ status: "open", cursor: cursor }); result = result.concat(p.items); cursor = p.next_cursor; }
  assert.equal(result.length, 130); assert.equal(new Set(result.map(function (r) { return r.id; })).size, 130);
  assert.equal(result.at(-1).id, fixture.id(1));
  assert.equal(result.some(function (r) { return r.id === newest.id || r.id === between.id; }), false);
  var refreshed = await page({ status: "open" }); assert.equal(refreshed.items[0].id, between.id);
});
test("CO-2a propuesta vigente: filtros derivados y totales antes de paginar", async function (t) {
  var rows = Array.from({ length: 580 }, function (_, n) { return fixture.inquiry(n + 1, "quoted"); });
  rows.forEach(function (r, n) {
    r.plan_proposals = [{ id: fixture.id(8000 + n), created_at: "2026-10-01T12:00:00Z", status: "proposal_accepted" }];
    if (n >= 105) r.plan_proposals.push({ id: fixture.id(9000 + n), created_at: "2026-10-02T12:00:00Z", status: "proposal_sent" });
    r.plan_proposals.push({ id: fixture.id(10000 + n), created_at: "2026-10-03T12:00:00Z", status: "proposal_replaced" });
  });
  var f = world(t, rows, { cap: 37 });
  var accepted = await all("proposal_accepted");
  assert.equal(accepted.items.length, 105); accepted.pages.forEach(function (p) { assert.equal(p.total, 105); });
  assert.equal(accepted.items.at(-1).id, fixture.id(1));
  assert.ok(accepted.items.every(function (r) { return r.contact_label === "P.S"; }));
  var quoted = await all("quoted"); assert.equal(quoted.items.length, 475); assert.equal(quoted.pages[0].total, 475);
  assert.equal(new Set(quoted.items.map(function (r) { return r.id; })).size, 475);
  var scans = f.calls.filter(function (c) { return new URL(c.url).searchParams.get("select") === "id,created_at,status,plan_proposals!plan_proposals_plan_inquiry_id_fkey(status)"; });
  assert.ok(scans.length > 10);
});
test("CO-2a bandeja sin contactos/prompt/restricciones ni notas; detalle por ID mantiene contexto", async function (t) {
  var row = fixture.inquiry(1); var f = world(t, [row]);
  var list = await page({ status: "all" });
  assert.deepEqual(Object.keys(list.items[0]).sort(), ["id", "created_at", "status", "view_status", "notification_status", "event_date", "approximate_time", "contact_label"].sort());
  assert.doesNotMatch(JSON.stringify(list), /Persona|example.invalid|1234|PRIVAD|plan_selections|quotes|bookings|public_code/);
  f.calls.filter(function (c) { return c.url.includes("plan_inquiries"); }).forEach(function (c) {
    assert.doesNotMatch(new URL(c.url).searchParams.get("select"), /contact_phone|contact_email|notes|original_prompt|dietary|provider_quotes|plan_bookings/);
  });
  var detail = await page({ id: row.id });
  assert.equal(detail.item.contact.email, row.contact_email); assert.equal(detail.item.plan.original_prompt, "PROMPT-PRIVADO");
  assert.equal(detail.item.plan.dietary[0].code, "RESTRICCION-PRIVADA"); assert.equal(detail.item.quotes.length, 1);
  var missing = await call({ id: fixture.id(999) }); assert.equal(missing.statusCode, 404);
});
test("CO-2a búsqueda global por nombre/email/teléfono/ID, literal y sin PII en cursor", async function (t) {
  var rows = Array.from({ length: 610 }, function (_, n) { return fixture.inquiry(n + 1, n > 120 ? "completed" : "inquiry_requested"); });
  rows[0].contact_name = 'Ána (Prueba), "Especial"'; rows[0].contact_email = "uno+dos@example.invalid";
  var f = world(t, rows, { cap: 31 });
  for (var search of ["ana (Prueba)", '"Especial"', "uno+dos@example.invalid", fixture.id(1)]) {
    var p = await page({ status: "all" }, search); assert.equal(p.total, 1); assert.equal(p.items[0].id, fixture.id(1));
  }
  var phone = await all("open", "54 11 1234-5678");
  assert.equal(phone.items.length, 121); assert.equal(phone.pages[0].total, 121);
  assert.doesNotMatch(phone.pages[0].next_cursor, /1234|5678/);
  assert.doesNotMatch(JSON.stringify(f.calls.map(function (c) { return c.headers; })), /x-listo-search/i, "search is translated into constrained database filters");
  for (var search of ['a.*', 'x),status.eq.completed', 'a\\b', '%_', '"\\),or(id.neq.x)']) {
    var p = await page({ status: "open" }, search); assert.equal(p.total, 0);
  }
});
test("CO-2a autenticación, validación de cursor y contratos de escritura conservados", async function (t) {
  var f = world(t, Array.from({ length: 52 }, function (_, n) { return fixture.inquiry(n + 1); }));
  for (var query of [{}, { id: fixture.id(1) }]) assert.equal((await call(query, "", { cookie: "" })).statusCode, 401);
  assert.equal(f.calls.length, 0);
  var first = await page({ status: "open" });
  for (var query of [{ id: "bad" }, { id: fixture.id(1), status: "all" }, { status: "closed" }, { status: ["open"] }, { cursor: "bad" }, { cursor: first.next_cursor + "x" }, { status: "all", cursor: first.next_cursor }, { offset: "500" }]) assert.equal((await call(query)).statusCode, 400);
  assert.equal((await call({ status: "open", cursor: first.next_cursor }, "changed search")).statusCode, 400);
  assert.equal((await call({}, "a".repeat(121))).statusCode, 400);
  assert.equal((await call({}, "", { "x-listo-search": "%FF" })).statusCode, 400);
  var res = h.fakeRes(); await handler(h.fakeReq("PATCH", { cookie: auth.sessionCookie().split(";")[0], "content-type": "application/json" }, { id: fixture.id(1), status: "cancelled" }), res); assert.equal(res.statusCode, 403);
  assert.equal(res.headers["cache-control"], "no-store");
});
test("CO-2a no inventa totales sin Content-Range; errores no filtran datos", async function (t) {
  world(t, [fixture.inquiry(1)], { missingCount: true });
  var res = await call({ status: "all" }); assert.equal(res.statusCode, 502); assert.doesNotMatch(res.body, /Persona|example.invalid|PRIVAD/);
});
test("CO-2a esquema antiguo: bandeja mínima y detalle con fallback; aceptadas falla explícitamente", async function (t) {
  world(t, [fixture.inquiry(1)], { missingProposals: true });
  var p = await page({ status: "all" }); assert.equal(p.proposals_ready, false); assert.equal(p.total, 1);
  var requested = await page({ status: "inquiry_requested" }); assert.equal(requested.total, 1);
  var accepted = await call({ status: "proposal_accepted" }); assert.equal(accepted.statusCode, 503);
  var detail = await page({ id: fixture.id(1) }); assert.equal(detail.proposals_ready, false); assert.equal(detail.schema_ready, true);
});
test("CO-2a métricas recorren todas las reservas, sin truncar ni mezclar monedas", async function (t) {
  var bookings = Array.from({ length: 540 }, function (_, n) { return { id: fixture.id(n + 1), booking_status: "confirmed", currency: n < 510 ? "ARS" : "USD", final_total_amount: 100, commission_amount: 10, commission_status: "pending" }; });
  world(t, [], { bookings: bookings, cap: 41 });
  var p = await page({ status: "all" }); assert.equal(p.total, 0); assert.equal(p.metrics.ARS.count, 510); assert.equal(p.metrics.ARS.total, 51000); assert.equal(p.metrics.USD.count, 30);
  assert.equal(p.metrics.USD.commission_pending, 300);
});
