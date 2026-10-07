/* =========================================================
   LISTO — Función serverless de Vercel (PANEL INTERNO)
   Ruta: /api/admin-quotes
   GET  ?plan_inquiry_id=…  → cotizaciones de esa solicitud (más nueva primero)
   POST { plan_inquiry_id, total_price, price_per_person, currency, includes,
          conditions, deposit, availability, valid_until, received_at, internal_notes }
        → guarda una cotización NUEVA (las anteriores quedan como historial)
          y pasa la solicitud a "Cotizado" si estaba en Nueva / Contactando / Cotizado.
          Confirmado, Cancelado y Completado no se tocan (Confirmado es manual).

   Sólo con el pase de /admin. Los datos los carga LISTO a mano después de
   hablar con el proveedor: nada se completa desde Google.
   ========================================================= */
"use strict";

var http = require("./_lib/http");
var auth = require("./_lib/admin-auth");
var store = require("./_lib/providers-store");
var validDate = require("./_lib/calendar").validDate;

var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var FIELDS = "id,created_at,received_at,total_price,price_per_person,currency,includes,conditions,deposit,availability,valid_until,internal_notes";
var MOVES_TO_QUOTED = ["inquiry_requested", "provider_contacted", "quoted"];

function text(v, max) {
  var s = String(v === undefined || v === null ? "" : v).trim().slice(0, max);
  return s || null;
}

// Precio: número >= 0, o vacío. Acepta "1.250.000" o "1250000,50" (formato argentino).
function price(v) {
  if (v === undefined || v === null || v === "") return { value: null };
  if (typeof v === "number") return isFinite(v) && v >= 0 && v < 1e12 ? { value: Math.round(v * 100) / 100 } : { error: true };
  var s = String(v).replace(/[$\s]/g, "");
  if (/,/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { error: true };
  var n = parseFloat(s);
  return n < 1e12 ? { value: n } : { error: true };
}

function validate(b) {
  if (!UUID_RE.test(String(b.plan_inquiry_id || ""))) return { error: "Solicitud no válida." };
  var total = price(b.total_price), perPerson = price(b.price_per_person);
  if (total.error) return { error: "Revisá el precio total (sólo números)." };
  if (perPerson.error) return { error: "Revisá el precio por persona (sólo números)." };
  if (total.value === null && perPerson.value === null) return { error: "Cargá al menos un precio: total o por persona." };
  var currency = String(b.currency || "ARS");
  if (["ARS", "USD"].indexOf(currency) === -1) return { error: "Moneda no válida." };
  var availability = String(b.availability || "pending");
  if (["yes", "no", "pending"].indexOf(availability) === -1) return { error: "Disponibilidad no válida." };
  var validUntil = text(b.valid_until, 10);
  if (validUntil && !validDate(validUntil)) return { error: "Revisá la fecha de validez." };
  var receivedDay = text(b.received_at, 10);
  if (receivedDay && !validDate(receivedDay)) return { error: "Revisá la fecha de recepción." };
  var today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);   // hoy en Argentina
  if (receivedDay && receivedDay > today) return { error: "La fecha de recepción no puede ser futura." };
  // Si es hoy, se guarda la hora actual; si es otro día, el mediodía de ese día (hora de Argentina).
  var receivedAt = !receivedDay || receivedDay === today ? new Date().toISOString() : new Date(receivedDay + "T12:00:00-03:00").toISOString();
  return { data: {
    plan_inquiry_id: String(b.plan_inquiry_id),
    received_at: receivedAt,
    total_price: total.value,
    price_per_person: perPerson.value,
    currency: currency,
    includes: text(b.includes, 2000),
    conditions: text(b.conditions, 2000),
    deposit: text(b.deposit, 300),
    availability: availability,
    valid_until: validUntil,
    internal_notes: text(b.internal_notes, 2000)
  } };
}

