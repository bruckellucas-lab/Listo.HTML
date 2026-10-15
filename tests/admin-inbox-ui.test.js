/* Browser control flow exercised with Node VM, no DOM library/dependencies. */
"use strict";
var test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
var html = fs.readFileSync(require("./helpers").ROOT + "/admin/index.html", "utf8");
function section(start, end) { return html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start))); }
function dom() {
  var nodes = {};
  function node() { return { hidden: false, disabled: false, open: false, textContent: "", innerHTML: "", children: [], appendChild: function (c) { this.children.push(c); }, addEventListener: function () {}, showModal: function () { this.open = true; } }; }
  return { $: function (id) { return nodes[id] || (nodes[id] = node()); }, el: function (_, __, text) { var n = node(); n.textContent = text; return n; } };
}
function context(extra) { var ctx = Object.assign(dom(), extra); vm.createContext(ctx); return ctx; }
function deferred() { var resolve, reject; var promise = new Promise(function (a, b) { resolve = a; reject = b; }); return { promise: promise, resolve: resolve, reject: reject }; }
test("CO-2a UI: filtros/búsqueda reinician cursor e ignoran respuestas anteriores", async function () {
  var requests = [], renders = 0;
  var ctx = context({ listGeneration: 0, items: [], nextCursor: null, total: null, countedAt: null, inboxChanged: false, loading: false, filter: "open", query: "",
    renderChips: function () {}, render: function () { renders++; }, setState: function () {}, renderMetrics: function () {},
    api: function (_, url, body, lastId, search) { var d = deferred(); requests.push({ url: url, search: search, d: d }); return d.promise; } });
  vm.runInContext(section('    function load(append)', '    function renderChips()'), ctx);
  var old = ctx.load(); ctx.filter = "completed"; ctx.query = "búsqueda";
  var current = ctx.load();
  requests[1].d.resolve({ items: [{ id: "b" }], total: 70, next_cursor: "cursor-b" }); await current;
  requests[0].d.resolve({ items: [{ id: "old" }], total: 900, next_cursor: "old-cursor" }); await old;
  assert.equal(ctx.total, 70); assert.equal(ctx.items[0].id, "b"); assert.equal(ctx.nextCursor, "cursor-b"); assert.equal(renders, 1);
  assert.equal(requests[1].search, "búsqueda"); assert.doesNotMatch(requests[1].url, /búsqueda|cursor/);
  var more = ctx.load(true);
  assert.match(requests[2].url, /cursor=cursor-b/);
  requests[2].d.resolve({ items: [{ id: "b" }, { id: "c" }], total: 70, next_cursor: null }); await more;
  assert.equal(ctx.items.length, 2); assert.equal(ctx.items[1].id, "c"); assert.equal(ctx.nextCursor, null);
  var refresh = ctx.load(); assert.equal(ctx.items.length, 0); assert.equal(ctx.nextCursor, null);
  requests[3].d.resolve({ items: [], total: 0, next_cursor: null }); await refresh; assert.equal(ctx.total, 0);
});
test("CO-2a UI: fallo al cargar más conserva filas y cursor para reintentar", async function () {
  var ctx = context({ listGeneration: 0, items: [{ id: "a" }], nextCursor: "retry", total: 99, inboxChanged: false, loading: false, filter: "all", query: "",
    api: async function () { throw Error("network"); }, setState: function () {}, renderChips: function () {} });
  vm.runInContext(section('    function load(append)', '    function renderChips()'), ctx);
  await ctx.load(true); assert.equal(ctx.items.length, 1); assert.equal(ctx.nextCursor, "retry"); assert.match(ctx.$("page-note").textContent, /reintentar/); assert.equal(ctx.$("load-more").disabled, false);
});
test("CO-2a UI: detalle pide ID explícito, descarta resultados tardíos y no se fusiona al listado", async function () {
  var requests = [], opened = [];
  var ctx = context({ detailGeneration: 0, detailItem: null, schemaReady: true, proposalsReady: true, bookingsReady: true, render: function () {},
    openDetail: function (it) { opened.push(it); },
    api: function (_, url) { var d = deferred(); requests.push({ url: url, d: d }); return d.promise; } });
  vm.runInContext(section('    function loadDetail(id)', '    function openDetail(it)'), ctx);
  var first = ctx.loadDetail("a"), second = ctx.loadDetail("b");
  assert.equal(requests[1].url, "/api/admin-inquiries?id=b");
  requests[1].d.resolve({ item: { id: "b", contact: { phone: "synthetic-private" } } }); await second;
  requests[0].d.resolve({ item: { id: "a" } }); await first;
  assert.equal(opened.length, 1); assert.equal(opened[0].id, "b");
  var closed = ctx.loadDetail("c"); ctx.detailGeneration++; ctx.$("detail").open = false;
  requests[2].d.resolve({ item: { id: "c" } }); await closed; assert.equal(opened.length, 1);
});
test("CO-2a UI: búsqueda no va en URL y falla de sesión sigue invalidando el panel", async function () {
  var sent = [], expired = 0;
  var ctx = context({ fetch: async function (url, opts) { sent.push({ url: url, opts: opts }); return { status: 401, ok: false, json: async function () { return {}; } }; }, showLogin: function () { expired++; } });
  vm.runInContext(section('    async function api(', '    /* ---------- Ingreso'), ctx);
  await assert.rejects(ctx.api("GET", "/api/admin-inquiries?status=open", null, null, "ana@example.invalid"), /__session__/);
  assert.equal(expired, 1); assert.doesNotMatch(sent[0].url, /ana|example/);
  assert.equal(decodeURIComponent(sent[0].opts.headers["X-Listo-Search"]), "ana@example.invalid");
  assert.equal(sent[0].opts.credentials, "same-origin");
});
test("CO-2a UI: cambios comerciales invalidan paginación sin copiar el detalle a las filas", function () {
  var row = { id: "a", status: "quoted", view_status: "quoted", contact_label: "P.S" };
  var ctx = context({ items: [row], detailItem: { id: "a", status: "confirmed", contact: { phone: "private" }, plan: { notes: "private" } },
    inboxChanged: false, nextCursor: "cursor", total: 90, countedAt: null, renderChips: function () {}, fmtDateTime: String, fmtDate: String,
    setState: function () {}, VIEW_LABELS: {}, MAIL_LABELS: {}, viewStatus: function (it) { return it.status; } });
  vm.runInContext(section('    function render(skipDetail)', '    var searchTimer'), ctx);
  ctx.render(); assert.equal(ctx.inboxChanged, true); assert.equal(ctx.$("load-more").hidden, true);
  assert.equal(row.status, "confirmed"); assert.equal(Object.hasOwn(row, "contact"), false); assert.equal(Object.hasOwn(row, "plan"), false);
  assert.equal(ctx.$("new-count").textContent, "90"); assert.match(ctx.$("total-count").textContent, /1 cargadas.*90 en la consulta/);
  assert.match(ctx.$("page-note").textContent, /Actualizá/);
});
