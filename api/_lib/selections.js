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

var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function api(cfg, path) {
  return store.normalizeUrl(cfg.url) + "/rest/v1/" + path;
}

function first(rows) { return Array.isArray(rows) && rows.length ? rows[0] : null; }

function fail(code, extra) {
  var e = new Error(code);
  e.code = code;
  Object.keys(extra || {}).forEach(function (k) { e[k] = extra[k]; });
  return e;
}

// La opción tiene que haber salido de una búsqueda de LISTO.
// - Con secreto: se verifica el comprobante firmado y se asegura la fila mínima en providers.
// - Sin secreto (configuración incompleta): como antes, el lugar tiene que existir en providers.
function checkOption(cfg, placeId, token, doFetch, get) {
  var secret = photos.signingSecret();
  if (secret) {
    var why = optionToken.verify(secret, placeId, token);
    if (why) return Promise.reject(fail("BAD_OPTION", { reason: why }));
    return store.ensureProvider(cfg, placeId, doFetch);
  }
  return get("providers?select=google_place_id&google_place_id=eq." + encodeURIComponent(placeId), "buscar proveedor").then(function (rows) {
    if (!first(rows)) throw fail("NO_PROVIDER");
  });
}

// opts: { token } — comprobante de la opción (option_token).
function saveSelection(cfg, eventRequestId, placeId, fetchImpl, opts) {
  var doFetch = fetchImpl || fetch;
  var token = opts && opts.token;
  var get = function (path, step) {
    return store.request(doFetch, api(cfg, path), { method: "GET", headers: store.headersFor(cfg.key) }, step);
  };

  // 1) El pedido tiene que existir y no tener requisitos obligatorios (esos se coordinan a mano).
  return requirements.assertAutomaticAllowed(cfg, eventRequestId, doFetch)
    .then(function () {
      // 2) La opción tiene que ser una opción real de LISTO (comprobante firmado).
      return checkOption(cfg, placeId, token, doFetch, get);
    })
    .then(function () {
      // 3) ¿Ya hay una elección activa para este pedido?
      return get("plan_selections?select=id,provider_google_place_id,status,created_at&status=eq.interested&event_request_id=eq." +
        encodeURIComponent(eventRequestId), "buscar elección").then(function (rows) {
        var active = first(rows);
        // Mismo lugar (por ejemplo, doble clic): no se duplica.
        if (active && active.provider_google_place_id === placeId) return { selection: active, changed: false, duplicate: true };

        var replace = active
          ? store.request(doFetch, api(cfg, "plan_selections?status=eq.interested&event_request_id=eq." + encodeURIComponent(eventRequestId)), {
              method: "PATCH",
              headers: store.headersFor(cfg.key, { "Prefer": "return=minimal" }),
              body: JSON.stringify({ status: "replaced", updated_at: new Date().toISOString() })
            }, "reemplazar elección")
          : Promise.resolve();

        return replace.then(function () {
          return store.request(doFetch, api(cfg, "plan_selections"), {
            method: "POST",
            headers: store.headersFor(cfg.key, { "Prefer": "return=representation" }),
            body: JSON.stringify({
              event_request_id: eventRequestId,
              provider_google_place_id: placeId,
              // Sin nombre de Google. Vacío (no inventado) mientras la columna siga siendo NOT NULL (G1B-2).
              provider_name: "",
              status: "interested"
            })
          }, "guardar elección");
        }).then(function (created) {
          return { selection: first(created), changed: !!active, duplicate: false };
        });
      });
    });
}

function explain(err) {
  var r = requirements.explain(err);
  if (r) return r;
  if (err.code === "NO_REQUEST") return { status: 404, message: "Todavía no terminamos de guardar tu pedido. Esperá un segundo y probá de nuevo." };
  if (err.code === "BAD_OPTION") return { status: 409, message: "Esta opción ya no es válida. Volvé a buscar opciones y elegila de nuevo." };
  if (err.code === "NO_PROVIDER") return { status: 404, message: "No encontramos ese lugar en LISTO. Volvé a buscar opciones y probá de nuevo." };
  if (err.code === "23505") return { status: 409, message: "Ya estamos guardando tu elección. Esperá un segundo." };
  if (err.code === "PGRST205" || err.code === "42P01") return { status: 503, message: "Falta crear la tabla plan_selections en Supabase." };
  if (err.code === "23503") return { status: 404, message: "No pudimos vincular tu elección con el pedido o el lugar." };
  return { status: 502, message: "No pudimos guardar tu elección. Probá de nuevo en un momento." };
}

module.exports = { UUID_RE: UUID_RE, saveSelection: saveSelection, explain: explain };