function explain(err) {
  if (err.code === "PGRST205" || err.code === "42P01") return "Falta crear la tabla provider_quotes. Corré el SQL de SUPABASE.md (Paso 8).";
  if (err.code === "PGRST204" || err.code === "42703") return "Falta alguna columna en Supabase. Corré el SQL de SUPABASE.md (Paso 8).";
  if (err.code === "23503") return "No encontramos esa solicitud.";
  if (err.code === "23514") return "Algún dato no es válido (revisá precios, moneda y disponibilidad).";
  return "No pudimos guardar la cotización. Probá de nuevo.";
}

module.exports = async function handler(req, res) {
  if (!auth.isAuthenticated(req)) {
    return http.sendJson(res, 401, { ok: false, error: "Tu sesión no es válida o venció. Volvé a ingresar." });
  }
  var url = http.env("SUPABASE_URL"), key = http.env("SUPABASE_SECRET_KEY");
  if (!url || !key || /^sb_publishable_/.test(key)) return http.sendJson(res, 503, { ok: false, error: "Falta configurar Supabase en Vercel." });
  var base = store.normalizeUrl(url) + "/rest/v1/";
  var get = function (path, step) { return store.request(fetch, base + path, { method: "GET", headers: store.headersFor(key) }, step); };

  if (req.method === "GET") {
    var inquiryId = String(http.queryOf(req).plan_inquiry_id || "");
    if (!UUID_RE.test(inquiryId)) return http.sendJson(res, 400, { ok: false, error: "Solicitud no válida." });
    try {
      var quotes = await get("provider_quotes?select=" + FIELDS + "&plan_inquiry_id=eq." + inquiryId + "&order=received_at.desc,created_at.desc", "listar cotizaciones");
      return http.sendJson(res, 200, { ok: true, quotes: quotes || [] });
    } catch (err) {
      console.error("[admin-quotes] listar:", err.status || "", err.code || "", err.message);
      return http.sendJson(res, 502, { ok: false, error: explain(err) });
    }
  }

  if (req.method === "POST") {
    if (req.headers["x-listo-admin"] !== "1") return http.sendJson(res, 403, { ok: false, error: "Pedido no permitido." });
    if (!http.requireJson(req, res)) return;
    var body = await http.readJson(req, 12000);
    if (!body) return http.sendJson(res, 400, { ok: false, error: "No pudimos leer el formulario." });
    var checked = validate(body);
    if (checked.error) return http.sendJson(res, 400, { ok: false, error: checked.error });
    var d = checked.data;
    try {
      var inquiry = await get("plan_inquiries?select=id,status&id=eq." + d.plan_inquiry_id, "leer solicitud");
      if (!inquiry || !inquiry[0]) return http.sendJson(res, 404, { ok: false, error: "No encontramos esa solicitud." });

      // 1) Cotización nueva (nunca se pisa una anterior: queda el historial).
      var created = await store.request(fetch, base + "provider_quotes?select=" + FIELDS, {
        method: "POST", headers: store.headersFor(key, { "Prefer": "return=representation" }), body: JSON.stringify(d)
      }, "guardar cotización");

      // 2) Estado: a "Cotizado" si estaba en Nueva / Contactando / Cotizado. Siempre updated_at = ahora.
      var patch = { updated_at: new Date().toISOString() };
      var moved = MOVES_TO_QUOTED.indexOf(inquiry[0].status) !== -1;
      if (moved) patch.status = "quoted";
      var upd = await store.request(fetch, base + "plan_inquiries?id=eq." + d.plan_inquiry_id + "&select=id,status,updated_at", {
        method: "PATCH", headers: store.headersFor(key, { "Prefer": "return=representation" }), body: JSON.stringify(patch)
      }, "actualizar solicitud");

      return http.sendJson(res, 200, {
        ok: true,
        quote: created && created[0],
        item: upd && upd[0],
        status_changed: moved && inquiry[0].status !== "quoted"
      });
    } catch (err) {
      console.error("[admin-quotes] guardar:", err.step || "", err.status || "", err.code || "", err.message);
      return http.sendJson(res, 502, { ok: false, error: explain(err) });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return http.sendJson(res, 405, { ok: false, error: "Método no permitido." });
};
