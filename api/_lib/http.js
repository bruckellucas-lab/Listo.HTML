/* LISTO — utilidades compartidas por las funciones de Vercel. */
"use strict";

var crypto = require("crypto");

function env(name) { return String(process.env[name] || "").trim(); }

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  res.end(JSON.stringify(payload));
}

// Compara la contraseña de prueba sin filtrar pistas por el tiempo de respuesta.
function tokenOk(given) {
  var expected = env("LISTO_ADMIN_TOKEN");
  if (expected.length < 12 || typeof given !== "string") return false;
  var a = crypto.createHash("sha256").update(given).digest();
  var b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function queryOf(req) {
  if (req.query && typeof req.query === "object") return req.query;
  try { return Object.fromEntries(new URL(req.url, "http://localhost").searchParams); } catch (e) { return {}; }
}

module.exports = { env: env, sendJson: sendJson, tokenOk: tokenOk, queryOf: queryOf };
