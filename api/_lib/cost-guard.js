/* Reserva presupuestos de uso ANTES de servicios externos. No guarda respuestas. */
"use strict";
var rate = require("./rate-limit"), log = require("./private-log");
async function allow(req, scopes, opts) {
  try {
    for (var scope of scopes) {
      var out = await rate.check(req, scope, opts);
      if (!out.allowed) return out;
    }
    return { allowed: true };
  } catch (err) {
    log.error("[cost-guard] presupuesto", err);
    return { allowed: false, source: "unavailable", retryAfter: 0 };
  }
}
async function guard(req, res, scopes, opts) {
  var out = await allow(req, scopes, opts);
  if (out.allowed) return true;
  if (out.source === "unavailable") {
    require("./http").sendJson(res, 503, { ok: false, error: "LISTO no puede consultar este servicio en este momento. Probá más tarde." });
  } else {
    res.setHeader("Retry-After", String(out.retryAfter || 10));
    require("./http").sendJson(res, 429, { ok: false, error: "Hiciste muchas consultas seguidas o se alcanzó el límite temporal de LISTO. Esperá un poco y probá de nuevo." });
  }
  return false;
}
module.exports = { allow: allow, guard: guard };
