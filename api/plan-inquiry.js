/* =========================================================
   LISTO — Función serverless de Vercel
   Ruta: POST /api/plan-inquiry   ("Quiero avanzar")
   Cuerpo: { event_request_id, google_place_id, name, phone, email?,
             event_date, approximate_time, notes? }

   Guarda los datos de contacto en plan_inquiries con status
   'inquiry_requested'. NO es una reserva confirmada.
   Los datos personales sólo se escriben desde acá (clave secreta en
   Vercel) y nunca se devuelven ni se registran en los logs.
   ========================================================= */
"use strict";

var http = require("./_lib/http");
var photos = require("./_lib/photos");
var selections = require("./_lib/selections");
var inquiries = require("./_lib/inquiries");
var notify = require("./_lib/notify");
var rateLimit = require("./_lib/rate-limit");

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") { try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve(null); } }
  return new Promise(function (resolve) {
    var raw = "";
    req.on("data", function (c) { raw += c; if (raw.length > 8000) req.destroy(); });
    req.on("end", function () { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { resolve(null); } });
    req.on("error", function () { resolve(null); });
  });
}

// Fecha de hoy en Argentina (para no rechazar "hoy" por diferencia horaria).
function todayInArgentina() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return http.sendJson(res, 405, { ok: false, error: "Método no permitido." });
  }
  if (!http.requireJson(req, res)) return;
  if (!(await rateLimit.guard(req, res, "plan_inquiry"))) return;
  var body = await readBody(req);
  if (!body || typeof body !== "object") return http.sendJson(res, 400, { ok: false, error: "No pudimos leer el formulario. Probá de nuevo." });

  // Campo trampa invisible: si viene completo, es un robot. Respondemos ok sin guardar nada.
  if (body.website) return http.sendJson(res, 200, { ok: true, updated: false });

  var requestId = String(body.event_request_id || "");
  var placeId = String(body.google_place_id || "");
  if (!selections.UUID_RE.test(requestId) || !photos.PLACE_ID_RE.test(placeId)) {
    return http.sendJson(res, 400, { ok: false, error: "No pudimos identificar tu plan. Volvé a elegir la opción." });
  }

  var checked = inquiries.validate(body, todayInArgentina());
  if (checked.error) return http.sendJson(res, 400, { ok: false, error: checked.error });

  var url = http.env("SUPABASE_URL"), key = http.env("SUPABASE_SECRET_KEY");
  if (!url || !key || /^sb_publishable_/.test(key)) {
    return http.sendJson(res, 503, { ok: false, error: "LISTO no puede recibir solicitudes en este momento." });
  }

  try {
    var cfg = { url: url, key: key };
    var out = await inquiries.saveInquiry(cfg, requestId, placeId, checked.data);

    // La solicitud ya está guardada. El aviso por email se intenta después y, pase lo que pase,
    // no cambia la respuesta al usuario (se espera para que Vercel no corte el envío a mitad).
    try {
      await notify.notifyInquiry(cfg, {
        eventRequestId: requestId, placeId: placeId, selectionId: out.selectionId,
        contact: checked.data, updated: out.updated
      });
    } catch (e) { console.error("[plan-inquiry] aviso:", e && e.message); }

    // Sólo confirmamos: nunca devolvemos los datos personales.
    return http.sendJson(res, 200, { ok: true, updated: out.updated, status: inquiries.STATUS });
  } catch (err) {
    // Sin datos personales en el registro: sólo el paso y el código de error.
    console.error("[plan-inquiry]", err.step || "", err.status || "", err.code || "");
    var e = inquiries.explain(err);
    return http.sendJson(res, e.status, { ok: false, error: e.message });
  }
};
