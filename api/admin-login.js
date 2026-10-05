/* =========================================================
   LISTO — Función serverless de Vercel
   Ruta: /api/admin-login
   GET    → ¿hay sesión activa? (sin datos)
   POST   → { password } → si es correcta, entrega el pase de 12 h (cookie)
   DELETE → cerrar sesión (borra el pase)
   ========================================================= */
"use strict";

var http = require("./_lib/http");
var auth = require("./_lib/admin-auth");
var rateLimit = require("./_lib/rate-limit");

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return http.sendJson(res, 200, { ok: true, authenticated: auth.isAuthenticated(req), configured: auth.configured() });
  }
  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", auth.clearCookie());
    return http.sendJson(res, 200, { ok: true });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, DELETE");
    return http.sendJson(res, 405, { ok: false, error: "Método no permitido." });
  }

  if (!auth.configured()) {
    return http.sendJson(res, 503, { ok: false, error: "Falta configurar ADMIN_PASSWORD en Vercel (16 caracteres o más)." });
  }
  if (auth.blocked(req)) {
    return http.sendJson(res, 429, { ok: false, error: "Demasiados intentos fallidos. Esperá 15 minutos y probá de nuevo." });
  }

  if (!http.requireJson(req, res)) return;
  if (!(await rateLimit.guard(req, res, "admin_login"))) return;
  var body = await http.readJson(req, 2000);
  if (!body || !auth.checkPassword(body.password)) {
    auth.registerFail(req);
    return http.sendJson(res, 401, { ok: false, error: "Contraseña incorrecta." });
  }

  auth.clearFails(req);
  res.setHeader("Set-Cookie", auth.sessionCookie());
  return http.sendJson(res, 200, { ok: true });
};
