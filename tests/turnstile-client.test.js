/* Pruebas de turnstile-client.js (Turnstile en el navegador, sólo "Quiero avanzar").
   Cloudflare y el reloj están simulados. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var V = require("../turnstile-client.js");

// Reloj simulado.
function clock() {
  var now = 0, tasks = [], id = 0;
  return {
    setTimeout: function (fn, ms) { id++; tasks.push({ id: id, at: now + ms, fn: fn }); return id; },
    clearTimeout: function (i) { tasks = tasks.filter(function (t) { return t.id !== i; }); },
    tick: async function (ms) {
      var end = now + ms;
      for (;;) {
        tasks.sort(function (a, b) { return a.at - b.at; });
        var next = tasks[0];
        if (!next || next.at > end) break;
        tasks.shift(); now = next.at; next.fn();
        await Promise.resolve();
      }
      now = end;
      await new Promise(function (r) { setImmediate(r); });
    }
  };
}

// Turnstile simulado: guarda las opciones y cuenta render/reset/remove.
function fakeApi() {
  var api = { renders: 0, resets: 0, removes: 0, opts: null };
  api.render = function (sel, opts) { api.renders++; api.opts = opts; return "w" + api.renders; };
  api.reset = function () { api.resets++; };
  api.remove = function () { api.removes++; };
  return api;
}

function setup(extra) {
  var c = clock(), api = fakeApi(), logs = [], notices = [], box = { active: false, classList: { toggle: function (n, on) { box.active = !!on; } } };
  var loads = 0;
  var v = V.create(Object.assign({
    siteKey: "0x4AAAAAAFPe9K2tA52qoILL", action: "plan_inquiry", container: "#a-turnstile", box: box,
    notice: function (m) { notices.push(m); }, log: function () { logs.push(Array.prototype.join.call(arguments, " ")); },
    load: function () { loads++; return Promise.resolve(api); },
    setTimeout: c.setTimeout, clearTimeout: c.clearTimeout
  }, extra || {}));
  return { v: v, api: api, logs: logs, notices: notices, box: box, clock: c, loads: function () { return loads; } };
}
function flush() { return new Promise(function (r) { setImmediate(r); }); }

test("opciones del widget: Managed sin caja (interaction-only), sin Troubleshoot y con reintentos automáticos", async function () {
  var t = setup();
  await t.v.setup();
  var o = t.api.opts;
  assert.equal(o.sitekey, "0x4AAAAAAFPe9K2tA52qoILL");
  assert.equal(o.action, "plan_inquiry");
  assert.equal(o.appearance, "interaction-only");
  assert.equal(o["feedback-enabled"], false, "sin el link Troubleshoot");
  assert.equal(o.retry, "auto");
  assert.equal(o["refresh-expired"], "auto");
  assert.equal(o["refresh-timeout"], "auto");
  assert.equal(o["response-field"], false);
  ["callback", "error-callback", "unsupported-callback", "expired-callback", "timeout-callback",
    "before-interactive-callback", "after-interactive-callback"].forEach(function (k) { assert.equal(typeof o[k], "function", k); });
  assert.equal(t.box.active, false, "sin hueco reservado");
});

test("error-callback recibe el código, lo registra (sólo el código) y muestra un mensaje humano", async function () {
  var cases = [["110200", V.MESSAGES.domain], ["200500", V.MESSAGES.load], ["300030", V.MESSAGES.failed], ["600010", V.MESSAGES.failed], ["999999", V.MESSAGES.failed]];
  for (var c of cases) {
    var t = setup();
    await t.v.setup();
    var handled = t.api.opts["error-callback"](c[0]);
    assert.equal(handled, true);
    assert.deepEqual(t.logs, ["[turnstile] error cliente: " + c[0]]);
    assert.equal(t.notices.at(-1), c[1]);
    assert.equal(t.box.active, true, "el aviso ocupa lugar sólo cuando hay algo para mostrar");
  }
  assert.equal(V.messageFor("110200"), "Este dominio todavía no está habilitado para la verificación de seguridad.");
});

test("los registros nunca llevan el token ni datos raros", async function () {
  var t = setup();
  await t.v.setup();
  t.api.opts.callback("TOKEN-SECRETO-123");
  t.api.opts["error-callback"]("TOKEN-SECRETO-123 <script>ana@mail.com");
  var all = t.logs.join("\n");
  assert.equal(all.indexOf("TOKEN-SECRETO-123 "), -1);
  assert.doesNotMatch(all, /<|@|\s{2}/);
  assert.equal(V.safeCode("110200"), "110200");
  assert.equal(V.safeCode("abc<script>tok.en"), "abcscripttok");
  assert.equal(V.safeCode(undefined), "sin-codigo");
});

test("token de un solo uso: el segundo envío pide uno nuevo", async function () {
  var t = setup();
  await t.v.setup();
  t.api.opts.callback("tok-1");
  assert.equal(await t.v.obtain(), "tok-1");
  var p = t.v.obtain();
  await flush();
  assert.equal(t.api.resets, 1, "pidió un token nuevo");
  t.api.opts.callback("tok-2");
  assert.equal(await p, "tok-2");
});

test("el token llega en segundo plano mientras se espera", async function () {
  var t = setup();
  await t.v.setup();
  var p = t.v.obtain();
  await t.clock.tick(800);
  t.api.opts.callback("tok-bg");
  assert.equal(await p, "tok-bg");
});

test("después de un error, volver a enviar recrea el widget y consigue un token nuevo", async function () {
  var t = setup();
  await t.v.setup();
  t.api.opts["error-callback"]("600010");
  var p = t.v.obtain();
  await flush(); await flush();
  assert.equal(t.api.removes, 1, "se quitó el widget roto");
  assert.equal(t.api.renders, 2, "y se creó de nuevo");
  t.api.opts.callback("tok-nuevo");
  assert.equal(await p, "tok-nuevo");
  assert.equal(t.box.active, false, "sin aviso viejo");
});

test("un error mientras se espera corta la espera con el mensaje humano", async function () {
  var t = setup();
  await t.v.setup();
  var p = t.v.obtain();
  await flush();
  t.api.opts["error-callback"]("110200");
  await assert.rejects(p, { message: V.MESSAGES.domain });
});

test("si Cloudflare no carga: aviso claro y reintento al enviar", async function () {
  var fail = true, loads = 0, api = fakeApi(), notices = [];
  var c = clock();
  var v = V.create({ siteKey: "k", action: "plan_inquiry", container: "#x", notice: function (m) { notices.push(m); },
    load: function () { loads++; return fail ? Promise.reject(new Error("bloqueado")) : Promise.resolve(api); },
    setTimeout: c.setTimeout, clearTimeout: c.clearTimeout });
  await v.setup();
  assert.equal(notices.at(-1), V.MESSAGES.load);
  var first = v.obtain();
  await assert.rejects(first, { message: V.MESSAGES.load });
  assert.equal(loads, 2, "reintentó cargar");
  fail = false;
  var p = v.obtain();
  await flush(); await flush();
  assert.equal(loads, 3);
  api.opts.callback("tok-ok");
  assert.equal(await p, "tok-ok");
});

test("navegador no compatible: mensaje humano y no se espera para siempre", async function () {
  var t = setup();
  await t.v.setup();
  t.api.opts["unsupported-callback"]();
  assert.equal(t.notices.at(-1), V.MESSAGES.unsupported);
  await assert.rejects(t.v.obtain(), { message: V.MESSAGES.unsupported });
});

test("si tarda: se corta con mensaje; si Cloudflare pide interacción, se espera más y aparece el control", async function () {
  var t = setup();
  await t.v.setup();
  var p = t.v.obtain();
  var r = assert.rejects(p, { message: V.MESSAGES.slow });
  await t.clock.tick(V.WAIT_MS + 10);
  await r;

  var p2 = t.v.obtain();
  await t.clock.tick(1000);
  t.api.opts["before-interactive-callback"]();
  assert.equal(t.box.active, true, "el control ocupa lugar sólo cuando hace falta");
  await t.clock.tick(V.WAIT_MS + 5000);
  t.api.opts.callback("tok-humano");
  t.api.opts["after-interactive-callback"]();
  assert.equal(await p2, "tok-humano");
  assert.equal(t.box.active, false);
});

test("token vencido: se descarta (Cloudflare lo renueva solo)", async function () {
  var t = setup();
  await t.v.setup();
  t.api.opts.callback("tok-viejo");
  t.api.opts["expired-callback"]();
  var p = t.v.obtain();
  await flush();
  t.api.opts.callback("tok-renovado");
  assert.equal(await p, "tok-renovado");
});
