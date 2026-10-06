/* Pruebas de Cloudflare Turnstile en POST /api/plan-inquiry ("Quiero avanzar").
   Cloudflare, Supabase y Resend están simulados: ninguna prueba sale a internet. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var h = require("./helpers");

process.env.SUPABASE_URL = "https://ejemplo-de-prueba.supabase.co";
process.env.SUPABASE_SECRET_KEY = "clave-de-prueba-no-real";
process.env.RATE_LIMIT_SECRET = "secreto-de-prueba-para-limites-1234567890";
var SECRET = "0x4AAAAAAA-secreto-de-prueba-turnstile";
process.env.TURNSTILE_SECRET_KEY = SECRET;

var turnstile = require("../api/_lib/turnstile");
var inquiries = require("../api/_lib/inquiries");
var notify = require("../api/_lib/notify");
var handler = require("../api/plan-inquiry");

var TOKEN = "XXXX.token-de-prueba-de-un-solo-uso.YYYY";
var HOST = "listohtml-abc123-listo2.vercel.app";
var tomorrow = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
function form(extra) {
  return Object.assign({
    event_request_id: "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b", google_place_id: "ChIJabcdefghij1234",
    name: "Ana Pérez", phone: "+54 9 11 5555-1234", email: "ana@ejemplo.com", event_date: tomorrow,
    approximate_time: "21:30", notes: "Mesa tranquila", website: "", turnstile_token: TOKEN
  }, extra || {});
}

// Cloudflare simulado.
function siteverify(reply) {
  return { match: /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify$/, reply: reply };
}
function cfOk(extra) {
  return siteverify(function () { return h.response(200, Object.assign({ success: true, action: "plan_inquiry", hostname: HOST, "error-codes": [] }, extra || {})); });
}

// Guardado y email: espías (no tocan Supabase ni Resend).
var saved, notified;
var realSave = inquiries.saveInquiry, realNotify = notify.notifyInquiry;
function spies() {
  saved = []; notified = [];
  inquiries.saveInquiry = function (cfg, requestId, placeId, data) { saved.push(data); return Promise.resolve({ selectionId: "sel-1", updated: false }); };
  notify.notifyInquiry = function (cfg, info) { notified.push(info); return Promise.resolve(true); };
}
test.after(function () { inquiries.saveInquiry = realSave; notify.notifyInquiry = realNotify; });

async function send(body, opts) {
  opts = opts || {};
  spies();
  var fetch = h.mockFetch([h.rpcRule(opts.limit)].concat(opts.cf ? [opts.cf] : []));
  global.fetch = fetch;
  var logs = [];
  var orig = { error: console.error, log: console.log, warn: console.warn };
  ["error", "log", "warn"].forEach(function (k) { console[k] = function () { logs.push(Array.prototype.join.call(arguments, " ")); }; });
  var res = h.fakeRes();
  try {
    await handler(h.fakeReq("POST", Object.assign({ "content-type": "application/json", "x-forwarded-host": HOST, host: HOST }, opts.headers || {}), body), res);
  } finally { Object.assign(console, orig); }
  var cfCalls = fetch.calls.filter(function (c) { return /siteverify/.test(c.url); });
  return { res: res, data: res.json(), logs: logs, cfCalls: cfCalls, calls: fetch.calls };
}

test("token válido → guarda la solicitud y manda el aviso", async function () {
  var out = await send(form(), { cf: cfOk() });
  assert.equal(out.res.statusCode, 200);
  assert.equal(out.data.ok, true);
  assert.equal(saved.length, 1);
  assert.equal(notified.length, 1);
  assert.equal(out.cfCalls.length, 1);
});

test("a Cloudflare va sólo secret + response (sin remoteip)", async function () {
  var out = await send(form(), { cf: cfOk() });
  var c = out.cfCalls[0];
  assert.equal(c.method, "POST");
  var params = new URLSearchParams(c.body);
  assert.deepEqual(Array.from(params.keys()).sort(), ["response", "secret"]);
  assert.equal(params.get("response"), TOKEN);
  assert.equal(params.get("secret"), SECRET);
  assert.equal(params.has("remoteip"), false);
});

test("el token nunca se guarda ni se devuelve", async function () {
  var out = await send(form(), { cf: cfOk() });
  assert.equal(JSON.stringify(saved).indexOf(TOKEN), -1);
  assert.equal("turnstile_token" in saved[0], false);
  assert.equal(JSON.stringify(notified).indexOf(TOKEN), -1);
  assert.equal(out.res.body.indexOf(TOKEN), -1);
});

test("falta el token → 400, sin llamar a Cloudflare ni guardar", async function () {
  for (var bad of [undefined, "", 123, "x".repeat(2049)]) {
    var out = await send(form({ turnstile_token: bad }), { cf: cfOk() });
    assert.equal(out.res.statusCode, 400, String(bad).slice(0, 10));
    assert.equal(out.cfCalls.length, 0);
    assert.equal(saved.length, 0);
    assert.equal(notified.length, 0);
  }
});

test("Cloudflare dice success:false → 403 con mensaje humano, sin guardar ni email", async function () {
  var out = await send(form(), { cf: siteverify(function () { return h.response(200, { success: false, "error-codes": ["invalid-input-response"] }); }) });
  assert.equal(out.res.statusCode, 403);
  assert.equal(out.data.error, "No pudimos verificar que seas una persona. Volvé a intentarlo.");
  assert.doesNotMatch(out.res.body, /invalid-input-response/, "no se muestran códigos internos");
  assert.equal(saved.length, 0);
  assert.equal(notified.length, 0);
});

test("token vencido o repetido → 403 y se puede volver a verificar", async function () {
  var out = await send(form(), { cf: siteverify(function () { return h.response(200, { success: false, "error-codes": ["timeout-or-duplicate"] }); }) });
  assert.equal(out.res.statusCode, 403);
  assert.match(out.data.error, /venció/);
  assert.equal(out.data.verification, true, "el navegador sabe que tiene que pedir otra verificación");
  assert.equal(saved.length, 0);
});

test("acción distinta → 403", async function () {
  var out = await send(form(), { cf: cfOk({ action: "login" }) });
  assert.equal(out.res.statusCode, 403);
  assert.equal(saved.length, 0);
  assert.equal(notified.length, 0);
});

test("hostname distinto → 403; mismo hostname con puerto o mayúsculas → ok", async function () {
  var out = await send(form(), { cf: cfOk({ hostname: "sitio-malo.com" }) });
  assert.equal(out.res.statusCode, 403);
  assert.equal(saved.length, 0);
  var withPort = await send(form(), { cf: cfOk(), headers: { "x-forwarded-host": HOST.toUpperCase() + ":443" } });
  assert.equal(withPort.res.statusCode, 200);
  var hostOnly = await send(form(), { cf: cfOk(), headers: { "x-forwarded-host": undefined, host: HOST } });
  assert.equal(hostOnly.res.statusCode, 200, "sin x-forwarded-host usa host");
  var other = await send(form(), { cf: cfOk(), headers: { "x-forwarded-host": "listohtml.vercel.app" } });
  assert.equal(other.res.statusCode, 403, "token de otro dominio no sirve");
});

test("requestHostname: normaliza y rechaza valores raros", function () {
  assert.equal(turnstile.requestHostname({ headers: { "x-forwarded-host": "ListoHTML.vercel.app:443, otro" } }), "listohtml.vercel.app");
  assert.equal(turnstile.requestHostname({ headers: { host: "localhost:3000" } }), "localhost");
  assert.equal(turnstile.requestHostname({ headers: { host: "evil.com/x" } }), "");
  assert.equal(turnstile.requestHostname({ headers: {} }), "");
});

test("falta TURNSTILE_SECRET_KEY → 503 (fail closed), sin guardar", async function () {
  delete process.env.TURNSTILE_SECRET_KEY;
  try {
    var out = await send(form(), { cf: cfOk() });
    assert.equal(out.res.statusCode, 503);
    assert.equal(out.cfCalls.length, 0);
    assert.equal(saved.length, 0);
    assert.equal(notified.length, 0);
  } finally { process.env.TURNSTILE_SECRET_KEY = SECRET; }
});

test("Cloudflare caído, error HTTP o respuesta rota → 503, sin guardar", async function () {
  var cases = [
    siteverify(function () { return Promise.reject(new Error("sin red")); }),
    siteverify(function () { return h.response(500, "error"); }),
    siteverify(function () { return h.response(200, "no es json"); }),
    siteverify(function () { return h.response(200, { success: false, "error-codes": ["invalid-input-secret"] }); })
  ];
  for (var cf of cases) {
    var out = await send(form(), { cf: cf });
    assert.equal(out.res.statusCode, 503);
    assert.equal(saved.length, 0);
    assert.equal(notified.length, 0);
  }
});

test("Cloudflare que no contesta → 503 por tiempo de espera", async function () {
  var never = h.mockFetch([siteverify(function (call) {
    return new Promise(function (resolve, reject) {
      call.headers && setTimeout(function () { reject(Object.assign(new Error("abort"), { name: "AbortError" })); }, 30);
    });
  })]);
  var orig = console.error; console.error = function () {};
  try {
    var r = await turnstile.verify({ headers: { host: HOST } }, TOKEN, { fetch: never, timeoutMs: 10, env: function (n) { return n === "TURNSTILE_SECRET_KEY" ? SECRET : ""; } });
  } finally { console.error = orig; }
  assert.equal(r.ok, false);
  assert.equal(r.status, 503);
});

test("el token y el secreto nunca aparecen en los registros", async function () {
  var all = [];
  for (var cf of [cfOk(), cfOk({ hostname: "x.com" }), cfOk({ action: "otra" }),
    siteverify(function () { return h.response(200, { success: false, "error-codes": ["timeout-or-duplicate"] }); }),
    siteverify(function () { return Promise.reject(new Error("caído " + TOKEN)); })]) {
    var out = await send(form(), { cf: cf });
    all = all.concat(out.logs);
  }
  var text = all.join("\n");
  assert.ok(all.length >= 4, "hubo registros");
  [TOKEN, SECRET, "Ana Pérez", "5555-1234", "ana@ejemplo.com", "10.1."].forEach(function (s) {
    assert.equal(text.indexOf(s), -1, "no debe aparecer " + s);
  });
});

test("el límite por visitante sigue antes de Cloudflare", async function () {
  var out = await send(form(), { cf: cfOk(), limit: 0 });
  assert.equal(out.res.statusCode, 429);
  assert.equal(out.cfCalls.length, 0, "no se gasta una verificación");
  assert.equal(saved.length, 0);
});

test("campo trampa sigue: responde ok sin verificar, guardar ni avisar", async function () {
  var out = await send(form({ website: "http://spam.example" }), { cf: cfOk() });
  assert.equal(out.res.statusCode, 200);
  assert.equal(out.cfCalls.length, 0);
  assert.equal(saved.length, 0);
  assert.equal(notified.length, 0);
});

test("datos inválidos se rechazan antes de gastar una verificación", async function () {
  var out = await send(form({ phone: "abc" }), { cf: cfOk() });
  assert.equal(out.res.statusCode, 400);
  assert.equal(out.cfCalls.length, 0);
  var json = await send(form(), { cf: cfOk(), headers: { "content-type": "text/plain" } });
  assert.equal(json.res.statusCode, 415);
  assert.equal(json.cfCalls.length, 0);
});

test("sólo plan-inquiry usa Turnstile", function () {
  var fs = require("node:fs"), path = require("node:path");
  var users = fs.readdirSync(path.join(h.ROOT, "api")).filter(function (f) {
    return /\.js$/.test(f) && /_lib\/turnstile/.test(fs.readFileSync(path.join(h.ROOT, "api", f), "utf8"));
  });
  assert.deepEqual(users, ["plan-inquiry.js"]);
});
