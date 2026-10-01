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

// Lee el cuerpo JSON de un pedido (Vercel a veces ya lo trae leído).
function readJson(req, maxBytes) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") { try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve(null); } }
  return new Promise(function (resolve) {
    var raw = "";
    req.on("data", function (c) { raw += c; if (raw.length > (maxBytes || 4000)) req.destroy(); });
    req.on("end", function () { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { resolve(null); } });
    req.on("error", function () { resolve(null); });
  });
}

module.exports = { env: env, sendJson: sendJson, tokenOk: tokenOk, queryOf: queryOf, readJson: readJson };
