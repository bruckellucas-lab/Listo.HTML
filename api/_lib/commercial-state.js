/* S2B-1: una transacción para solicitud + reserva. Sin fallback de escrituras. */
"use strict";
var store = require("./providers-store");
var inquiries = require("./inquiries");
async function run(cfg, action, id, expected, data) {
  if (inquiries.STATUSES.indexOf(expected) === -1) return [400, { ok: false, error: "Falta el estado esperado. Actualizá el panel." }];
  try {
    var out = await store.request(fetch, store.normalizeUrl(cfg.url) + "/rest/v1/rpc/listo_commercial_state", {
      method: "POST", headers: store.headersFor(cfg.key),
      body: JSON.stringify({ p_action: action, p_inquiry_id: id, p_expected: expected, p_data: data || {} })
    }, "estado comercial");
    return [out.ok ? 200 : out.http_status || 409, out];
  } catch (err) {
    if (["PGRST202", "42883"].indexOf(err.code) !== -1) return [503, { ok: false, error: "Falta aplicar la migration S2B-1. No se hicieron cambios." }];
    throw err;
  }
}
module.exports = { run: run };
