/* =========================================================
   LISTO — Propuestas para el usuario (tabla plan_proposals)
   - Código público de 12 caracteres, aleatorio y seguro: no se
     deriva de ningún ID interno.
   - Lo que ve el usuario sale de lo que YA está en Supabase
     (proveedor, pedido, cotización). Google sólo se usa para la
     foto, con caché corta en el servidor.
   - Nunca se exponen IDs internos, notas internas ni datos personales.
   ========================================================= */
"use strict";

var crypto = require("crypto");
var store = require("./providers-store");

var CODE_RE = /^[A-Za-z0-9]{12}$/;
var ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
var STATUSES = ["proposal_sent", "proposal_accepted", "proposal_declined", "proposal_replaced"];

// 12 caracteres al azar (62 posibles cada uno) usando el generador seguro del sistema.
function newCode() {
  var out = "";
  while (out.length < 12) {
    var bytes = crypto.randomBytes(24);
    for (var i = 0; i < bytes.length && out.length < 12; i++) {
      if (bytes[i] < 248) out += ALPHABET[bytes[i] % 62];   // descarta valores que sesgarían el reparto
    }
  }
  return out;
}

// Hoy en Argentina (UTC-3), formato AAAA-MM-DD.
function todayAR() {
  return new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
}

function isExpired(validUntil, today) {
  return !!validUntil && String(validUntil) < (today || todayAR());
}

// Consulta de una propuesta con todo lo necesario (vínculos con nombre explícito).
var PROPOSAL_SELECT = [
  "id", "created_at", "public_code", "status", "plan_inquiry_id", "provider_quote_id",
  "first_viewed_at", "last_viewed_at", "view_count", "responded_at", "user_comment",
  "provider_quotes!plan_proposals_provider_quote_id_fkey(id,total_price,price_per_person,currency,includes,conditions,deposit,availability,valid_until)",
  "plan_inquiries!plan_proposals_plan_inquiry_id_fkey(id,event_date,approximate_time," +
    "plan_selections(provider_google_place_id,provider_name," +
    "event_requests(event_type,guests,zone)," +
    "providers(name,category,address,zone,maps_url)))"
].join(",");

function api(cfg, path) { return store.normalizeUrl(cfg.url) + "/rest/v1/" + path; }

function loadByCode(cfg, code, fetchImpl) {
  return store.request(fetchImpl || fetch, api(cfg, "plan_proposals?select=" + encodeURIComponent(PROPOSAL_SELECT) +
    "&public_code=eq." + encodeURIComponent(code)), { method: "GET", headers: store.headersFor(cfg.key) }, "leer propuesta")
    .then(function (rows) { return Array.isArray(rows) && rows.length ? rows[0] : null; });
}

function https(u) { return typeof u === "string" && /^https:\/\//.test(u) ? u : null; }
function num(v) { return v === null || v === undefined || v === "" ? null : Number(v); }

// Lo ÚNICO que se le muestra al usuario. Sin IDs, notas internas ni datos personales.
function toPublic(row, today) {
  var q = row.provider_quotes || {};
  var inq = row.plan_inquiries || {};
  var sel = inq.plan_selections || {};
  var req = sel.event_requests || {};
  var prov = sel.providers || {};
  var expired = isExpired(q.valid_until, today);
  return {
    status: row.status,
    responded_at: row.responded_at || null,
    place: {
      name: prov.name || sel.provider_name || null,
      category: prov.category || null,
      address: prov.address || null,
      zone: prov.zone || null,
      maps_url: https(prov.maps_url)
    },
    plan: {
      type: req.event_type || null,
      date: inq.event_date || null,
      time: inq.approximate_time || null,
      guests: req.guests || null,
      zone: req.zone || null
    },
    quote: {
      total_price: num(q.total_price),
      price_per_person: num(q.price_per_person),
      currency: q.currency || "ARS",
      includes: q.includes || null,
      conditions: q.conditions || null,
      deposit: q.deposit || null,
      availability: q.availability || "pending",
      valid_until: q.valid_until || null,
      expired: expired
    },
    // Aceptar sólo si sigue abierta, no venció y el lugar no dijo que no tiene lugar.
    can_accept: row.status === "proposal_sent" && !expired && q.availability !== "no",
    can_decline: row.status === "proposal_sent"
  };
}

module.exports = {
  CODE_RE: CODE_RE, STATUSES: STATUSES,
  newCode: newCode, todayAR: todayAR, isExpired: isExpired,
  loadByCode: loadByCode, toPublic: toPublic, api: api
};
