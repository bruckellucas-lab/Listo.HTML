/* =========================================================
   LISTO — Función serverless de Vercel (PÚBLICA)
   Ruta: /api/proposal
   GET  ?code=XXXXXXXXXXXX  → datos de la propuesta para /propuesta/CODE
   POST { code, action: "accept" | "decline", comment? }

   - Pedido y cotización salen de Supabase. Los datos del lugar
     (nombre, dirección, categoría, link de Maps y 1 foto) se piden a
     Google en cada apertura, en UN solo pedido de Place Details, y no
     se guardan (G1B). Si Google falla, la propuesta abre igual con un
     aviso honesto y el link a Maps.
   - Si el que abre es el equipo de LISTO (sesión de /admin), la visita
     NO se cuenta.
   - Aceptar NO confirma la reserva: la solicitud sigue en su estado
     y LISTO termina de confirmar con el lugar.
   - Nunca se devuelven IDs internos, notas internas ni datos personales.
   ========================================================= */
"use strict";

var http = require("./_lib/http");
var auth = require("./_lib/admin-auth");
var store = require("./_lib/providers-store");
var photos = require("./_lib/photos");
var placeDetails = require("./_lib/place-details");
var proposals = require("./_lib/proposals");
var notify = require("./_lib/notify");
var rateLimit = require("./_lib/rate-limit");

var WINDOW_MS = 10 * 60 * 1000;
var MAX_VIEWS = 60;        // aperturas por IP cada 10 minutos
var MAX_MISSES = 8;        // códigos inexistentes por IP cada 10 minutos (corta los intentos de adivinar)
var hits = { view: {}, miss: {} };   // las respuestas se limitan en Supabase (rate-limit.js)

function ipOf(req) {
  return String(req.headers["x-forwarded-for"] || (req.socket && req.socket.remoteAddress) || "?").split(",")[0].trim();
}
function count(kind, ip, add) {
  var now = Date.now();
  var list = (hits[kind][ip] || []).filter(function (t) { return now - t < WINDOW_MS; });
  if (add) list.push(now);
  hits[kind][ip] = list;
  if (Object.keys(hits[kind]).length > 5000) hits[kind] = {};
  return list.length;
}

// Lugar + foto: UN pedido a Google por apertura (nada se cachea ni se guarda).
async function liveFor(placeId) {
  var live = await placeDetails.fetchPlace(placeId, "proposal");
  var secret = photos.signingSecret();
  var photo = live.ok && secret ? photos.photosForPlace(live.raw, secret, { max: 1 })[0] || null : null;
  return { place: live, photo: photo };   // sin foto o sin datos, la propuesta se muestra igual
}

function placeIdOf(row) {
  var inq = row.plan_inquiries || {};
  return (inq.plan_selections || {}).provider_google_place_id || "";
}

function noindex(res) { res.setHeader("X-Robots-Tag", "noindex, nofollow"); }

function cfgOrNull() {
  var url = http.env("SUPABASE_URL"), key = http.env("SUPABASE_SECRET_KEY");
  if (!url || !key || /^sb_publishable_/.test(key)) return null;
  return { url: url, key: key };
}

function adminUrlOf(req) {
  var host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  return /^[A-Za-z0-9.-]+(:\d+)?$/.test(host) ? "https://" + host + "/admin" : "";
}

// Lo que se devuelve según el estado (si fue reemplazada, no se muestran los datos viejos).
// live = { place, photo } sólo al abrir; en las respuestas (POST) va null: no se vuelve a llamar a Google.
function publicPayload(row, live) {
  if (row.status === "proposal_replaced") return { ok: true, proposal: { status: row.status } };
  var out = proposals.toPublic(row, undefined, live ? live.place : null);
  out.photo = live ? live.photo || null : null;
  return { ok: true, proposal: out };
}

async function handleGet(req, res, cfg) {
  var ip = ipOf(req);
  if (count("miss", ip, false) >= MAX_MISSES || count("view", ip, true) > MAX_VIEWS) {
    return http.sendJson(res, 429, { ok: false, error: "Demasiados intentos seguidos. Esperá unos minutos." });
  }
  var code = String(http.queryOf(req).code || "");
  if (!proposals.CODE_RE.test(code)) {
    count("miss", ip, true);
    return http.sendJson(res, 404, { ok: false, error: "not_found" });
  }
  var row;
  try { row = await proposals.loadByCode(cfg, code); }
  catch (err) {
    console.error("[proposal] leer:", err.status || "", err.code || "");
    return http.sendJson(res, 502, { ok: false, error: "No pudimos cargar la propuesta. Probá de nuevo en un rato." });
  }
  if (!row) {
    count("miss", ip, true);
    return http.sendJson(res, 404, { ok: false, error: "not_found" });
  }

  var preview = auth.isAuthenticated(req);
  if (!preview) {
    // Cuenta la visita (si falla, la propuesta se muestra igual).
    var now = new Date().toISOString();
    var patch = { last_viewed_at: now, view_count: (Number(row.view_count) || 0) + 1 };
    if (!row.first_viewed_at) patch.first_viewed_at = now;
    try {
      await store.request(fetch, proposals.api(cfg, "plan_proposals?id=eq." + row.id), {
        method: "PATCH", headers: store.headersFor(cfg.key, { "Prefer": "return=minimal" }), body: JSON.stringify(patch)
      }, "contar visita");
    } catch (err) { console.error("[proposal] visita:", err.status || "", err.code || ""); }
  }

  var live = row.status === "proposal_replaced" ? null : await liveFor(placeIdOf(row));
  var payload = publicPayload(row, live);
  if (preview) payload.preview = true;
  return http.sendJson(res, 200, payload);
}

