/* LISTO — utilidades compartidas por las funciones de Vercel. */
"use strict";

function env(name) { return String(process.env[name] || "").trim(); }

function sendJson(res, status, payload) {
  if (payload && typeof payload.error === "string" && /migration|\bSQL\b|Supabase|Vercel|plan_[a-z_]+|PGRST\d+|ADMIN_PASSWORD|TURNSTILE_SECRET_KEY/.test(payload.error)) {
    payload = Object.assign({}, payload, { error: "LISTO necesita completar una actualización. Probá más tarde o contactá al equipo técnico." });
  }
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

// Misma política para objetos parseados por Vercel, texto, Buffer y streams.
function readJson(req, maxBytes, res, fields) {
  var limit = maxBytes || 4000;
  function reject(status) {
    if (res) sendJson(res, status, { ok: false, error: status === 413 ? "El pedido es demasiado grande. Reducí el contenido y probá de nuevo." : "El pedido no tiene un formato JSON válido. Revisalo y probá de nuevo." });
    return null;
  }
  function parse(raw) {
    try {
      if (Buffer.byteLength(raw, "utf8") > limit) return reject(413);
      var body = JSON.parse(raw);
      if (!body || typeof body !== "object" || Array.isArray(body)) return reject(400);
      if (fields && Object.keys(body).some(function (key) { return fields.indexOf(key) === -1; })) return reject(400);
      var textLimits = { name: 80, phone: 30, email: 120, notes: 500, comment: 1000,
        original_prompt: 2000, event_type: 120, zone: 120, includes: 2000, conditions: 2000,
        deposit: 300, internal_notes: 2000, acceptance_note: 500, verification_notes: 2000,
        source_url: 1000, certifier: 200, turnstile_token: 2048, password: 1900 };
      if (fields && Object.keys(body).some(function (key) {
        var value = body[key];
        if (key === "needs" || key === "dietary_requirements") return false;
        if (value && typeof value === "object") return true;
        return typeof value === "string" && value.length > (textLimits[key] || 255);
      })) return reject(400);
      // No recorrer estructuras enormes/profundas hacia las validaciones comerciales.
      var count = 0;
      function bounded(value, depth) {
        if (++count > 2000 || depth > 8 || typeof value === "number" && !Number.isFinite(value)) return false;
        return !value || typeof value !== "object" || Object.keys(value).every(function (key) { return bounded(value[key], depth + 1); });
      }
      if (!bounded(body, 0)) return reject(400);
      return body;
    } catch (e) { return reject(400); }
  }
  if (Number(req.headers && req.headers["content-length"]) > limit) return Promise.resolve(reject(413));
  if (req.body !== undefined) {
    try {
      if (Buffer.isBuffer(req.body) && req.body.length > limit) return Promise.resolve(reject(413));
      var raw = Buffer.isBuffer(req.body) ? new TextDecoder("utf-8", { fatal: true }).decode(req.body) : typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      return Promise.resolve(parse(raw));
    } catch (e) { return Promise.resolve(reject(400)); }
  }
  return new Promise(function (resolve) {
    var chunks = [], size = 0, done = false;
    function finish(value) { if (done) return; done = true; chunks = []; resolve(value); }
    req.on("data", function (chunk) {
      if (done) return;
      var bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > limit) { finish(reject(413)); return; }
      chunks.push(bytes);
    });
    req.on("end", function () {
      if (done) return;
      try { finish(parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)))); }
      catch (e) { finish(reject(400)); }
    });
    req.on("error", function () { if (!done) finish(reject(400)); });
    req.on("aborted", function () { if (!done) finish(reject(400)); });
    req.on("close", function () { if (!done) finish(reject(400)); });
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
