/* =========================================================
   LISTO — Elecciones del usuario ("Elegir esta opción")
   Tabla plan_selections. Se escribe SOLO desde el servidor.
   Un pedido tiene como máximo una elección activa ("interested");
   si el usuario cambia de opción, la anterior queda "replaced".
   No reserva ni cobra nada.
   ========================================================= */
"use strict";

var store = require("./providers-store");

var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function api(cfg, path) {
  return store.normalizeUrl(cfg.url) + "/rest/v1/" + path;
}

function first(rows) { return Array.isArray(rows) && rows.length ? rows[0] : null; }

function saveSelection(cfg, eventRequestId, placeId, fetchImpl) {
  var doFetch = fetchImpl || fetch;
  var get = function (path, step) {
    return store.request(doFetch, api(cfg, path), { method: "GET", headers: store.headersFor(cfg.key) }, step);
  };

  // 1) El pedido tiene que existir.
  return get("event_requests?select=id&id=eq." + encodeURIComponent(eventRequestId), "buscar pedido")
    .then(function (rows) {
      if (!first(rows)) { var e = new Error("pedido inexistente"); e.code = "NO_REQUEST"; throw e; }
      // 2) El lugar tiene que existir en providers (el nombre sale de ahí, no del navegador).
      return get("providers?select=google_place_id,name&google_place_id=eq." + encodeURIComponent(placeId), "buscar proveedor");
    })
    .then(function (rows) {
      var provider = first(rows);
      if (!provider) { var e = new Error("proveedor inexistente"); e.code = "NO_PROVIDER"; throw e; }
      // 3) ¿Ya hay una elección activa para este pedido?
      return get("plan_selections?select=id,provider_google_place_id,provider_name,status,created_at&status=eq.interested&event_request_id=eq." +
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
              provider_google_place_id: provider.google_place_id,
              provider_name: provider.name,
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
  if (err.code === "NO_REQUEST") return { status: 404, message: "Todavía no terminamos de guardar tu pedido. Esperá un segundo y probá de nuevo." };
  if (err.code === "NO_PROVIDER") return { status: 404, message: "No encontramos ese lugar en LISTO. Volvé a buscar opciones y probá de nuevo." };
  if (err.code === "23505") return { status: 409, message: "Ya estamos guardando tu elección. Esperá un segundo." };
  if (err.code === "PGRST205" || err.code === "42P01") return { status: 503, message: "Falta crear la tabla plan_selections en Supabase." };
  if (err.code === "23503") return { status: 404, message: "No pudimos vincular tu elección con el pedido o el lugar." };
  return { status: 502, message: "No pudimos guardar tu elección. Probá de nuevo en un momento." };
}

module.exports = { UUID_RE: UUID_RE, saveSelection: saveSelection, explain: explain };
