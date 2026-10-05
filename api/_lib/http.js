/* LISTO — utilidades compartidas por las funciones de Vercel. */
"use strict";

function env(name) { return String(process.env[name] || "").trim(); }

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  res.end(JSON.stringify(payload));
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

// Los pedidos que guardan o cambian datos tienen que llegar como JSON.
// Así un formulario de otro sitio (que no puede mandar JSON sin permiso) no llega a nada.
function isJson(req) {
  var type = String((req.headers && req.headers["content-type"]) || "").split(";")[0].trim().toLowerCase();
  return type === "application/json";
}

// Si el pedido no es JSON responde 415 y devuelve false.
function requireJson(req, res) {
  if (isJson(req)) return true;
  sendJson(res, 415, { ok: false, error: "El pedido tiene que enviarse como JSON." });
  return false;
}

module.exports = { env: env, sendJson: sendJson, queryOf: queryOf, readJson: readJson, isJson: isJson, requireJson: requireJson };
