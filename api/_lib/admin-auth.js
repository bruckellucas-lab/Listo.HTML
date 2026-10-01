/* =========================================================
   LISTO — Acceso al panel /admin
   - La contraseña (ADMIN_PASSWORD) se revisa SÓLO en el servidor.
   - Si es correcta, se entrega un "pase" de 12 horas en una cookie
     HttpOnly (el código de la página no la puede leer), Secure y
     SameSite=Strict. El pase está firmado con la contraseña: si la
     cambiás en Vercel, todos los pases viejos dejan de valer.
   - Varios intentos fallidos seguidos → bloqueo temporal.
   ========================================================= */
"use strict";

var crypto = require("crypto");

var COOKIE = "listo_admin";
var SESSION_SECONDS = 12 * 60 * 60;
var MIN_PASSWORD = 16;
var MAX_FAILS = 8;
var FAIL_WINDOW_MS = 15 * 60 * 1000;
var fails = {};

function password() { return String(process.env.ADMIN_PASSWORD || "").trim(); }
function configured() { return password().length >= MIN_PASSWORD; }

function ipOf(req) {
  return String(req.headers["x-forwarded-for"] || (req.socket && req.socket.remoteAddress) || "?").split(",")[0].trim();
}

function sign(exp) {
  return crypto.createHmac("sha256", "listo-admin-session:" + password()).update(String(exp)).digest("base64url");
}

function safeEqual(a, b) {
  var x = crypto.createHash("sha256").update(String(a)).digest();
  var y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

function readCookie(req, name) {
  var raw = String(req.headers.cookie || "");
  var parts = raw.split(/;\s*/);
  for (var i = 0; i < parts.length; i++) {
    var eq = parts[i].indexOf("=");
    if (eq > 0 && parts[i].slice(0, eq) === name) return decodeURIComponent(parts[i].slice(eq + 1));
  }
  return "";
}

// ¿El pedido trae un pase válido y no vencido?
function isAuthenticated(req) {
  if (!configured()) return false;
  var value = readCookie(req, COOKIE);
  var m = /^(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!m) return false;
  var exp = parseInt(m[1], 10);
  if (exp < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(m[2], sign(exp));
}

function blocked(req) {
  var now = Date.now();
  var list = (fails[ipOf(req)] || []).filter(function (t) { return now - t < FAIL_WINDOW_MS; });
  fails[ipOf(req)] = list;
  return list.length >= MAX_FAILS;
}

function registerFail(req) {
  var ip = ipOf(req);
  (fails[ip] = fails[ip] || []).push(Date.now());
  if (Object.keys(fails).length > 5000) fails = {};
}

function clearFails(req) { delete fails[ipOf(req)]; }

function checkPassword(given) {
  return configured() && typeof given === "string" && safeEqual(given, password());
}

function sessionCookie() {
  var exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  return COOKIE + "=" + exp + "." + sign(exp) + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + SESSION_SECONDS;
}

function clearCookie() {
  return COOKIE + "=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
}

module.exports = {
  MIN_PASSWORD: MIN_PASSWORD, SESSION_SECONDS: SESSION_SECONDS,
  configured: configured, isAuthenticated: isAuthenticated, checkPassword: checkPassword,
  blocked: blocked, registerFail: registerFail, clearFails: clearFails,
  sessionCookie: sessionCookie, clearCookie: clearCookie
};
