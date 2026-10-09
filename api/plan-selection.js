/* =========================================================
   LISTO — Función serverless de Vercel
   Ruta: POST /api/plan-selection
   Cuerpo: { "event_request_id": "<uuid>", "google_place_id": "ChIJ...", "option_token": "..." }

   Registra "Elegir esta opción" en plan_selections (status 'interested').
   No reserva ni cobra nada. La clave secreta de Supabase queda en Vercel.
   option_token = comprobante firmado que entregó /api/plan-options.
   ========================================================= */
"use strict";

var http = require("./_lib/http");
var photos = require("./_lib/photos");
var selections = require("./_lib/selections");
var rateLimit = require("./_lib/rate-limit");

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") { try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve(null); } }
  return new Promise(function (resolve) {
    var raw = "";
    req.on("data", function (c) { raw += c; if (raw.length > 4000) req.destroy(); });
    req.on("end", function () { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { resolve(null); } });
    req.on("error", function () { resolve(null); });
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return http.sendJson(res, 405, { ok: false, error: "Método no permitido." });
  }
  if (!http.requireJson(req, res)) return;
  if (!(await rateLimit.guard(req, res, "plan_selection"))) return;
  var body = await readBody(req);
  var requestId = body && String(body.event_request_id || "");
  var placeId = body && String(body.google_place_id || "");
  var token = body && typeof body.option_token === "string" ? body.option_token.slice(0, 100) : "";
  if (!selections.UUID_RE.test(requestId) || !photos.PLACE_ID_RE.test(placeId)) {
    return http.sendJson(res, 400, { ok: false, error: "No pudimos identificar tu pedido o el lugar elegido." });
  }

  var url = http.env("SUPABASE_URL"), key = http.env("SUPABASE_SECRET_KEY");
  if (!url || !key || /^sb_publishable_/.test(key)) {
    return http.sendJson(res, 503, { ok: false, error: "LISTO no puede guardar elecciones en este momento." });
  }

  try {
    var out = await selections.saveSelection({ url: url, key: key }, requestId, placeId, undefined, { token: token, expectedId: body.expected_selection_id, newId: body.selection_id });
    var s = out.selection || {};
    return http.sendJson(res, 200, {
      ok: true,
      changed: out.changed,
      duplicate: out.duplicate,
      selection: { id: s.id, status: s.status, created_at: s.created_at }
    });
  } catch (err) {
    console.error("[plan-selection]", err.step || "", err.status || "", err.code || "", err.reason || "", err.message);
    var e = selections.explain(err);
    return http.sendJson(res, e.status, { ok: false, error: e.message, current_selection: err.result && err.result.current_selection });
  }
};
