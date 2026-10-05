/* =========================================================
   LISTO — Función serverless de Vercel
   Ruta: POST /api/event-request   ("Buscar opciones" → guardar el pedido)
   Cuerpo: { id (UUID), original_prompt, event_type, guests, zone, budget,
             needs, dietary_requirements, status: "new" }

   Reemplaza la escritura directa desde el navegador a Supabase:
   ahora el pedido se valida acá y se guarda con la clave secreta
   (que vive sólo en Vercel). Devuelve sólo { ok, id }.
   ========================================================= */
"use strict";

var http = require("./_lib/http");
var rateLimit = require("./_lib/rate-limit");
var requests = require("./_lib/event-requests");

var MAX_BYTES = 32000;   // alcanza para el pedido más largo válido (acentos o emojis incluidos)

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return http.sendJson(res, 405, { ok: false, error: "Método no permitido." });
  }
  if (!http.requireJson(req, res)) return;
  if (!(await rateLimit.guard(req, res, "event_request"))) return;

  // Tamaño máximo: por el encabezado y también sobre el cuerpo ya leído (Vercel lo trae leído).
  var tooBig = { ok: false, error: "El pedido es demasiado largo." };
  if (parseInt(req.headers["content-length"], 10) > MAX_BYTES) return http.sendJson(res, 413, tooBig);
  var body = await http.readJson(req, MAX_BYTES);
  if (!body || typeof body !== "object") return http.sendJson(res, 400, { ok: false, error: "No pudimos leer tu pedido. Probá de nuevo." });
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_BYTES) return http.sendJson(res, 413, tooBig);
  var checked = requests.validate(body);
  if (checked.error) return http.sendJson(res, 400, { ok: false, error: checked.error });

  var url = http.env("SUPABASE_URL"), key = http.env("SUPABASE_SECRET_KEY");
  if (!url || !key || /^sb_publishable_/.test(key)) {
    return http.sendJson(res, 503, { ok: false, error: "LISTO no puede guardar pedidos en este momento." });
  }

  try {
    await requests.save({ url: url, key: key }, checked.data);
    return http.sendJson(res, 200, { ok: true, id: checked.data.id });
  } catch (err) {
    // Sin el contenido del pedido en el registro: sólo el paso y el código.
    console.error("[event-request]", err.step || "", err.status || "", err.code || "");
    var e = requests.explain(err);
    return http.sendJson(res, e.status, { ok: false, error: e.message });
  }
};
