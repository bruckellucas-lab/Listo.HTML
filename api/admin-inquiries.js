/* =========================================================
   LISTO — Función serverless de Vercel (PANEL INTERNO)
   Ruta: /api/admin-inquiries
   GET   → lista de solicitudes con todo el contexto combinado:
           plan_inquiries + plan_selections + event_requests + providers
   PATCH → { id, status } cambia el estado (y updated_at = ahora)

   Sólo responde con el pase de /admin (cookie). La clave secreta de
   Supabase queda en Vercel: el navegador nunca la recibe.
   No manda emails ni WhatsApp al cambiar estados.
   ========================================================= */
"use strict";

var http = require("./_lib/http");
var auth = require("./_lib/admin-auth");
var store = require("./_lib/providers-store");
var inquiries = require("./_lib/inquiries");
var notify = require("./_lib/notify");
var bookings = require("./_lib/bookings");

var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var LIMIT = 500;

var QUOTE_FIELDS = "id,created_at,received_at,total_price,price_per_person,currency,includes,conditions,deposit,availability,valid_until,internal_notes";

var SELECT_BASE = [
  "id", "created_at", "updated_at", "status", "notification_status", "notified_at",
  "contact_name", "contact_phone", "contact_email", "event_date", "approximate_time", "notes", "plan_selection_id",
  "plan_selections(id,created_at,status,event_request_id,provider_google_place_id,provider_name," +
    "event_requests(id,created_at,event_type,guests,zone,budget,needs,original_prompt,dietary_requirements)," +
    "providers(name,category,address,zone,rating,review_count,maps_url,website))"
].join(",");
// Con cotizaciones: suma contacto con el proveedor y cotizaciones (requiere el SQL del Paso 8).
// Los vínculos van con nombre explícito para que Supabase no se confunda con plan_proposals.
var SELECT_QUOTES = SELECT_BASE + ",provider_contacted_at,provider_contact_channel," +
  "provider_quotes!provider_quotes_plan_inquiry_id_fkey(" + QUOTE_FIELDS + ")";
// Completo: suma las propuestas enviadas al usuario (requiere el SQL del Paso 9).
var PROPOSAL_FIELDS = "id,created_at,public_code,status,provider_quote_id,first_viewed_at,last_viewed_at,view_count,responded_at,user_comment";
var SELECT_PROPOSALS = SELECT_QUOTES + ",plan_proposals!plan_proposals_plan_inquiry_id_fkey(" + PROPOSAL_FIELDS + ")";
// Completo: suma las reservas confirmadas y su comisión (requiere el SQL del Paso 10).
var SELECT = SELECT_PROPOSALS + ",plan_bookings!plan_bookings_plan_inquiry_id_fkey(" + bookings.FIELDS + ")";
var CHANNELS = ["whatsapp", "phone", "email", "instagram", "other"];

function cfg() {
  return { url: http.env("SUPABASE_URL"), key: http.env("SUPABASE_SECRET_KEY") };
}

