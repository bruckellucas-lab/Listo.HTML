/* =========================================================
   LISTO — "Quiero avanzar" (tabla plan_inquiries)
   Guarda los datos de contacto para consultar disponibilidad y
   condiciones con el lugar elegido. NO es una reserva.
   Cadena: event_requests ← plan_selections ← plan_inquiries
   Se escribe SOLO desde el servidor (datos personales).
   ========================================================= */
"use strict";

var store = require("./providers-store");
var validDate = require("./calendar").validDate;
var requirements = require("./requirements");

var STATUS = "inquiry_requested";

// Estados posibles (los cambia el equipo desde /admin).
var STATUSES = ["inquiry_requested", "provider_contacted", "quoted", "confirmed", "cancelled", "completed"];
// "Abiertas": mientras una solicitud esté en alguno de estos estados, un reenvío del usuario
// actualiza esa misma solicitud (no crea otra) y no le cambia el estado.
var OPEN_STATUSES = ["inquiry_requested", "provider_contacted", "quoted", "confirmed"];
var OPEN_FILTER = "status=in.(" + OPEN_STATUSES.join(",") + ")";

function clean(v, max) {
  return String(v === undefined || v === null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

// Valida y normaliza lo que manda el formulario. Devuelve { data } o { error }.
function validate(body, todayIso) {
  var name = clean(body.name, 80);
  var phone = clean(body.phone, 30);
  var email = clean(body.email, 120).toLowerCase();
  var date = clean(body.event_date, 10);
  var time = clean(body.approximate_time, 5);
  var notes = String(body.notes || "").trim().slice(0, 500);

  if (name.length < 2) return { error: "Escribí tu nombre." };
  var digits = phone.replace(/\D/g, "");
  if (!/^[+\d\s().-]+$/.test(phone) || digits.length < 8 || digits.length > 15) return { error: "Revisá tu WhatsApp: tiene que ser un número de teléfono." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: "Revisá tu email (o dejalo vacío)." };
  if (!validDate(date)) return { error: "Elegí la fecha del plan." };
  var today = todayIso || new Date().toISOString().slice(0, 10);
  var limit = new Date(Date.parse(today + "T00:00:00Z") + 2 * 365 * 864e5).toISOString().slice(0, 10);
  if (date < today) return { error: "La fecha del plan no puede ser anterior a hoy." };
  if (date > limit) return { error: "Elegí una fecha dentro de los próximos dos años." };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { error: "Elegí un horario aproximado." };

  return { data: {
    contact_name: name,
    contact_phone: phone,
    contact_email: email || null,
    event_date: date,
    approximate_time: time,
    notes: notes || null
  } };
}

function api(cfg, path) { return store.normalizeUrl(cfg.url) + "/rest/v1/" + path; }

async function saveInquiry(cfg, eventRequestId, placeId, data, fetchImpl, opts) {
  opts = opts || {};
  var uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(opts.operationId || "") || !uuid.test(opts.selectionId || "")) {
    var invalid = new Error("sin recuperación"); invalid.code = "BAD_RECOVERY"; throw invalid;
  }
  var doFetch = fetchImpl || fetch;
  await requirements.assertAutomaticAllowed(cfg, eventRequestId, doFetch);
  var out = await store.request(doFetch, api(cfg, "rpc/listo_save_inquiry"), {
    method: "POST", headers: store.headersFor(cfg.key),
    body: JSON.stringify({ p_operation_id: opts.operationId, p_request_id: eventRequestId,
      p_selection_id: opts.selectionId, p_place_id: placeId, p_data: data })
  }, "guardar solicitud recuperable");
  if (!out.ok) { var conflict = new Error("solicitud cambió"); conflict.code = "INQUIRY_CONFLICT"; conflict.result = out; throw conflict; }
  return out;
}

function explain(err) {
  if (err.code === "BAD_RECOVERY") return { status: 400, message: "Actualizá la página antes de enviar la solicitud." };
  if (err.code === "INQUIRY_CONFLICT") return { status: err.result.http_status || 409, message: err.result.error };
  if (["PGRST202", "42883"].indexOf(err.code) !== -1) return { status: 503, message: "LISTO necesita completar una actualización. No se modificó tu solicitud." };
  var r = requirements.explain(err);
  if (r) return r;
  if (err.code === "NO_SELECTION") return { status: 409, message: "Primero elegí una opción y después tocá “Quiero avanzar”." };
  if (err.code === "OTHER_SELECTION") return { status: 409, message: "Tu opción elegida cambió. Volvé a elegirla y probá de nuevo." };
  if (err.code === "PGRST205" || err.code === "42P01") return { status: 503, message: "Falta crear la tabla plan_inquiries en Supabase." };
  if (err.code === "PGRST204" || err.code === "42703") return { status: 503, message: "Una columna de plan_inquiries no coincide con la guía." };
  return { status: 502, message: "No pudimos confirmar el resultado. Puede haberse guardado: reenviar los mismos datos recupera tu solicitud sin duplicarla." };
}

module.exports = {
  STATUS: STATUS, STATUSES: STATUSES, OPEN_STATUSES: OPEN_STATUSES, OPEN_FILTER: OPEN_FILTER,
  validate: validate, saveInquiry: saveInquiry, explain: explain
};
