/* =========================================================
   LISTO — Función serverless de Vercel (PANEL INTERNO)
   Ruta: /api/admin-bookings
   POST  { plan_inquiry_id, provider_quote_id, plan_proposal_id?,
           acceptance_source: "proposal_link" | "manual",
           acceptance_channel?, acceptance_note?,
           final_total_amount, currency, commission_type, commission_rate?,
           commission_fixed_amount?, expected_commission_amount,
           confirmed_at, commission_due_date?, internal_notes? }
         → CONFIRMAR RESERVA: crea el registro comercial y pasa la
           solicitud a Confirmado.
   POST  { action: "sync_status", plan_inquiry_id }
         → si la reserva quedó guardada pero el estado no se actualizó.
   PATCH { booking_id, action: "invoiced" | "paid" | "waived" | "cancel", paid_at? }
         → comisión facturada / pagada / exenta, o cancelar la reserva.

   Nada se hace solo: todo es una acción manual del equipo.
   No mueve dinero ni manda emails. Sólo con el pase de /admin.
   ========================================================= */
"use strict";

var http = require("./_lib/http");
var auth = require("./_lib/admin-auth");
var bookings = require("./_lib/bookings");

var UUID_RE = bookings.UUID_RE;
// Desde qué estado se puede pasar a cada estado de comisión (pagada y exenta son finales).
var FROM = { invoiced: ["pending"], paid: ["pending", "invoiced"], waived: ["pending", "invoiced"] };

function explain(err) {
  if (err.code === "PGRST205" || err.code === "42P01") return "Falta crear la tabla plan_bookings. Corré el SQL de SUPABASE.md (Paso 10).";
  if (err.code === "PGRST204" || err.code === "42703") return "Falta alguna columna en Supabase. Corré el SQL de SUPABASE.md (Paso 10).";
  if (err.code === "23505") return "Ya hay una reserva confirmada para esta solicitud.";
  if (err.code === "23503") return "No encontramos la solicitud, la cotización o el proveedor.";
  if (err.code === "23514") return "Supabase rechazó algún dato (montos, porcentaje o fechas). Revisá el formulario.";
  return "No pudimos guardar. Probá de nuevo.";
}

async function setConfirmed(cfg, inquiryId) {
  var now = new Date().toISOString();
  var rows = await bookings.call(cfg, "plan_inquiries?id=eq." + inquiryId + "&select=id,status,updated_at", "PATCH", "pasar a confirmado",
    { status: "confirmed", updated_at: now }, "return=representation");
  return rows && rows[0];
}

async function confirm(cfg, body) {
  var checked = bookings.validateConfirm(body);
  if (checked.error) return [400, { ok: false, error: checked.error, mismatch: !!checked.mismatch }];
  var d = checked.data;

  // 1) La solicitud existe y no está cerrada.
  var inq = await bookings.call(cfg, "plan_inquiries?select=id,status,plan_selection_id,plan_selections(provider_google_place_id)&id=eq." + d.plan_inquiry_id, "GET", "leer solicitud");
  inq = inq && inq[0];
  if (!inq) return [404, { ok: false, error: "No encontramos esa solicitud." }];
  if (inq.status === "cancelled" || inq.status === "completed") return [409, { ok: false, error: "La solicitud está " + (inq.status === "cancelled" ? "Cancelada" : "Completada") + ": no se puede confirmar una reserva." }];

  // 2) El proveedor sale de lo que eligió el usuario (nunca del formulario).
  var placeId = inq.plan_selections && inq.plan_selections.provider_google_place_id;
  if (!placeId) return [409, { ok: false, error: "No encontramos el proveedor elegido para esta solicitud." }];
  if (body.provider_google_place_id && String(body.provider_google_place_id) !== placeId) return [409, { ok: false, error: "El proveedor no coincide con el que eligió el usuario." }];

  // 3) La cotización es de esta solicitud.
  var quote = await bookings.call(cfg, "provider_quotes?select=id,plan_inquiry_id,availability&id=eq." + d.provider_quote_id + "&plan_inquiry_id=eq." + d.plan_inquiry_id, "GET", "leer cotización");
  if (!quote || !quote[0]) return [409, { ok: false, error: "Esa cotización no es de esta solicitud." }];

  // 4) Si se indica una propuesta: es de esta solicitud y usa esa cotización.
  //    Por link, además, tiene que estar ACEPTADA por el usuario.
  if (d.plan_proposal_id) {
    var prop = await bookings.call(cfg, "plan_proposals?select=id,status,plan_inquiry_id,provider_quote_id&id=eq." + d.plan_proposal_id + "&plan_inquiry_id=eq." + d.plan_inquiry_id, "GET", "leer propuesta");
    prop = prop && prop[0];
    if (!prop) return [409, { ok: false, error: "Esa propuesta no es de esta solicitud." }];
    if (prop.provider_quote_id !== d.provider_quote_id) return [409, { ok: false, error: "La propuesta usa otra cotización." }];
    if (d.acceptance_source === "proposal_link" && prop.status !== "proposal_accepted") return [409, { ok: false, error: "El usuario todavía no aceptó esa propuesta desde el link. Si aceptó por otro canal, usá aceptación manual." }];
  }

  // 5) Una sola reserva confirmada por solicitud: nunca se crea otra en silencio.
  var active = await bookings.activeFor(cfg, d.plan_inquiry_id);
  if (active) return [409, { ok: false, error: "Ya hay una reserva confirmada para esta solicitud.", booking: active }];

  d.provider_google_place_id = placeId;
  var created;
  try {
    created = await bookings.call(cfg, "plan_bookings?select=" + bookings.FIELDS, "POST", "crear reserva", d, "return=representation");
  } catch (err) {
    if (err.code === "23505") return [409, { ok: false, error: "Ya hay una reserva confirmada para esta solicitud." }];
    throw err;
  }
  var booking = created && created[0];

  // 6) Recién ahora la solicitud pasa a Confirmado. Si este paso falla, la reserva ya está
  //    guardada y el panel ofrece completarlo (sin duplicar nada).
  try {
    var item = await setConfirmed(cfg, d.plan_inquiry_id);
    return [200, { ok: true, booking: booking, item: item }];
  } catch (err) {
    console.error("[admin-bookings] estado:", err.status || "", err.code || "");
    return [200, { ok: true, booking: booking, status_pending: true, warning: "La reserva quedó guardada, pero no pudimos pasar la solicitud a Confirmado. Tocá “Completar estado”." }];
  }
}

