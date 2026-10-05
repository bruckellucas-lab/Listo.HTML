/* =========================================================
   LISTO — Límite de pedidos por visitante, PERSISTENTE (Supabase)
   - Cuenta en la tabla api_rate_limits a través de la función
     listo_rate_limit_hit (migration supabase/migrations/20261005120000_p1a_rate_limits.sql).
   - El conteo es atómico en Supabase: aunque Vercel corra varias copias
     de la función a la vez, todas suman sobre la misma fila.
   - NUNCA se guarda ni se registra la IP: se guarda sólo una huella
     HMAC-SHA256(RATE_LIMIT_SECRET, acción + IP). Sin el secreto no se
     puede volver a la IP.
   - Si Supabase o la migration no están disponibles:
       · acciones que igual escriben en Supabase (pedido, elección,
         "Quiero avanzar", respuesta a propuesta) → se frenan (503),
         con un aviso claro en los registros de Vercel;
       · búsqueda de lugares e ingreso al panel → siguen funcionando
         con un límite en memoria (como antes).
   ========================================================= */
"use strict";

var crypto = require("crypto");
var http = require("./http");
var store = require("./providers-store");

var MIN_SECRET = 32;
var TIMEOUT_MS = 2500;
var RPC = "listo_rate_limit_hit";
var MIGRATION = "supabase/migrations/20261005120000_p1a_rate_limits.sql";

// Límites por acción: pensados para frenar ráfagas y spam, no a una persona normal.
var LIMITS = {
  event_request:     { max: 20, windowSeconds: 600, failClosed: true },   // "Buscar opciones" (guardar pedido)
  plan_options:      { max: 30, windowSeconds: 600, failClosed: false },  // búsquedas en Google (cuestan)
  plan_selection:    { max: 40, windowSeconds: 600, failClosed: true },   // "Elegir esta opción"
  plan_inquiry:      { max: 8,  windowSeconds: 600, failClosed: true },   // "Quiero avanzar" (manda email)
  proposal_response: { max: 10, windowSeconds: 600, failClosed: true },   // aceptar / pedir otra opción
  admin_login:       { max: 10, windowSeconds: 900, failClosed: false }   // ingreso a /admin
};
var SCOPES = Object.keys(LIMITS);

/* ---------- Identificador privado del visitante ---------- */

function expandIpv6(ip) {
  var parts = ip.split("::");
  if (parts.length > 2) return null;
  var head = parts[0] ? parts[0].split(":") : [];
  var tail = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
  var missing = 8 - head.length - tail.length;
  if (parts.length === 2 ? missing < 1 : missing !== 0) return null;
  var groups = head.concat(new Array(parts.length === 2 ? missing : 0).fill("0"), tail);
  if (groups.length !== 8 || !groups.every(function (g) { return /^[0-9a-f]{1,4}$/.test(g); })) return null;
  return groups.map(function (g) { return parseInt(g, 16).toString(16); });
}

// IP del visitante, normalizada. IPv6 se agrupa por /64 (una casa o una oficina
// suele tener muchas direcciones del mismo bloque).
function normalizeIp(raw) {
  var s = String(raw || "").split(",")[0].trim().toLowerCase();
  var bracket = /^\[([^\]]+)\](?::\d+)?$/.exec(s);
  if (bracket) s = bracket[1];
  s = s.replace(/%.*$/, "");                                   // zona de IPv6 (fe80::1%eth0)
  if (/^::ffff:\d{1,3}(\.\d{1,3}){3}$/.test(s)) s = s.slice(7);  // IPv4 escrita como IPv6
  var v4 = /^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/.exec(s);
  if (v4) {
    var octets = v4[1].split(".").map(Number);
    return octets.every(function (o) { return o <= 255; }) ? octets.join(".") : "unknown";
  }
  var groups = s.indexOf(":") !== -1 ? expandIpv6(s) : null;
  return groups ? groups.slice(0, 4).join(":") + "::/64" : "unknown";
}

function clientIp(req) {
  var h = (req && req.headers) || {};
  return normalizeIp(h["x-forwarded-for"] || h["x-real-ip"] || (req && req.socket && req.socket.remoteAddress));
}

function secretOf(env) {
  var s = String((env || http.env)("RATE_LIMIT_SECRET") || "");
  return s.length >= MIN_SECRET ? s : "";
}

// Huella privada: misma IP + misma acción → misma huella. Otra acción → otra huella.
function visitorKey(secret, scope, ip) {
  return crypto.createHmac("sha256", "listo-rate-limit:" + secret).update(scope + "|" + ip).digest("hex");
}

/* ---------- Respaldo en memoria (sólo búsqueda e ingreso al panel) ---------- */

