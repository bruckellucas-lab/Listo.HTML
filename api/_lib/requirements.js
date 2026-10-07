/* =========================================================
   LISTO — Requisitos alimentarios obligatorios (control del servidor)
   La verdad es el pedido GUARDADO (event_requests.dietary_requirements),
   nunca lo que mande el navegador.
   - Kosher, halal, celiaquía y alergias son SIEMPRE obligatorios; cualquier
     otro requisito marcado "hard" también. Esos pedidos se coordinan a mano
     con LISTO (WhatsApp): no se puede elegir ni enviar una opción automática.
   - Si el pedido no se puede verificar (no se lee, falta la columna o el dato
     está mal formado), se rechaza: nunca se deja pasar "por las dudas".
   ========================================================= */
"use strict";

var store = require("./providers-store");

var ALWAYS_HARD = ["kosher", "halal", "celiac_safe", "allergy"];
var LABELS = {
  kosher: "Kosher", halal: "Halal", celiac_safe: "Sin TACC / celiaquía", allergy: "Alergias",
  gluten_free: "Sin gluten", vegan: "Vegano", vegetarian: "Vegetariano", lactose_free: "Sin lactosa", kids_menu: "Menú infantil"
};
var STEP = "leer requisitos";

// null o [] → no bloquea. Lista → bloquea si hay algún requisito obligatorio.
// Devuelve { ok: true } | { blocking: [códigos] } | { unverifiable: true }.
function evaluate(diet) {
  if (diet === null || diet === undefined) return { ok: true };
  if (!Array.isArray(diet)) return { unverifiable: true };
  var blocking = [];
  for (var i = 0; i < diet.length; i++) {
    var item = diet[i];
    if (!item || typeof item !== "object" || typeof item.code !== "string" || !LABELS[item.code]) return { unverifiable: true };
    if (item.level !== "hard" && item.level !== "soft") return { unverifiable: true };
    if (item.level === "hard" || ALWAYS_HARD.indexOf(item.code) !== -1) {
      if (blocking.indexOf(item.code) === -1) blocking.push(item.code);
    }
  }
  return blocking.length ? { blocking: blocking } : { ok: true };
}

function fail(code, extra) {
  var e = new Error(code);
  e.code = code;
  e.step = STEP;
  Object.keys(extra || {}).forEach(function (k) { e[k] = extra[k]; });
  return e;
}

// Lee el pedido guardado y lanza un error si no se puede elegir/enviar una opción automática.
// Resuelve sin valor si está todo bien.
function assertAutomaticAllowed(cfg, eventRequestId, fetchImpl) {
  var url = store.normalizeUrl(cfg.url) + "/rest/v1/event_requests?select=id,dietary_requirements&id=eq." + encodeURIComponent(eventRequestId);
  return store.request(fetchImpl || fetch, url, { method: "GET", headers: store.headersFor(cfg.key) }, STEP)
    .then(function (rows) {
      var row = Array.isArray(rows) && rows.length ? rows[0] : null;
      if (!row) throw fail("NO_REQUEST");
      if (!Object.prototype.hasOwnProperty.call(row, "dietary_requirements")) throw fail("REQUIREMENTS_UNVERIFIABLE");
      var out = evaluate(row.dietary_requirements);
      if (out.unverifiable) throw fail("REQUIREMENTS_UNVERIFIABLE");
      if (out.blocking) throw fail("HARD_REQUIREMENTS", { requirements: out.blocking });
    }, function (err) {
      // No se pudo leer (falta la columna, Supabase caído, etc.): no se puede verificar.
      if (err && err.code === "NO_REQUEST") throw err;
      var e = fail("REQUIREMENTS_UNVERIFIABLE");
      e.status = err && err.status;
      e.cause = err && err.code;
      throw e;
    });
}

// Mensajes para la persona. Devuelve null si el error no es de este control.
function explain(err) {
  if (!err || err.step !== STEP) return null;
  if (err.code === "NO_REQUEST") return { status: 404, message: "Todavía no terminamos de guardar tu pedido. Esperá un segundo y probá de nuevo." };
  if (err.code === "HARD_REQUIREMENTS") {
    var names = (err.requirements || []).map(function (c) { return LABELS[c]; }).filter(Boolean).join(", ");
    return { status: 409, message: "Tu pedido incluye requisitos que coordinamos personalmente" + (names ? " (" + names + ")" : "") +
      ". Escribinos por WhatsApp y lo armamos con vos." };
  }
  return { status: 503, message: "No pudimos verificar tu pedido en este momento. Probá de nuevo en unos minutos." };
}

module.exports = { ALWAYS_HARD: ALWAYS_HARD, STEP: STEP, evaluate: evaluate, assertAutomaticAllowed: assertAutomaticAllowed, explain: explain };