async function syncStatus(cfg, body) {
  var inquiryId = String(body.plan_inquiry_id || "");
  if (!UUID_RE.test(inquiryId)) return [400, { ok: false, error: "Solicitud no válida." }];
  var active = await bookings.activeFor(cfg, inquiryId);
  if (!active) return [409, { ok: false, error: "Esta solicitud no tiene una reserva confirmada." }];
  var item = await setConfirmed(cfg, inquiryId);
  return [200, { ok: true, item: item, booking: active }];
}

async function commissionAction(cfg, body) {
  var id = String(body.booking_id || ""), action = String(body.action || "");
  if (!UUID_RE.test(id)) return [400, { ok: false, error: "Reserva no válida." }];
  var rows = await bookings.call(cfg, "plan_bookings?select=" + bookings.FIELDS + "&id=eq." + id, "GET", "leer reserva");
  var b = rows && rows[0];
  if (!b) return [404, { ok: false, error: "No encontramos esa reserva." }];

  if (action === "cancel") {
    if (b.booking_status !== "confirmed") return [409, { ok: false, error: "Esta reserva ya estaba cancelada." }];
    var out = await bookings.cancelActive(cfg, b.plan_inquiry_id);
    if (out.error) return [out.status || 409, { ok: false, error: out.error }];
    var now = new Date().toISOString();
    var inq = await bookings.call(cfg, "plan_inquiries?id=eq." + b.plan_inquiry_id + "&select=id,status,updated_at", "PATCH", "cancelar solicitud",
      { status: "cancelled", updated_at: now }, "return=representation");
    return [200, { ok: true, booking: out.booking, item: inq && inq[0] }];
  }

  if (!FROM[action]) return [400, { ok: false, error: "Acción no válida." }];
  if (b.booking_status !== "confirmed") return [409, { ok: false, error: "La reserva está cancelada: no se puede cambiar la comisión." }];
  if (FROM[action].indexOf(b.commission_status) === -1) {
    var names = { pending: "Pendiente", invoiced: "Facturada", paid: "Pagada", waived: "Exenta" };
    return [409, { ok: false, error: "La comisión está " + names[b.commission_status] + ": no se puede pasar a " + names[action] + "." }];
  }
  var stamp = new Date().toISOString();
  var patch = { commission_status: action, updated_at: stamp };
  if (action === "invoiced") patch.commission_invoiced_at = stamp;
  if (action === "paid") {
    var today = bookings.todayAR();
    var day = String(body.paid_at || today);
    if (!bookings.validDate(day)) return [400, { ok: false, error: "Revisá la fecha de cobro." }];
    if (day > today) return [400, { ok: false, error: "La fecha de cobro no puede ser futura." }];
    patch.commission_paid_at = bookings.dayToTimestamp(day, today);
  }
  // Sólo si sigue en el estado que vimos (si dos cambios llegan juntos, gana el primero).
  var upd = await bookings.call(cfg, "plan_bookings?id=eq." + id + "&booking_status=eq.confirmed&commission_status=in.(" + FROM[action].join(",") + ")&select=" + bookings.FIELDS,
    "PATCH", "actualizar comisión", patch, "return=representation");
  if (!upd || !upd[0]) return [409, { ok: false, error: "La comisión cambió mientras tanto. Actualizá el panel." }];
  return [200, { ok: true, booking: upd[0] }];
}

module.exports = async function handler(req, res) {
  if (!auth.isAuthenticated(req)) {
    return http.sendJson(res, 401, { ok: false, error: "Tu sesión no es válida o venció. Volvé a ingresar." });
  }
  if (req.method !== "POST" && req.method !== "PATCH") {
    res.setHeader("Allow", "POST, PATCH");
    return http.sendJson(res, 405, { ok: false, error: "Método no permitido." });
  }
  if (req.headers["x-listo-admin"] !== "1") return http.sendJson(res, 403, { ok: false, error: "Pedido no permitido." });
  var url = http.env("SUPABASE_URL"), key = http.env("SUPABASE_SECRET_KEY");
  if (!url || !key || /^sb_publishable_/.test(key)) return http.sendJson(res, 503, { ok: false, error: "Falta configurar Supabase en Vercel." });
  if (!http.requireJson(req, res)) return;
  var body = await http.readJson(req, 12000);
  if (!body || typeof body !== "object") return http.sendJson(res, 400, { ok: false, error: "No pudimos leer el pedido." });
  var cfg = { url: url, key: key };

  try {
    var out = req.method === "PATCH" ? await commissionAction(cfg, body)
      : body.action === "sync_status" ? await syncStatus(cfg, body)
      : await confirm(cfg, body);
    return http.sendJson(res, out[0], out[1]);
  } catch (err) {
    console.error("[admin-bookings]", err.step || "", err.status || "", err.code || "", err.message);
    return http.sendJson(res, 502, { ok: false, error: explain(err) });
  }
};
