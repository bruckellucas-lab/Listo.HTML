/* =========================================================
   LISTO — Elecciones del usuario ("Elegir esta opción")
   Tabla plan_selections. Se escribe SOLO desde el servidor.
   Un pedido tiene como máximo una elección activa ("interested");
   si el usuario cambia de opción, la anterior queda "replaced".
   No reserva ni cobra nada.
   G1B: la opción elegida se valida con el comprobante firmado de
   /api/plan-options (option-token.js). No se copia el nombre del lugar
   (contenido de Google): provider_name queda vacío hasta G1B-2.
   ========================================================= */
"use strict";

var store = require("./providers-store");
var requirements = require("./requirements");
var photos = require("./photos");
var optionToken = require("./option-token");
var replacements = require("./replacements");

var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(code, extra) {
  var e = new Error(code);
  e.code = code;
  Object.keys(extra || {}).forEach(function (k) { e[k] = extra[k]; });
  return e;
}

// La opción tiene que haber salido de una búsqueda de LISTO: SIEMPRE con un comprobante
// firmado válido. Falla cerrado: sin secreto válido en el servidor (falta o es corto), no se
// guarda ninguna elección (nunca se acepta un lugar sólo porque exista en providers).
function checkOption(cfg, placeId, token, doFetch) {
  var secret = photos.signingSecret();
  if (!secret) return Promise.reject(fail("NO_SIGNING_SECRET"));
  var why = optionToken.verify(secret, placeId, token);
  if (why) return Promise.reject(fail("BAD_OPTION", { reason: why }));
  return store.ensureProvider(cfg, placeId, doFetch);
}

// expectedId: elección que veía el usuario; newId: ID estable para reintentar la misma operación.
function saveSelection(cfg, eventRequestId, placeId, fetchImpl, opts) {
  opts = opts || {};
  var doFetch = fetchImpl || fetch;
  return requirements.assertAutomaticAllowed(cfg, eventRequestId, doFetch)
    .then(function () { return checkOption(cfg, placeId, opts.token, doFetch); })
    .then(async function () {
      if (!UUID_RE.test(opts.newId || "") || !(opts.expectedId === null || UUID_RE.test(opts.expectedId || ""))) throw fail("BAD_REPLACEMENT");
      var out = await replacements.run(cfg, "listo_replace_selection", {
        p_request_id: eventRequestId, p_place_id: placeId, p_expected_id: opts.expectedId, p_new_id: opts.newId
      }, doFetch);
      if (!out.ok) throw fail("REPLACEMENT_CONFLICT", { result: out });
      return out;
    });
}

function explain(err) {
  var r = requirements.explain(err);
  if (r) return r;
  if (err.code === "BAD_REPLACEMENT") return { status: 400, message: "Actualizá la página antes de elegir una opción." };
  if (err.code === "REPLACEMENT_MISSING") return { status: 503, message: "Falta aplicar la migration S2B-2. No se reemplazó tu elección." };
  if (err.code === "REPLACEMENT_CONFLICT") return { status: err.result.http_status || 409, message: err.result.error };
  if (err.code === "NO_REQUEST") return { status: 404, message: "Todavía no terminamos de guardar tu pedido. Esperá un segundo y probá de nuevo." };
  if (err.code === "NO_SIGNING_SECRET") return { status: 503, message: "LISTO no puede guardar esta elección en este momento. Volvé a buscar opciones e intentá de nuevo." };
  if (err.code === "BAD_OPTION") return { status: 409, message: "Esta opción ya no es válida. Volvé a buscar opciones y elegila de nuevo." };
  if (err.code === "23505") return { status: 409, message: "Ya estamos guardando tu elección. Esperá un segundo." };
  if (err.code === "PGRST205" || err.code === "42P01") return { status: 503, message: "Falta crear la tabla plan_selections en Supabase." };
  if (err.code === "23503") return { status: 404, message: "No pudimos vincular tu elección con el pedido o el lugar." };
  return { status: 502, message: "No pudimos guardar tu elección. Probá de nuevo en un momento." };
}

module.exports = { UUID_RE: UUID_RE, saveSelection: saveSelection, explain: explain };