function https(u) { return typeof u === "string" && /^https:\/\//.test(u) ? u : null; }

// Aplana la respuesta de Supabase en lo que necesita el panel.
function toItem(row) {
  var sel = row.plan_selections || {};
  var req = sel.event_requests || {};
  var prov = sel.providers || {};
  var wa = notify.whatsappNumber(row.contact_phone);
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    status: row.status,
    notification_status: row.notification_status || null,
    notified_at: row.notified_at || null,
    contact: { name: row.contact_name, phone: row.contact_phone, email: row.contact_email, whatsapp_url: wa ? "https://wa.me/" + wa : null },
    plan: {
      type: req.event_type || null, date: row.event_date, time: row.approximate_time,
      guests: req.guests || null, zone: req.zone || null, budget: req.budget || null,
      needs: Array.isArray(req.needs) ? req.needs : (req.needs ? String(req.needs).split(/,\s*/) : []),
      notes: row.notes, original_prompt: req.original_prompt || null,
      // null = nunca tocó "¿Alguna restricción?"; [] = la tocó y quedó sin restricciones activas.
      dietary: Array.isArray(req.dietary_requirements) ? req.dietary_requirements : null
    },
    provider: {
      name: prov.name || sel.provider_name || null, category: prov.category || null, address: prov.address || null,
      zone: prov.zone || null, rating: typeof prov.rating === "number" ? prov.rating : null,
      review_count: typeof prov.review_count === "number" ? prov.review_count : null,
      maps_url: https(prov.maps_url), website: https(prov.website)
    },
    event_request_id: sel.event_request_id || null,
    plan_selection_id: row.plan_selection_id,
    selection_status: sel.status || null,
    provider_contacted_at: row.provider_contacted_at || null,
    provider_contact_channel: row.provider_contact_channel || null,
    quotes: (Array.isArray(row.provider_quotes) ? row.provider_quotes : []).slice().sort(function (a, b) {
      return String(b.received_at).localeCompare(String(a.received_at)) || String(b.created_at).localeCompare(String(a.created_at));
    }),
    proposals: (Array.isArray(row.plan_proposals) ? row.plan_proposals : []).slice().sort(function (a, b) {
      return String(b.created_at).localeCompare(String(a.created_at));
    }),
    bookings: (Array.isArray(row.plan_bookings) ? row.plan_bookings : []).slice().sort(function (a, b) {
      return String(b.created_at).localeCompare(String(a.created_at));
    })
  };
}

// Métricas básicas, siempre separadas por moneda (pesos y dólares nunca se suman).
// Sólo reservas confirmadas: las canceladas no cuentan.
function metricsOf(rows) {
  var out = {};
  (rows || []).forEach(function (b) {
    if (b.booking_status !== "confirmed") return;
    var m = out[b.currency] || (out[b.currency] = { count: 0, total: 0, commission_pending: 0, commission_paid: 0 });
    var c = Math.round(Number(b.commission_amount) * 100);
    m.count++;
    m.total += Math.round(Number(b.final_total_amount) * 100);
    if (b.commission_status === "pending" || b.commission_status === "invoiced") m.commission_pending += c;
    if (b.commission_status === "paid") m.commission_paid += c;
  });
  Object.keys(out).forEach(function (k) { ["total", "commission_pending", "commission_paid"].forEach(function (f) { out[k][f] = out[k][f] / 100; }); });
  return out;
}

function explain(err) {
  if (err.code === "PGRST205" || err.code === "42P01") return "Falta alguna tabla en Supabase (plan_inquiries / plan_selections).";
  if (err.code === "42703" || err.code === "PGRST204") return "Falta alguna columna en Supabase. ¿Corriste el último SQL de SUPABASE.md?";
  if (err.code === "PGRST200") return "Supabase no encuentra el vínculo entre tablas. Revisá las claves foráneas de la guía.";
  if (err.code === "23514") return "Ese estado no está permitido en Supabase. ¿Corriste el SQL del panel?";
  return "No pudimos hablar con Supabase. Probá de nuevo.";
}

