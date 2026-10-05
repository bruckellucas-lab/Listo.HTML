/* Pruebas de api/_lib/rate-limit.js: huella privada, permitido/bloqueado,
   y qué pasa si Supabase o la migration no están. Nunca se guarda ni registra la IP. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var h = require("./helpers");
var rl = require("../api/_lib/rate-limit");

var SECRET = "secreto-de-prueba-para-limites-1234567890";
function env(extra) {
  var vals = Object.assign({ SUPABASE_URL: "https://ejemplo-de-prueba.supabase.co", SUPABASE_SECRET_KEY: "clave-de-prueba-no-real", RATE_LIMIT_SECRET: SECRET }, extra || {});
  return function (name) { return String(vals[name] || ""); };
}
function req(ip) { return h.fakeReq("POST", { "x-forwarded-for": ip }); }
function quietly(fn) {
  var logs = [], orig = console.error;
  console.error = function () { logs.push(Array.prototype.join.call(arguments, " ")); };
  return Promise.resolve().then(fn).then(function (v) { console.error = orig; return { value: v, logs: logs }; },
    function (e) { console.error = orig; throw e; });
}

test("huella: HMAC de 64 caracteres, sin la IP adentro", function () {
  var k = rl.visitorKey(SECRET, "plan_inquiry", "190.12.34.56");
  assert.match(k, /^[0-9a-f]{64}$/);
  assert.equal(k.indexOf("190"), -1);
  assert.equal(k.indexOf("12.34"), -1);
});

test("mismo visitante + misma acción → misma huella; otra acción u otro visitante → otra", function () {
  var a = rl.visitorKey(SECRET, "plan_inquiry", "190.12.34.56");
  assert.equal(rl.visitorKey(SECRET, "plan_inquiry", "190.12.34.56"), a);
  assert.notEqual(rl.visitorKey(SECRET, "event_request", "190.12.34.56"), a);
  assert.notEqual(rl.visitorKey(SECRET, "plan_inquiry", "190.12.34.57"), a);
  assert.notEqual(rl.visitorKey(SECRET + "x", "plan_inquiry", "190.12.34.56"), a, "sin el secreto no se puede recalcular");
});

test("IP normalizada: misma persona aunque cambie el formato; IPv6 agrupada por /64", function () {
  assert.equal(rl.normalizeIp("190.12.34.56, 10.0.0.1"), "190.12.34.56");
  assert.equal(rl.normalizeIp("::ffff:190.12.34.56"), "190.12.34.56");
  assert.equal(rl.normalizeIp("190.12.34.56:443"), "190.12.34.56");
  assert.equal(rl.normalizeIp("2001:db8:aa:bb:1::1"), rl.normalizeIp("2001:DB8:AA:BB:ffff::2"));
  assert.notEqual(rl.normalizeIp("2001:db8:aa:bb::1"), rl.normalizeIp("2001:db8:aa:cc::1"));
  assert.equal(rl.normalizeIp("999.1.1.1"), "unknown");
  assert.equal(rl.normalizeIp(""), "unknown");
});

test("las 6 acciones tienen límite propio", function () {
  assert.deepEqual(rl.SCOPES.slice().sort(), ["admin_login", "event_request", "plan_inquiry", "plan_options", "plan_selection", "proposal_response"]);
  rl.SCOPES.forEach(function (s) { assert.ok(rl.LIMITS[s].max >= 1 && rl.LIMITS[s].windowSeconds >= 60, s); });
  assert.equal(rl.LIMITS.plan_inquiry.failClosed, true);
  assert.equal(rl.LIMITS.plan_options.failClosed, false, "la búsqueda nunca se cae por el límite");
});

test("a Supabase sólo viaja la huella, nunca la IP", async function () {
  var fetch = h.mockFetch([h.rpcRule()]);
  await rl.check(req("190.12.34.56"), "plan_inquiry", { fetch: fetch, env: env() });
  var call = fetch.calls[0];
  assert.match(call.url, /\/rest\/v1\/rpc\/listo_rate_limit_hit$/);
  assert.equal(call.body.indexOf("190.12"), -1);
  var body = JSON.parse(call.body);
  assert.match(body.p_key, /^[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(body).sort(), ["p_key", "p_max", "p_scope", "p_window_seconds"]);
  assert.equal(body.p_scope, "plan_inquiry");
});

test("permitido hasta el máximo, después bloqueado", async function () {
  var fetch = h.mockFetch([h.rpcRule(2)]), e = env();
  var r1 = await rl.check(req("190.0.0.1"), "plan_selection", { fetch: fetch, env: e });
  var r2 = await rl.check(req("190.0.0.1"), "plan_selection", { fetch: fetch, env: e });
  var r3 = await rl.check(req("190.0.0.1"), "plan_selection", { fetch: fetch, env: e });
  assert.deepEqual([r1.allowed, r2.allowed, r3.allowed], [true, true, false]);
  assert.equal(r3.source, "supabase");
  assert.ok(r3.retryAfter > 0);
  var other = await rl.check(req("190.0.0.2"), "plan_selection", { fetch: fetch, env: e });
  assert.equal(other.allowed, true, "otro visitante no se ve afectado");
  var otherScope = await rl.check(req("190.0.0.1"), "plan_inquiry", { fetch: fetch, env: e });
  assert.equal(otherScope.allowed, true, "otra acción tiene su propio contador");
});

test("guard: 429 con Retry-After, o 503 si no se puede contar", async function () {
  var res = h.fakeRes();
  var ok = await rl.guard(req("190.0.0.9"), res, "plan_inquiry", { fetch: h.mockFetch([h.rpcRule(0)]), env: env() });
  assert.equal(ok, false);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers["retry-after"], "120");
  var res2 = h.fakeRes();
  var out = await quietly(function () { return rl.guard(req("190.0.0.9"), res2, "plan_inquiry", { fetch: h.mockFetch([]), env: env() }); });
  assert.equal(out.value, false);
  assert.equal(res2.statusCode, 503);
});

test("sin Supabase / sin migration / sin secreto: acciones sensibles frenadas, búsqueda e ingreso siguen", async function () {
  var missing = h.mockFetch([{ match: /rpc/, reply: function () { return h.response(404, { code: "PGRST202", message: "not found" }); } }]);
  for (var scope of ["event_request", "plan_selection", "plan_inquiry", "proposal_response"]) {
    var out = await quietly(function () { return rl.check(req("190.0.0.3"), scope, { fetch: missing, env: env() }); });
    assert.equal(out.value.allowed, false, scope);
    assert.equal(out.value.source, "unavailable", scope);
    assert.ok(out.logs.some(function (l) { return l.indexOf(rl.MIGRATION) !== -1; }), "el registro nombra la migration");
  }
  for (var s2 of ["plan_options", "admin_login"]) {
    var o2 = await quietly(function () { return rl.check(req("190.0.0.3"), s2, { fetch: missing, env: env() }); });
    assert.equal(o2.value.allowed, true, s2);
    assert.equal(o2.value.source, "memory", s2);
  }
  var noSecret = await quietly(function () { return rl.check(req("190.0.0.4"), "plan_inquiry", { fetch: h.mockFetch([h.rpcRule()]), env: env({ RATE_LIMIT_SECRET: "corto" }) }); });
  assert.equal(noSecret.value.allowed, false);
  assert.ok(noSecret.logs.some(function (l) { return /RATE_LIMIT_SECRET/.test(l); }));
  var down = await quietly(function () { return rl.check(req("190.0.0.4"), "plan_options", { fetch: h.mockFetch([{ match: /rpc/, reply: function () { return Promise.reject(new Error("caído")); } }]), env: env() }); });
  assert.equal(down.value.allowed, true);
});

test("respaldo en memoria también limita (búsqueda)", async function () {
  rl.resetMemory();
  var missing = h.mockFetch([{ match: /rpc/, reply: function () { return h.response(503, {}); } }]);
  var max = rl.LIMITS.plan_options.max, last;
  await quietly(async function () {
    for (var i = 0; i <= max; i++) last = await rl.check(req("190.0.0.5"), "plan_options", { fetch: missing, env: env() });
  });
  assert.equal(last.allowed, false);
  assert.equal(last.source, "memory");
});

test("los registros nunca incluyen la IP ni la huella", async function () {
  var ip = "203.0.113.77";
  var out = await quietly(async function () {
    await rl.check(req(ip), "plan_inquiry", { fetch: h.mockFetch([]), env: env() });
    await rl.check(req(ip), "plan_options", { fetch: h.mockFetch([]), env: env() });
  });
  var all = out.logs.join("\n");
  assert.ok(out.logs.length >= 2);
  assert.equal(all.indexOf(ip), -1);
  assert.equal(all.indexOf(rl.visitorKey(SECRET, "plan_inquiry", ip)), -1);
});

test("la migration guarda sólo huellas, es atómica y está cerrada al público", function () {
  var sql = fs.readFileSync(path.join(h.ROOT, "supabase/migrations/20261005120000_p1a_rate_limits.sql"), "utf8");
  assert.match(sql, /key_hash ~ '\^\[0-9a-f\]\{64\}\$'/, "la tabla rechaza todo lo que no sea una huella");
  assert.doesNotMatch(sql, /\bip\b\s+(text|inet)/i, "no hay columna de IP");
  assert.match(sql, /on conflict on constraint api_rate_limits_pkey\s+do update set hits/, "conteo atómico");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.api_rate_limits from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public\.listo_rate_limit_hit\(text, text, integer, integer\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.listo_rate_limit_hit\(text, text, integer, integer\) to service_role/);
  rl.SCOPES.forEach(function (s) { assert.ok(sql.split("'" + s + "'").length >= 3, "la migration conoce la acción " + s); });
  assert.doesNotMatch(sql, /drop table|truncate|event_requests/i, "la migration 1 no toca otras tablas");
});

test("la migration 2 sólo cierra el INSERT público y va aparte", function () {
  var sql = fs.readFileSync(path.join(h.ROOT, "supabase/migrations/20261005120100_p1a_close_event_requests_anon_insert.sql"), "utf8");
  var code = sql.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n");
  assert.match(code, /drop policy if exists "La web puede crear pedidos" on public\.event_requests;/);
  assert.match(code, /revoke insert on table public\.event_requests from anon, authenticated;/);
  assert.doesNotMatch(code, /drop table|truncate|delete from|disable row level security/i);
});
