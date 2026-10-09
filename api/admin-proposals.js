/* =========================================================
   LISTO — Función serverless de Vercel (PANEL INTERNO)
   Ruta: POST /api/admin-proposals
   Cuerpo: { plan_inquiry_id, provider_quote_id, expected_proposal_id, proposal_id }

   Genera la propuesta pública (/propuesta/CODE) para una cotización.
   - Si ya hay una propuesta "Enviada" con esa misma cotización, devuelve esa.
   - Si había otra "Enviada" con una cotización anterior, queda "Reemplazada".
   - No cambia el estado de la solicitud (Confirmado sigue siendo manual).

   Sólo con el pase de /admin.
   ========================================================= */
"use strict";

var http = require("./_lib/http");
var auth = require("./_lib/admin-auth");
var replacements = require("./_lib/replacements");
var proposals = require("./_lib/proposals");

var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function explain(err) {
  if (err.code === "PGRST205" || err.code === "42P01") return "Falta crear la tabla plan_proposals. Corré el SQL de SUPABASE.md (Paso 9).";
  if (err.code === "PGRST204" || err.code === "42703") return "Falta alguna columna en Supabase. Corré el SQL de SUPABASE.md (Paso 9).";
  if (err.code === "23503") return "No encontramos esa solicitud o cotización.";
  return "No pudimos confirmar el resultado. Puede haberse guardado: recargá el panel antes de repetir. Reenviar la misma operación no crea otra propuesta.";
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

  var expected = body.expected_proposal_id, newId = body.proposal_id;
  if (!(expected === null || UUID_RE.test(expected || "")) || !UUID_RE.test(newId || "")) return http.sendJson(res, 400, { ok: false, error: "Actualizá el panel antes de generar la propuesta." });
  var cfg = { url: url, key: key };
  try {
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        var out = await replacements.run(cfg, "listo_replace_proposal", {
          p_inquiry_id: inquiryId, p_quote_id: quoteId, p_expected_id: expected,
          p_new_id: newId, p_code: proposals.newCode()
        });
        return http.sendJson(res, out.ok ? 200 : out.http_status || 409, out);
      } catch (err) {
        // La transacción fallida revierte el reemplazo antes de probar otro código.
        if (err.code === "23505" && /public_code/.test(String(err.message || ""))) continue;
        throw err;
      }
    }
    return http.sendJson(res, 502, { ok: false, error: "No pudimos generar la propuesta. Probá de nuevo." });
  } catch (err) {
    console.error("[admin-proposals]", err.step || "", err.status || "", err.code || "", err.message);
    return http.sendJson(res, err.code === "REPLACEMENT_MISSING" ? 503 : 502, { ok: false, error: err.code === "REPLACEMENT_MISSING" ? "Falta aplicar la migration S2B-2. No se reemplazó la propuesta." : explain(err) });
  }
};