async function handlePost(req, res, cfg) {
  var ip = ipOf(req);
  if (count("miss", ip, false) >= MAX_MISSES) {
    return http.sendJson(res, 429, { ok: false, error: "Demasiados intentos seguidos. Esperá unos minutos." });
  }
  if (!http.requireJson(req, res)) return;
  if (!(await rateLimit.guard(req, res, "proposal_response"))) return;
  var body = await http.readJson(req, 6000);
  if (!body || typeof body !== "object") return http.sendJson(res, 400, { ok: false, error: "No pudimos leer tu respuesta. Probá de nuevo." });
  var code = String(body.code || "");
  var action = String(body.action || "");
  if (!proposals.CODE_RE.test(code)) { count("miss", ip, true); return http.sendJson(res, 404, { ok: false, error: "not_found" }); }
  if (action !== "accept" && action !== "decline") return http.sendJson(res, 400, { ok: false, error: "Respuesta no válida." });
  var comment = action === "decline" ? String(body.comment || "").trim().slice(0, 1000) || null : null;

  try {
    var row = await proposals.loadByCode(cfg, code);
    if (!row) { count("miss", ip, true); return http.sendJson(res, 404, { ok: false, error: "not_found" }); }

    var target = action === "accept" ? "proposal_accepted" : "proposal_declined";
    // Ya respondida: si es la misma respuesta (doble toque), se confirma sin repetir nada.
    if (row.status === target) return http.sendJson(res, 200, publicPayload(row, null));
    if (row.status !== "proposal_sent") {
      return http.sendJson(res, 409, Object.assign({ error: "Esta propuesta ya no admite respuestas." }, publicPayload(row, null), { ok: false }));
    }

    // El servidor vuelve a revisar la fecha y la disponibilidad antes de aceptar.
    var quote = row.provider_quotes || {};
    if (action === "accept" && proposals.isExpired(quote.valid_until)) {
      return http.sendJson(res, 409, Object.assign(publicPayload(row, null), { ok: false, error: "Esta cotización venció." }));
    }
    if (action === "accept" && quote.availability === "no") {
      return http.sendJson(res, 409, Object.assign(publicPayload(row, null), { ok: false, error: "El lugar no tiene disponibilidad para esta fecha." }));
    }

    var now = new Date().toISOString();
    // Sólo cambia si sigue "Enviada" (si dos respuestas llegan juntas, gana la primera).
    var updated = await store.request(fetch, proposals.api(cfg, "plan_proposals?id=eq." + row.id + "&status=eq.proposal_sent&select=id,status"), {
      method: "PATCH", headers: store.headersFor(cfg.key, { "Prefer": "return=representation" }),
      body: JSON.stringify({ status: target, responded_at: now, user_comment: comment, updated_at: now })
    }, "guardar respuesta");
    var fresh = await proposals.loadByCode(cfg, code);
    if (!Array.isArray(updated) || !updated.length) {
      var same = fresh && fresh.status === target;
      return http.sendJson(res, same ? 200 : 409, Object.assign(publicPayload(fresh || row, null), same ? {} : { ok: false, error: "Esta propuesta ya no admite respuestas." }));
    }

    // La respuesta ya está guardada. El email se intenta después y no cambia lo que ve el usuario.
    try {
      await notify.notifyProposalResponse(cfg, {
        planInquiryId: row.plan_inquiry_id, action: action, comment: comment, quote: quote, adminUrl: adminUrlOf(req)
      });
    } catch (e) { console.error("[proposal] aviso:", e && e.message); }

    return http.sendJson(res, 200, publicPayload(fresh || Object.assign({}, row, { status: target, responded_at: now }), null));
  } catch (err) {
    console.error("[proposal] responder:", err.step || "", err.status || "", err.code || "");
    return http.sendJson(res, 502, { ok: false, error: "No pudimos guardar tu respuesta. Probá de nuevo." });
  }
}

module.exports = async function handler(req, res) {
  noindex(res);
  var cfg = cfgOrNull();
  if (req.method === "GET" || req.method === "POST") {
    if (!cfg) return http.sendJson(res, 503, { ok: false, error: "LISTO no puede mostrar propuestas en este momento." });
    return req.method === "GET" ? handleGet(req, res, cfg) : handlePost(req, res, cfg);
  }
  res.setHeader("Allow", "GET, POST");
  return http.sendJson(res, 405, { ok: false, error: "Método no permitido." });
};
