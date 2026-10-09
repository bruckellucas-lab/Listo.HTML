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
var commercial = require("./_lib/commercial-state");

var UUID_RE = bookings.UUID_RE;
// Desde qué estado se puede pasar a cada estado de comisión (pagada y exenta son finales).
var FROM = { invoiced: ["pending"], paid: ["pending", "invoiced"], waived: ["pending", "invoiced"] };

function explain(err) {
  if (err.code === "PGRST205" || err.code === "42P01") return "Falta crear la tabla plan_bookings. Corré el SQL de SUPABASE.md (Paso 10).";
  if (err.code === "PGRST204" || err.code === "42703") return "Falta alguna columna en Supabase. Corré el SQL de SUPABASE.md (Paso 10).";
  if (err.code === "23505") return "Ya hay una reserva confirmada para esta solicitud.";
  if (err.code === "23503") return "No encontramos la solicitud, la cotización o el proveedor.";
  if (err.code === "23514") return "Supabase rechazó algún dato (montos, porcentaje o fechas). Revisá el formulario.";
  return "No pudimos confirmar el resultado. Puede haberse guardado: recargá el panel antes de repetir. Reenviar los mismos datos recupera la misma operación.";
}

async function confirm(cfg, body) {
  var checked = bookings.validateConfirm(body);
  if (checked.error) return [400, { ok: false, error: checked.error, mismatch: !!checked.mismatch }];
  if (body.provider_google_place_id) checked.data.provider_google_place_id = String(body.provider_google_place_id);
  return commercial.run(cfg, "confirm", checked.data.plan_inquiry_id, body.expected_status, checked.data, body.operation_id);
}

async function syncStatus(cfg, body) {
  var id = String(body.plan_inquiry_id || "");
  if (!UUID_RE.test(id)) return [400, { ok: false, error: "Solicitud no válida." }];
  return commercial.run(cfg, "sync", id, body.expected_status, {}, body.operation_id);
}

async function commissionAction(cfg, body) {
  var id = String(body.booking_id || ""), action = String(body.action || "");
  if (!UUID_RE.test(id)) return [400, { ok: false, error: "Reserva no válida." }];
  var rows = await bookings.call(cfg, "plan_bookings?select=" + bookings.FIELDS + "&id=eq." + id, "GET", "leer reserva");
  var b = rows && rows[0];
  if (!b) return [404, { ok: false, error: "No encontramos esa reserva." }];

  if (action === "cancel") {
    return commercial.run(cfg, "cancel", b.plan_inquiry_id, body.expected_status, { booking_id: id }, body.operation_id);
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
