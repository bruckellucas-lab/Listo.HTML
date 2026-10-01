/* =========================================================
   LISTO — "Quiero avanzar" (tabla plan_inquiries)
   Guarda los datos de contacto para consultar disponibilidad y
   condiciones con el lugar elegido. NO es una reserva.
   Cadena: event_requests ← plan_selections ← plan_inquiries
   Se escribe SOLO desde el servidor (datos personales).
   ========================================================= */
"use strict";

var store = require("./providers-store");

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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date + "T00:00:00Z"))) return { error: "Elegí la fecha del plan." };
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
function first(rows) { return Array.isArray(rows) && rows.length ? rows[0] : null; }

function saveInquiry(cfg, eventRequestId, placeId, data, fetchImpl) {
  var doFetch = fetchImpl || fetch;
  var get = function (path, step) {
    return store.request(doFetch, api(cfg, path), { method: "GET", headers: store.headersFor(cfg.key) }, step);
  };

  // 1) Tiene que existir una elección activa de ESTE pedido para ESTE lugar.
  return get("plan_selections?select=id,provider_google_place_id&status=eq.interested&event_request_id=eq." +
    encodeURIComponent(eventRequestId), "buscar elección").then(function (rows) {
    var sel = first(rows);
    if (!sel) { var e = new Error("sin elección"); e.code = "NO_SELECTION"; throw e; }
    if (sel.provider_google_place_id !== placeId) { var e2 = new Error("elección distinta"); e2.code = "OTHER_SELECTION"; throw e2; }

    // 2) Una sola solicitud abierta por elección: si ya existe, se actualiza (no se duplica).
    var path = "plan_inquiries?" + OPEN_FILTER + "&plan_selection_id=eq." + encodeURIComponent(sel.id);
    return get(path.replace("plan_inquiries?", "plan_inquiries?select=id&"), "buscar solicitud").then(function (rows) {
      var now = new Date().toISOString();
      var patch = function () {
        var body = Object.assign({}, data, { updated_at: now });
        return store.request(doFetch, api(cfg, path), {
          method: "PATCH", headers: store.headersFor(cfg.key, { "Prefer": "return=minimal" }), body: JSON.stringify(body)
        }, "actualizar solicitud").then(function () { return { updated: true, selectionId: sel.id }; });
      };
      if (first(rows)) return patch();
      var row = Object.assign({ plan_selection_id: sel.id, status: STATUS }, data);
      return store.request(doFetch, api(cfg, "plan_inquiries"), {
        method: "POST", headers: store.headersFor(cfg.key, { "Prefer": "return=minimal" }), body: JSON.stringify(row)
      }, "guardar solicitud").then(function () { return { updated: false, selectionId: sel.id }; }, function (err) {
        if (err.code === "23505") return patch();   // doble envío simultáneo: se actualiza la que ya entró
        throw err;
      });
    });
  });
}

function explain(err) {
  if (err.code === "NO_SELECTION") return { status: 409, message: "Primero elegí una opción y después tocá “Quiero avanzar”." };
  if (err.code === "OTHER_SELECTION") return { status: 409, message: "Tu opción elegida cambió. Volvé a elegirla y probá de nuevo." };
  if (err.code === "PGRST205" || err.code === "42P01") return { status: 503, message: "Falta crear la tabla plan_inquiries en Supabase." };
  if (err.code === "PGRST204" || err.code === "42703") return { status: 503, message: "Una columna de plan_inquiries no coincide con la guía." };
  return { status: 502, message: "No pudimos enviar tu solicitud. Probá de nuevo en un momento." };
}

module.exports = {
  STATUS: STATUS, STATUSES: STATUSES, OPEN_STATUSES: OPEN_STATUSES, OPEN_FILTER: OPEN_FILTER,
  validate: validate, saveInquiry: saveInquiry, explain: explain
};
