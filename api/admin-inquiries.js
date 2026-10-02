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

var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var LIMIT = 500;

var QUOTE_FIELDS = "id,created_at,received_at,total_price,price_per_person,currency,includes,conditions,deposit,availability,valid_until,internal_notes";

var SELECT_BASE = [
  "id", "created_at", "updated_at", "status", "notification_status", "notified_at",
  "contact_name", "contact_phone", "contact_email", "event_date", "approximate_time", "notes", "plan_selection_id",
  "plan_selections(id,created_at,status,event_request_id,provider_google_place_id,provider_name," +
    "event_requests(id,created_at,event_type,guests,zone,budget,needs,original_prompt)," +
    "providers(name,category,address,zone,rating,review_count,maps_url,website))"
].join(",");
// Con cotizaciones: suma contacto con el proveedor y cotizaciones (requiere el SQL del Paso 8).
// Los vínculos van con nombre explícito para que Supabase no se confunda con plan_proposals.
var SELECT_QUOTES = SELECT_BASE + ",provider_contacted_at,provider_contact_channel," +
  "provider_quotes!provider_quotes_plan_inquiry_id_fkey(" + QUOTE_FIELDS + ")";
// Completo: suma las propuestas enviadas al usuario (requiere el SQL del Paso 9).
var PROPOSAL_FIELDS = "id,created_at,public_code,status,provider_quote_id,first_viewed_at,last_viewed_at,view_count,responded_at,user_comment";
var SELECT = SELECT_QUOTES + ",plan_proposals!plan_proposals_plan_inquiry_id_fkey(" + PROPOSAL_FIELDS + ")";
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
      notes: row.notes, original_prompt: req.original_prompt || null
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
    })
  };
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
      var list = function (select) {
        return store.request(fetch, base + "plan_inquiries?select=" + encodeURIComponent(select) +
          "&order=created_at.desc&limit=" + LIMIT, { method: "GET", headers: store.headersFor(c.key) }, "listar");
      };
      // Si todavía no se corrió algún SQL (propuestas o cotizaciones), el panel sigue funcionando sin esa parte.
      var MISSING = ["PGRST200", "PGRST201", "PGRST204", "42703", "42P01", "PGRST205"];
      var schemaReady = true, proposalsReady = true, rows;
      try {
        rows = await list(SELECT);
      } catch (err) {
        if (MISSING.indexOf(err.code) === -1) throw err;
        console.error("[admin] falta el SQL de propuestas:", err.code);
        proposalsReady = false;
        try {
          // Primero con el vínculo por nombre; si Supabase no lo reconoce, sin nombre (como antes).
          rows = await list(SELECT_QUOTES).catch(function (e) {
            if (e.code !== "PGRST200") throw e;
            return list(SELECT_QUOTES.replace("provider_quotes!provider_quotes_plan_inquiry_id_fkey(", "provider_quotes("));
          });
        } catch (err2) {
          if (MISSING.indexOf(err2.code) === -1) throw err2;
          console.error("[admin] falta el SQL de cotizaciones:", err2.code);
          schemaReady = false;
          rows = await list(SELECT_BASE);
        }
      }
      var items = (rows || []).map(toItem);
      return http.sendJson(res, 200, {
        ok: true, statuses: inquiries.STATUSES, schema_ready: schemaReady, proposals_ready: proposalsReady,
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
    try {
      var updated = await store.request(fetch, base + "plan_inquiries?id=eq." + encodeURIComponent(id) + "&select=id,status,updated_at", {
        method: "PATCH",
        headers: store.headersFor(c.key, { "Prefer": "return=representation" }),
        body: JSON.stringify({ status: status, updated_at: new Date().toISOString() })
      }, "cambiar estado");
      var row = Array.isArray(updated) ? updated[0] : null;
      if (!row) return http.sendJson(res, 404, { ok: false, error: "No encontramos esa solicitud." });
      return http.sendJson(res, 200, { ok: true, item: row });
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