var memory = {};
function memoryHit(scope, key, limit) {
  var now = Date.now(), win = limit.windowSeconds * 1000, id = scope + "|" + key;
  var list = (memory[id] || []).filter(function (t) { return now - t < win; });
  list.push(now);
  memory[id] = list;
  if (Object.keys(memory).length > 5000) memory = {};
  var allowed = list.length <= limit.max;
  return { allowed: allowed, retryAfter: allowed ? 0 : Math.max(1, Math.ceil((list[0] + win - now) / 1000)) };
}
function memoryKey(secret, scope, ip) {
  // Sin secreto también se guarda sólo una huella (en memoria, nunca en disco).
  return secret ? visitorKey(secret, scope, ip) : crypto.createHash("sha256").update("listo-rl-mem|" + scope + "|" + ip).digest("hex");
}

/* ---------- Conteo persistente ---------- */

function rpcHit(cfg, scope, key, limit, fetchImpl) {
  var doFetch = fetchImpl || fetch;
  var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  var timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;
  return store.request(doFetch, store.normalizeUrl(cfg.url) + "/rest/v1/rpc/" + RPC, {
    method: "POST",
    headers: store.headersFor(cfg.key),
    body: JSON.stringify({ p_scope: scope, p_key: key, p_window_seconds: limit.windowSeconds, p_max: limit.max }),
    signal: controller ? controller.signal : undefined
  }, "límite de pedidos").then(function (out) {
    clearTimeout(timer);
    var row = Array.isArray(out) ? out[0] : out;
    if (!row || typeof row.allowed !== "boolean") {
      var bad = new Error("respuesta inesperada");
      bad.code = "bad-response";
      throw bad;
    }
    return { allowed: row.allowed, retryAfter: row.allowed ? 0 : Math.max(1, parseInt(row.retry_after, 10) || limit.windowSeconds) };
  }, function (err) { clearTimeout(timer); throw err; });
}

// Devuelve { allowed, retryAfter, source: "supabase" | "memory" | "unavailable" }.
// opts: { fetch, env } (para pruebas) y { limitMessage } (texto del 429).
async function check(req, scope, opts) {
  opts = opts || {};
  var limit = LIMITS[scope];
  if (!limit) throw new Error("Acción sin límite configurado: " + scope);
  var env = opts.env || http.env;
  var ip = clientIp(req);
  var secret = secretOf(env);
  var url = env("SUPABASE_URL"), key = env("SUPABASE_SECRET_KEY");
  var problem = !secret ? "falta RATE_LIMIT_SECRET (32 caracteres o más)"
    : !url || !key || /^sb_publishable_/.test(key) ? "falta configurar Supabase" : "";

  if (!problem) {
    try {
      var out = await rpcHit({ url: url, key: key }, scope, visitorKey(secret, scope, ip), limit, opts.fetch);
      out.source = "supabase";
      return out;
    } catch (err) {
      problem = err.code === "PGRST202" || err.code === "42883" || err.code === "PGRST205" || err.code === "42P01"
        ? "falta correr la migration " + MIGRATION
        : err.name === "AbortError" ? "Supabase tardó demasiado"
        : "Supabase respondió " + (err.status || "sin respuesta") + " " + (err.code || "");
    }
  }

  // Nunca se registra la IP ni la huella: sólo la acción y el motivo.
  console.error("[rate-limit] " + scope + ": " + problem + (limit.failClosed ? " → acción frenada" : " → límite en memoria"));
  if (limit.failClosed) return { allowed: false, retryAfter: 0, source: "unavailable" };
  var mem = memoryHit(scope, memoryKey(secret, scope, ip), limit);
  mem.source = "memory";
  return mem;
}

// Para usar en cada función: si no se permite, responde (429 o 503) y devuelve false.
async function guard(req, res, scope, opts) {
  var out = await check(req, scope, opts);
  if (out.allowed) return true;
  if (out.source === "unavailable") {
    http.sendJson(res, 503, { ok: false, error: "LISTO no puede procesar esto en este momento. Probá de nuevo en unos minutos." });
    return false;
  }
  res.setHeader("Retry-After", String(out.retryAfter || 60));
  http.sendJson(res, 429, { ok: false, error: (opts && opts.limitMessage) || "Demasiados intentos seguidos. Esperá unos minutos y probá de nuevo." });
  return false;
}

function resetMemory() { memory = {}; }

module.exports = {
  LIMITS: LIMITS, SCOPES: SCOPES, MIN_SECRET: MIN_SECRET, RPC: RPC, MIGRATION: MIGRATION,
  normalizeIp: normalizeIp, clientIp: clientIp, visitorKey: visitorKey,
  check: check, guard: guard, resetMemory: resetMemory
};
