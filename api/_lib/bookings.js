/* =========================================================
   LISTO — Reservas confirmadas y comisión (tabla plan_bookings)
   - Sólo para el panel interno: nada de esto llega a la web pública.
   - El cálculo de la comisión lo hace SIEMPRE el servidor (y Supabase
     lo vuelve a controlar). El panel sólo lo muestra antes de guardar.
   - No se mueve dinero: sólo se registra la operación.
   ========================================================= */
"use strict";

var store = require("./providers-store");
var validDate = require("./calendar").validDate;

var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var CHANNELS = ["whatsapp", "phone", "email", "other"];
var MAX_RATE = 30;   // mismo tope que en Supabase: 0 < % <= 30
var FIELDS = "id,created_at,updated_at,plan_inquiry_id,provider_quote_id,plan_proposal_id,provider_google_place_id," +
  "acceptance_source,acceptance_channel,acceptance_note,booking_status,confirmed_at,cancelled_at,final_total_amount,currency," +
  "commission_type,commission_rate,commission_amount,commission_status,commission_due_date,commission_invoiced_at,commission_paid_at,internal_notes";

function todayAR() { return new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); }
function text(v, max) { var s = String(v === undefined || v === null ? "" : v).trim().slice(0, max); return s || null; }

// Montos en formato argentino ("1.250.000" o "1250000,50"). Devuelve centavos (entero) o error.
function cents(v) {
  if (v === undefined || v === null || v === "") return { value: null };
  var s;
  if (typeof v === "number") {
    if (!isFinite(v) || v < 0) return { error: true };
    s = v.toFixed(2);
  } else {
    s = String(v).replace(/[$\s]/g, "");
    if (/,/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  }
  var m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return { error: true };
  var c = Number(m[1]) * 100 + Number(((m[2] || "") + "00").slice(0, 2));
  return c < 1e14 ? { value: c } : { error: true };
}

// Porcentaje: "8", "8,5" o "8.25" (hasta 2 decimales). Devuelve centésimos de punto (8,5% → 850).
function rateHundredths(v) {
  if (v === undefined || v === null || v === "") return { value: null };
  var s = String(v).replace(/[%\s]/g, "").replace(",", ".");
  var m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return { error: true };
  return { value: Number(m[1]) * 100 + Number(((m[2] || "") + "00").slice(0, 2)) };
}

// total × % / 100, redondeado a centavos igual que Supabase (round: la mitad hacia arriba).
function percentCommission(totalCents, rateH) {
  var n = BigInt(totalCents) * BigInt(rateH);          // centavos × centésimos de punto
  return Number((n * 2n + 10000n) / 20000n);            // ÷ 10000 con redondeo
}

function fromCents(c) { return c === null ? null : c / 100; }

// Valida el formulario de CONFIRMAR RESERVA. Devuelve { data } o { error }.
function validateConfirm(b, today) {
  today = today || todayAR();
  var inquiryId = String(b.plan_inquiry_id || ""), quoteId = String(b.provider_quote_id || "");
  if (!UUID_RE.test(inquiryId)) return { error: "Solicitud no válida." };
  if (!UUID_RE.test(quoteId)) return { error: "Elegí la cotización que se reservó." };
  var proposalId = b.plan_proposal_id ? String(b.plan_proposal_id) : null;
  if (proposalId && !UUID_RE.test(proposalId)) return { error: "Propuesta no válida." };

  var source = String(b.acceptance_source || "");
  if (source !== "proposal_link" && source !== "manual") return { error: "Indicá cómo aceptó el usuario." };
  var channel = null, note = text(b.acceptance_note, 500);
  if (source === "proposal_link") {
    if (!proposalId) return { error: "Falta la propuesta aceptada desde el link." };
    note = null;
  } else {
    channel = String(b.acceptance_channel || "");
    if (CHANNELS.indexOf(channel) === -1) return { error: "Elegí por dónde aceptó el usuario." };
    if (!note || note.length < 5) return { error: "Escribí dónde y cuándo aceptó (ej: “Aceptó por WhatsApp el 02/10.”)." };
  }

  var total = cents(b.final_total_amount);
  if (total.error || total.value === null || total.value <= 0) return { error: "Revisá el monto final (tiene que ser mayor a 0)." };
  var currency = String(b.currency || "");
  if (["ARS", "USD"].indexOf(currency) === -1) return { error: "Elegí la moneda." };

  var type = String(b.commission_type || ""), rate = null, amount;
  if (type === "percentage") {
    var r = rateHundredths(b.commission_rate);
    if (r.error || r.value === null || r.value <= 0 || r.value > MAX_RATE * 100) return { error: "El porcentaje tiene que ser mayor a 0 y hasta " + MAX_RATE + "%." };
    rate = r.value;
    amount = percentCommission(total.value, rate);
  } else if (type === "fixed") {
    var f = cents(b.commission_fixed_amount);
    if (f.error || f.value === null) return { error: "Revisá el monto fijo de la comisión." };
    if (f.value > total.value) return { error: "La comisión fija no puede ser mayor al monto final." };
    amount = f.value;
  } else {
    return { error: "Elegí el tipo de comisión." };
  }

  // El panel manda lo que mostró; si no coincide con el cálculo del servidor, no se guarda.
  if (b.expected_commission_amount !== undefined && b.expected_commission_amount !== null && b.expected_commission_amount !== "") {
    var shown = cents(b.expected_commission_amount);
    if (shown.error || shown.value !== amount) {
      return { error: "La comisión calculada no coincide ($ " + (amount / 100).toLocaleString("es-AR") + "). Revisá los datos y volvé a intentar.", mismatch: true };
    }
  }

  var confirmedDay = text(b.confirmed_at, 10) || today;
  if (!validDate(confirmedDay)) return { error: "Revisá la fecha de confirmación." };
  if (confirmedDay > today) return { error: "La fecha de confirmación no puede ser futura." };
  var due = text(b.commission_due_date, 10);
  if (due && !validDate(due)) return { error: "Revisá la fecha estimada de cobro." };
  if (due && due < confirmedDay) return { error: "La fecha estimada de cobro no puede ser anterior a la confirmación." };

  return { data: {
    plan_inquiry_id: inquiryId,
    provider_quote_id: quoteId,
    plan_proposal_id: proposalId,
    acceptance_source: source,
    acceptance_channel: channel,
    acceptance_note: note,
    booking_status: "confirmed",
    confirmed_at: dayToTimestamp(confirmedDay, today),
    final_total_amount: fromCents(total.value),
    currency: currency,
    commission_type: type,
    commission_rate: rate === null ? null : rate / 100,
    commission_amount: fromCents(amount),
    commission_status: "pending",
    commission_due_date: due,
    internal_notes: text(b.internal_notes, 2000)
  } };
}

// Si es hoy, la hora actual; si es otro día, el mediodía de ese día (hora de Argentina).
function dayToTimestamp(day, today) {
  return day === (today || todayAR()) ? new Date().toISOString() : new Date(day + "T12:00:00-03:00").toISOString();
}

function api(cfg, path) { return store.normalizeUrl(cfg.url) + "/rest/v1/" + path; }
function call(cfg, path, method, step, payload, prefer, fetchImpl) {
  var opts = { method: method, headers: store.headersFor(cfg.key, prefer ? { "Prefer": prefer } : undefined) };
  if (payload) opts.body = JSON.stringify(payload);
  return store.request(fetchImpl || fetch, api(cfg, path), opts, step);
}

function activeFor(cfg, inquiryId) {
  return call(cfg, "plan_bookings?select=" + FIELDS + "&plan_inquiry_id=eq." + inquiryId + "&booking_status=eq.confirmed", "GET", "leer reserva")
    .then(function (rows) { return rows && rows[0] ? rows[0] : null; });
}

// Cancela la reserva activa (si la hay). Con la comisión ya pagada NO se puede.
// La comisión pendiente o facturada pasa a exenta. Devuelve { booking } o { error, status }.
function cancelActive(cfg, inquiryId) {
  return activeFor(cfg, inquiryId).then(function (b) {
    if (!b) return { booking: null };
    if (b.commission_status === "paid") return { error: "No se puede cancelar: la comisión de esta reserva ya está pagada. Si fue un error, corregilo en Supabase.", status: 409 };
    var now = new Date().toISOString();
    var patch = { booking_status: "cancelled", cancelled_at: now, updated_at: now };
    if (b.commission_status === "pending" || b.commission_status === "invoiced") patch.commission_status = "waived";
    // Sólo si sigue confirmada y sin pagar (si dos cambios llegan juntos, no se pisa nada).
    return call(cfg, "plan_bookings?id=eq." + b.id + "&booking_status=eq.confirmed&commission_status=neq.paid&select=" + FIELDS,
      "PATCH", "cancelar reserva", patch, "return=representation").then(function (rows) {
      if (!rows || !rows[0]) return { error: "La reserva cambió mientras tanto. Actualizá el panel.", status: 409 };
      return { booking: rows[0] };
    });
  });
}

function missingTable(err) { return ["PGRST205", "42P01", "PGRST200", "PGRST204", "42703"].indexOf(err && err.code) !== -1; }

module.exports = {
  UUID_RE: UUID_RE, CHANNELS: CHANNELS, MAX_RATE: MAX_RATE, FIELDS: FIELDS,
  todayAR: todayAR, validDate: validDate, cents: cents, rateHundredths: rateHundredths, percentCommission: percentCommission,
  validateConfirm: validateConfirm, dayToTimestamp: dayToTimestamp,
  call: call, activeFor: activeFor, cancelActive: cancelActive, missingTable: missingTable
};