module.exports = async function handler(req, res) {
  if (!auth.isAuthenticated(req)) {
    return http.sendJson(res, 401, { ok: false, error: "Tu sesión no es válida o venció. Volvé a ingresar." });
  }
  var c = cfg();
  if (!c.url || !c.key || /^sb_publishable_/.test(c.key)) {
    return http.sendJson(res, 503, { ok: false, error: "Falta configurar Supabase en Vercel." });
  }
  var base = store.normalizeUrl(c.url) + "/rest/v1/";

  if (req.method === "GET") {
    try {
      var get = function (select) {
        return store.request(fetch, base + "plan_inquiries?select=" + encodeURIComponent(select) +
          "&order=created_at.desc&limit=" + LIMIT, { method: "GET", headers: store.headersFor(c.key) }, "listar");
      };
      // Si la columna de restricciones todavía no existiera, se lista igual (sin ese dato).
      var list = function (select) {
        return get(select).catch(function (e) {
          if (["42703", "PGRST204", "PGRST200"].indexOf(e.code) === -1 || !/dietary_requirements/.test(String(e.message))) throw e;
          return get(select.replace(",dietary_requirements)", ")"));
        });
      };
      // Si todavía no se corrió algún SQL (reservas, propuestas o cotizaciones), el panel sigue
      // funcionando sin esa parte: se prueba de lo más completo a lo más básico.
      var MISSING = ["PGRST200", "PGRST201", "PGRST204", "42703", "42P01", "PGRST205"];
      var schemaReady = true, proposalsReady = true, bookingsReady = true, rows;
      var quotesOnly = function () {
        // Primero con el vínculo por nombre; si Supabase no lo reconoce, sin nombre (como antes).
        return list(SELECT_QUOTES).catch(function (e) {
          if (e.code !== "PGRST200") throw e;
          return list(SELECT_QUOTES.replace("provider_quotes!provider_quotes_plan_inquiry_id_fkey(", "provider_quotes("));
        });
      };
      var steps = [
        function () { return list(SELECT); },
        function () { bookingsReady = false; return list(SELECT_PROPOSALS); },
        function () { proposalsReady = false; return quotesOnly(); },
        function () { schemaReady = false; return list(SELECT_BASE); }
      ];
      for (var i = 0; i < steps.length; i++) {
        try { rows = await steps[i](); break; }
        catch (errStep) {
          if (MISSING.indexOf(errStep.code) === -1 || i === steps.length - 1) throw errStep;
          console.error("[admin] falta un SQL (" + ["reservas", "propuestas", "cotizaciones"][i] + "):", errStep.code);
        }
      }
      // Métricas sobre TODAS las reservas confirmadas (no sólo las solicitudes de la lista).
      var metrics = null;
      if (bookingsReady) {
        try {
          metrics = metricsOf(await store.request(fetch, base + "plan_bookings?select=booking_status,currency,final_total_amount,commission_amount,commission_status&booking_status=eq.confirmed",
            { method: "GET", headers: store.headersFor(c.key) }, "métricas"));
        } catch (errM) { console.error("[admin] métricas:", errM.code || ""); }
      }
      var items = (rows || []).map(toItem);
      return http.sendJson(res, 200, {
        ok: true, statuses: inquiries.STATUSES, schema_ready: schemaReady, proposals_ready: proposalsReady,
        bookings_ready: bookingsReady, metrics: metrics,
        count: items.length, items: items
      });
    } catch (err) {
      console.error("[admin] listar:", err.status || "", err.code || "", err.message);
      return http.sendJson(res, 502, { ok: false, error: explain(err) });
    }
  }

  if (req.method === "PATCH") {
    // Defensa extra contra pedidos desde otros sitios (además de SameSite=Strict).
    if (req.headers["x-listo-admin"] !== "1") return http.sendJson(res, 403, { ok: false, error: "Pedido no permitido." });
    var body = await http.readJson(req, 1000);
    var id = body && String(body.id || "");
    var status = body && String(body.status || "");
    if (!UUID_RE.test(id)) return http.sendJson(res, 400, { ok: false, error: "Solicitud no válida." });

    if (body.action === "mark_contacted") {
      var channel = String(body.channel || "");
      if (CHANNELS.indexOf(channel) === -1) return http.sendJson(res, 400, { ok: false, error: "Elegí por dónde contactaste al proveedor." });
      try {
        var current = await store.request(fetch, base + "plan_inquiries?select=id,status&id=eq." + encodeURIComponent(id),
          { method: "GET", headers: store.headersFor(c.key) }, "leer solicitud");
        if (!current || !current[0]) return http.sendJson(res, 404, { ok: false, error: "No encontramos esa solicitud." });
        var now = new Date().toISOString();
        var patch = { provider_contacted_at: now, provider_contact_channel: channel, updated_at: now };
        // Sólo avanza desde "Nueva": nunca retrocede una solicitud ya cotizada, confirmada o cerrada.
        if (current[0].status === "inquiry_requested") patch.status = "provider_contacted";
        var done = await store.request(fetch, base + "plan_inquiries?id=eq." + encodeURIComponent(id) +
          "&select=id,status,updated_at,provider_contacted_at,provider_contact_channel", {
          method: "PATCH", headers: store.headersFor(c.key, { "Prefer": "return=representation" }), body: JSON.stringify(patch)
        }, "marcar contactado");
        return http.sendJson(res, 200, { ok: true, item: done[0] });
      } catch (err) {
        console.error("[admin] marcar contactado:", err.status || "", err.code || "", err.message);
        return http.sendJson(res, 502, { ok: false, error: explain(err) });
      }
    }

    if (inquiries.STATUSES.indexOf(status) === -1) return http.sendJson(res, 400, { ok: false, error: "Estado no válido." });

    // Reserva y estado nunca se contradicen:
    // - Confirmado sólo con una reserva registrada (se llega con CONFIRMAR RESERVA).
    // - Con una reserva activa, sólo Confirmado, Completado o Cancelado (que también cancela la reserva).
    var active = null, bookingCancelled = null;
    try {
      active = await bookings.activeFor(c, id);
    } catch (errB) {
      if (!bookings.missingTable(errB)) {
        console.error("[admin] leer reserva:", errB.code || "");
        return http.sendJson(res, 502, { ok: false, error: explain(errB) });
      }
      if (status === "confirmed") return http.sendJson(res, 409, { ok: false, error: "Para confirmar, corré primero el SQL de reservas (SUPABASE.md, Paso 10) y usá CONFIRMAR RESERVA." });
    }
    if (status === "confirmed" && !active) {
      return http.sendJson(res, 409, { ok: false, error: "Confirmado se marca con CONFIRMAR RESERVA (en el detalle), cargando el monto y la comisión." });
    }
    if (active && ["confirmed", "completed", "cancelled"].indexOf(status) === -1) {
      return http.sendJson(res, 409, { ok: false, error: "Esta solicitud tiene una reserva confirmada. Para volver atrás, primero cancelá la reserva." });
    }
    if (active && status === "cancelled") {
      try {
        var cancelled = await bookings.cancelActive(c, id);
        if (cancelled.error) return http.sendJson(res, cancelled.status || 409, { ok: false, error: cancelled.error });
        bookingCancelled = cancelled.booking;
      } catch (errC) {
        console.error("[admin] cancelar reserva:", errC.code || "");
        return http.sendJson(res, 502, { ok: false, error: explain(errC) });
      }
    }
    try {
      var updated = await store.request(fetch, base + "plan_inquiries?id=eq." + encodeURIComponent(id) + "&select=id,status,updated_at", {
        method: "PATCH",
        headers: store.headersFor(c.key, { "Prefer": "return=representation" }),
        body: JSON.stringify({ status: status, updated_at: new Date().toISOString() })
      }, "cambiar estado");
      var row = Array.isArray(updated) ? updated[0] : null;
      if (!row) return http.sendJson(res, 404, { ok: false, error: "No encontramos esa solicitud." });
      return http.sendJson(res, 200, { ok: true, item: row, booking: bookingCancelled });
    } catch (err) {
      console.error("[admin] cambiar estado:", err.status || "", err.code || "", err.message);
      var msg = err.code === "23505"
        ? "Ya hay otra solicitud abierta para esa misma elección. Cerrá (Cancelado/Completado) una antes de reabrir la otra."
        : explain(err);
      return http.sendJson(res, err.code === "23505" ? 409 : 502, { ok: false, error: msg });
    }
  }

  res.setHeader("Allow", "GET, PATCH");
  return http.sendJson(res, 405, { ok: false, error: "Método no permitido." });
};
