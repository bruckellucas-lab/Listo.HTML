/* =========================================================
   LISTO — Función serverless de Vercel (PANEL INTERNO)
   Ruta: POST /api/admin-proposals
   Cuerpo: { plan_inquiry_id, provider_quote_id }

   Genera la propuesta pública (/propuesta/CODE) para una cotización.
   - Si ya hay una propuesta "Enviada" con esa misma cotización, devuelve esa.
   - Si había otra "Enviada" con una cotización anterior, queda "Reemplazada".
   - No cambia el estado de la solicitud (Confirmado sigue siendo manual).

   Sólo con el pase de /admin.
   ========================================================= */
"use strict";

var http = require("./_lib/http");
var auth = require("./_lib/admin-auth");
var store = require("./_lib/providers-store");
var proposals = require("./_lib/proposals");

var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var FIELDS = "id,created_at,public_code,status,provider_quote_id,first_viewed_at,last_viewed_at,view_count,responded_at,user_comment";

function explain(err) {
  if (err.code === "PGRST205" || err.code === "42P01") return "Falta crear la tabla plan_proposals. Corré el SQL de SUPABASE.md (Paso 9).";
  if (err.code === "PGRST204" || err.code === "42703") return "Falta alguna columna en Supabase. Corré el SQL de SUPABASE.md (Paso 9).";
  if (err.code === "23503") return "No encontramos esa solicitud o cotización.";
  return "No pudimos generar la propuesta. Probá de nuevo.";
}

module.exports = async function handler(req, res) {
  if (!auth.isAuthenticated(req)) {
    return http.sendJson(res, 401, { ok: false, error: "Tu sesión no es válida o venció. Volvé a ingresar." });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return http.sendJson(res, 405, { ok: false, error: "Método no permitido." });
  }
  if (req.headers["x-listo-admin"] !== "1") return http.sendJson(res, 403, { ok: false, error: "Pedido no permitido." });
  var url = http.env("SUPABASE_URL"), key = http.env("SUPABASE_SECRET_KEY");
  if (!url || !key || /^sb_publishable_/.test(key)) return http.sendJson(res, 503, { ok: false, error: "Falta configurar Supabase en Vercel." });

  if (!http.requireJson(req, res)) return;
  var body = await http.readJson(req, 2000);
  if (!body) return http.sendJson(res, 400, { ok: false, error: "No pudimos leer el pedido." });
  var inquiryId = String(body.plan_inquiry_id || ""), quoteId = String(body.provider_quote_id || "");
  if (!UUID_RE.test(inquiryId) || !UUID_RE.test(quoteId)) return http.sendJson(res, 400, { ok: false, error: "Solicitud o cotización no válida." });

  var cfg = { url: url, key: key };
  var call = function (path, method, step, payload, prefer) {
    var opts = { method: method, headers: store.headersFor(key, prefer ? { "Prefer": prefer } : undefined) };
    if (payload) opts.body = JSON.stringify(payload);
    return store.request(fetch, proposals.api(cfg, path), opts, step);
  };

  try {
    // La cotización tiene que ser de esta solicitud.
    var quote = await call("provider_quotes?select=id&id=eq." + quoteId + "&plan_inquiry_id=eq." + inquiryId, "GET", "leer cotización");
    if (!quote || !quote[0]) return http.sendJson(res, 404, { ok: false, error: "Esa cotización no es de esta solicitud." });

    var open = await call("plan_proposals?select=" + FIELDS + "&plan_inquiry_id=eq." + inquiryId + "&status=eq.proposal_sent", "GET", "leer propuestas");
    var same = (open || []).filter(function (p) { return p.provider_quote_id === quoteId; })[0];
    if (same) return http.sendJson(res, 200, { ok: true, proposal: same, created: false });

    var now = new Date().toISOString();
    if (open && open.length) {
      await call("plan_proposals?plan_inquiry_id=eq." + inquiryId + "&status=eq.proposal_sent", "PATCH", "reemplazar propuesta",
        { status: "proposal_replaced", updated_at: now }, "return=minimal");
    }

    // Código nuevo; si justo coincide con uno existente (casi imposible), se prueba otro.
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        var created = await call("plan_proposals?select=" + FIELDS, "POST", "crear propuesta", {
          public_code: proposals.newCode(), plan_inquiry_id: inquiryId, provider_quote_id: quoteId, status: "proposal_sent"
        }, "return=representation");
        return http.sendJson(res, 200, { ok: true, proposal: created && created[0], created: true, replaced: (open || []).length });
      } catch (err) {
        if (err.code === "23505" && /public_code/.test(String(err.message || "") + String(err.details || ""))) continue;
        if (err.code === "23505") {
          // Alguien generó otra propuesta al mismo tiempo: se devuelve la que quedó abierta.
          var now2 = await call("plan_proposals?select=" + FIELDS + "&plan_inquiry_id=eq." + inquiryId + "&status=eq.proposal_sent", "GET", "leer propuestas");
          if (now2 && now2[0]) return http.sendJson(res, 200, { ok: true, proposal: now2[0], created: false });
        }
        throw err;
      }
    }
    return http.sendJson(res, 502, { ok: false, error: "No pudimos generar la propuesta. Probá de nuevo." });
  } catch (err) {
    console.error("[admin-proposals]", err.step || "", err.status || "", err.code || "", err.message);
    return http.sendJson(res, 502, { ok: false, error: explain(err) });
  }
};
