/* Ayudas para las pruebas: pedidos/respuestas falsos y un "internet" simulado.
   Ninguna prueba llama a Google, Supabase ni Resend de verdad. */
"use strict";

var path = require("node:path");
var ROOT = path.join(__dirname, "..");

function fakeRes() {
  return {
    statusCode: 200, headers: {}, body: "",
    setHeader: function (k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader: function (k) { return this.headers[k.toLowerCase()]; },
    end: function (b) { this.body = b || ""; this.ended = true; },
    json: function () { return this.body ? JSON.parse(this.body) : null; }
  };
}

var ipCounter = 0;
function fakeReq(method, headers, body, ip) {
  ipCounter++;
  return {
    method: method, url: "/", body: body, query: undefined,
    headers: Object.assign({ "x-forwarded-for": ip || ("10.1." + (ipCounter % 250) + "." + (ipCounter % 200)) }, headers || {}),
    socket: { remoteAddress: "127.0.0.1" }
  };
}

function response(status, data) {
  var text = data === undefined || data === null ? "" : typeof data === "string" ? data : JSON.stringify(data);
  return Promise.resolve({ ok: status >= 200 && status < 300, status: status, text: function () { return Promise.resolve(text); },
    json: function () { return Promise.resolve(text ? JSON.parse(text) : null); } });
}

// Internet simulado: cada pedido se anota en calls y se responde con la primera regla que coincida.
function mockFetch(rules) {
  var calls = [];
  var fn = function (url, opts) {
    var call = { url: String(url), method: (opts && opts.method) || "GET", headers: (opts && opts.headers) || {}, body: opts && opts.body };
    calls.push(call);
    for (var i = 0; i < rules.length; i++) {
      if (rules[i].match.test(call.url)) return rules[i].reply(call, calls);
    }
    return Promise.reject(new Error("Pedido no esperado en la prueba: " + call.url));
  };
  fn.calls = calls;
  return fn;
}

// Respuesta de la función listo_rate_limit_hit: deja pasar hasta "max" por huella.
function rpcRule(max) {
  var counts = {};
  return {
    match: /\/rest\/v1\/rpc\/listo_rate_limit_hit$/,
    reply: function (call) {
      var b = JSON.parse(call.body);
      var id = b.p_scope + "|" + b.p_key;
      counts[id] = (counts[id] || 0) + 1;
      var limit = max === undefined ? b.p_max : max;
      return response(200, { allowed: counts[id] <= limit, hits: counts[id], retry_after: 120 });
    }
  };
}

function fresh(rel) {
  var file = require.resolve(path.join(ROOT, rel));
  delete require.cache[file];
  return require(file);
}

module.exports = { ROOT: ROOT, fakeRes: fakeRes, fakeReq: fakeReq, response: response, mockFetch: mockFetch, rpcRule: rpcRule, fresh: fresh };
