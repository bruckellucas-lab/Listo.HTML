/* =========================================================
   LISTO — Verificación anti-robots (Cloudflare Turnstile) en el servidor
   Sólo la usa POST /api/plan-inquiry ("Quiero avanzar").
   - El token viene del widget del navegador (turnstile_token) y se valida
     contra Cloudflare con TURNSTILE_SECRET_KEY (sólo en Vercel).
   - Cada token sirve una sola vez y vence en pocos minutos.
   - No se manda la IP a Cloudflare (remoteip) para no compartir datos de más.
   - No se guarda ni se registra el token, el secreto ni datos personales:
     en los registros sólo quedan códigos técnicos de Cloudflare.
   ========================================================= */
"use strict";

var http = require("./http");

var SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
var ACTION = "plan_inquiry";
var TIMEOUT_MS = 5000;
var MAX_TOKEN = 2048;                       // largo máximo de un token de Turnstile
var HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
var CONFIG_ERRORS = ["missing-input-secret", "invalid-input-secret"];

var MESSAGES = {
  missing: "Completá la verificación de seguridad (abajo del formulario) y volvé a enviar.",
  rejected: "No pudimos verificar que seas una persona. Volvé a intentarlo.",
  expired: "La verificación de seguridad venció. Completala de nuevo y volvé a enviar.",
  unavailable: "No pudimos verificar la solicitud en este momento. Probá de nuevo en unos minutos."
};

// Hostname real del pedido (lo que el navegador tenía en la barra), sin puerto y en minúsculas.
// En Vercel viene en x-forwarded-host; si no, en host.
function requestHostname(req) {
  var h = (req && req.headers) || {};
  var raw = String(h["x-forwarded-host"] || h.host || "").split(",")[0].trim().toLowerCase();
  raw = raw.replace(/:\d+$/, "").replace(/\.$/, "");
  return raw.length <= 253 && HOST_RE.test(raw) ? raw : "";
}

function normalizeHost(v) {
  return String(v || "").trim().toLowerCase().replace(/\.$/, "");
}

function fail(status, kind, code) {
  return { ok: false, status: status, error: MESSAGES[kind], code: code };
}

// Valida el token. Devuelve { ok: true } o { ok: false, status, error, code }.
// opts (para pruebas): { fetch, env, timeoutMs }
async function verify(req, token, opts) {
  opts = opts || {};
  var env = opts.env || http.env;
  var secret = env("TURNSTILE_SECRET_KEY");
  if (!secret) {
    console.error("[turnstile] falta TURNSTILE_SECRET_KEY → solicitud frenada");
    return fail(503, "unavailable", "missing-secret");
  }
  if (typeof token !== "string" || !token || token.length > MAX_TOKEN) return fail(400, "missing", "missing-token");

  var hostname = requestHostname(req);
  if (!hostname) {
    console.error("[turnstile] no se pudo leer el hostname del pedido");
    return fail(403, "rejected", "bad-request-host");
  }

  var doFetch = opts.fetch || fetch;
  var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  var timer = controller ? setTimeout(function () { controller.abort(); }, opts.timeoutMs || TIMEOUT_MS) : null;
  var data;
  try {
    // Sin remoteip: Cloudflare no necesita la IP para validar.
    var res = await doFetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: secret, response: token }).toString(),
      signal: controller ? controller.signal : undefined
    });
    var text = await res.text();
    if (!res.ok) {
      console.error("[turnstile] Cloudflare respondió " + res.status);
      return fail(503, "unavailable", "siteverify-http-" + res.status);
    }
    data = JSON.parse(text);
  } catch (err) {
    console.error("[turnstile] Cloudflare no respondió:", err && err.name === "AbortError" ? "tiempo de espera agotado" : "error de red o respuesta inválida");
    return fail(503, "unavailable", "siteverify-unreachable");
  } finally {
    clearTimeout(timer);
  }

  var codes = Array.isArray(data && data["error-codes"]) ? data["error-codes"].filter(function (c) { return typeof c === "string"; }) : [];
  if (!data || data.success !== true) {
    // Sólo códigos técnicos de Cloudflare (nunca el token).
    console.error("[turnstile] token rechazado:", codes.join(",") || "sin código");
    if (codes.some(function (c) { return CONFIG_ERRORS.indexOf(c) !== -1; })) return fail(503, "unavailable", "config");
    if (codes.indexOf("timeout-or-duplicate") !== -1) return fail(403, "expired", "timeout-or-duplicate");
    return fail(403, "rejected", "rejected");
  }
  if (data.action !== ACTION) {
    console.error("[turnstile] acción distinta a " + ACTION);
    return fail(403, "rejected", "action-mismatch");
  }
  if (normalizeHost(data.hostname) !== hostname) {
    console.error("[turnstile] el hostname del token no coincide con el del pedido");
    return fail(403, "rejected", "hostname-mismatch");
  }
  return { ok: true };
}

module.exports = {
  SITEVERIFY_URL: SITEVERIFY_URL, ACTION: ACTION, TIMEOUT_MS: TIMEOUT_MS, MESSAGES: MESSAGES,
  requestHostname: requestHostname, verify: verify
};
