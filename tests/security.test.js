/* Controles de seguridad básicos: sin claves privadas en la web, pedidos JSON obligatorios,
   panel cerrado sin sesión, encabezados de seguridad y límite de funciones de Vercel. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var childProcess = require("node:child_process");

var ROOT = path.join(__dirname, "..");
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

// Variables de prueba: nada real, y ningún pedido sale a internet.
process.env.ADMIN_PASSWORD = "prueba-local-solo-tests-123";
process.env.SUPABASE_URL = "https://ejemplo-de-prueba.supabase.co";
process.env.SUPABASE_SECRET_KEY = "clave-de-prueba-no-real";
process.env.GOOGLE_PLACES_API_KEY = "clave-de-prueba-no-real";
process.env.LISTO_ADMIN_TOKEN = "token-de-prueba-no-real";
global.fetch = function () { throw new Error("Las pruebas no deben llamar a internet"); };

var http = require("../api/_lib/http");
var auth = require("../api/_lib/admin-auth");

var FRONTEND = ["recovery.js", "index.html", "app.js", "event-request.js", "turnstile-client.js", "styles.css", "admin/index.html", "propuesta/index.html"];
var MAX_FUNCTIONS = 12;   // límite de Vercel Hobby

function fakeRes() {
  return {
    statusCode: 200, headers: {}, body: "",
    setHeader: function (k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader: function (k) { return this.headers[k.toLowerCase()]; },
    end: function (b) { this.body = b || ""; this.ended = true; }
  };
}
var adminCookie = auth.sessionCookie().split(";")[0];
var ipCounter = 0;
function fakeReq(method, headers, body) {
  ipCounter++;
  return {
    method: method, url: "/", body: body,
    headers: Object.assign({ "x-forwarded-for": "10.0.0." + (ipCounter % 250) }, headers || {}),
    socket: { remoteAddress: "127.0.0.1" }
  };
}
async function call(file, req) {
  var res = fakeRes();
  await require(path.join(ROOT, "api", file))(req, res);
  return res;
}

// Escrituras que tienen que exigir JSON.
var PUBLIC_WRITES = [["event-request.js", "POST"], ["plan-selection.js", "POST"], ["plan-inquiry.js", "POST"], ["proposal.js", "POST"]];
var ADMIN_WRITES = [
  ["admin-login.js", "POST"], ["admin-inquiries.js", "PATCH"], ["admin-quotes.js", "POST"], ["admin-proposals.js", "POST"],
  ["admin-bookings.js", "POST"], ["admin-bookings.js", "PATCH"], ["admin-providers.js", "POST"], ["admin-providers.js", "DELETE"]
];

test("frontend: ninguna clave privada ni nombre de variable secreta", function () {
  FRONTEND.forEach(function (f) {
    var s = read(f);
    assert.doesNotMatch(s, /sb_secret_[A-Za-z0-9_-]{10,}/, f);
    assert.doesNotMatch(s, /AIza[0-9A-Za-z_-]{30,}/, f + ": clave de Google");
    // (el panel sí puede nombrar ADMIN_PASSWORD en un aviso de configuración: es el nombre, no el valor)
    assert.doesNotMatch(s, /SUPABASE_SECRET_KEY|GOOGLE_PLACES_API_KEY|LISTO_ADMIN_TOKEN|RESEND_API_KEY|RATE_LIMIT_SECRET|PHOTO_SIGNING_SECRET|TURNSTILE_SECRET_KEY|process\.env/, f);
  });
});

test("el navegador ya no escribe en Supabase ni tiene claves de Supabase", function () {
  assert.equal(fs.existsSync(path.join(ROOT, "config.js")), false, "config.js se eliminó");
  assert.equal(fs.existsSync(path.join(ROOT, "supabase.js")), false, "supabase.js se eliminó");
  FRONTEND.forEach(function (f) {
    var s = read(f);
    assert.doesNotMatch(s, /\/rest\/v1|supabase\.co|sb_publishable_|sb_secret_|LISTO_CONFIG|["']apikey["']/i, f);
  });
  var html = read("index.html");
  assert.match(html, /<script src="event-request\.js"><\/script>\s*<script src="turnstile-client\.js"><\/script>\s*<script src="recovery\.js"><\/script>\s*<script src="app\.js"><\/script>/);
  assert.doesNotMatch(html, /config\.js|supabase\.js/);
  var client = read("event-request.js");
  assert.match(client, /var ENDPOINT = "\/api\/event-request";/);
  assert.match(client, /"Content-Type": "application\/json"/);
});

test("Turnstile en el navegador: sólo en Quiero avanzar, clave pública y token sólo en memoria", function () {
  var html = read("index.html"), app = read("app.js"), client = read("turnstile-client.js");
  assert.doesNotMatch(html, /challenges\.cloudflare\.com/, "el script de Cloudflare no se carga en la home");
  assert.match(html, /<div id="a-turnstile"><\/div>/);
  assert.ok(html.indexOf('id="a-turnstile"') > html.indexOf('id="advance-form"'), "el widget está dentro del formulario Quiero avanzar");
  assert.match(app, /var TURNSTILE_SITE_KEY = "0x4AAAAAAFPe9K2tA52qoILL";/);
  assert.match(app, /action: "plan_inquiry"/);
  assert.match(app, /if \(verifier\) verifier\.setup\(\);/, "se prepara al abrir Quiero avanzar");
  assert.equal(app.split("verifier.setup(").length - 1, 1, "y en ningún otro lado");
  assert.match(client, /"feedback-enabled": false/);
  assert.match(client, /appearance: "interaction-only"/);
  // Lo que se guarda en el navegador no incluye el token.
  var save = app.slice(app.indexOf("function savePlan()"), app.indexOf("function loadPlan()"));
  assert.doesNotMatch(save, /turnstile|token/i);
  assert.doesNotMatch(app, /(localStorage|sessionStorage)[^\n]*(turnstile|token)/i);
  assert.doesNotMatch(client, /localStorage|sessionStorage/);
  // Un error de verificación no borra el formulario: sólo se limpia después de un envío exitoso.
  var submit = app.slice(app.indexOf('advanceForm.addEventListener("submit"'), app.indexOf("/* ---------- Aviso flotante"));
  assert.equal(submit.split("advanceForm.reset()").length - 1, 1);
  assert.ok(submit.indexOf("advanceForm.reset()") > submit.indexOf("state.inquiries[inquiryKey"), "el reset es parte del éxito");
  ["admin/index.html", "propuesta/index.html", "event-request.js"].forEach(function (f) {
    assert.doesNotMatch(read(f), /turnstile/i, f + " no usa Turnstile");
  });
});

test("LISTO_ADMIN_TOKEN no se usa en ningún lado del código", function () {
  var files = FRONTEND.slice();
  ["api", "api/_lib"].forEach(function (dir) {
    fs.readdirSync(path.join(ROOT, dir)).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) { files.push(dir + "/" + f); });
  });
  assert.ok(files.length > 20);
  files.forEach(function (f) { assert.doesNotMatch(read(f), /LISTO_ADMIN_TOKEN/, f); });
});

test("repositorio: ningún archivo guardado con claves reales", function () {
  var files = childProcess.execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  assert.equal(files.filter(function (f) { return /(^|\/)\.env/.test(f); }).length, 0, "no hay archivos .env");
  files.forEach(function (f) {
    if (!/\.(js|html|css|json|md|yml|yaml|txt|sql)$/.test(f)) return;
    var s = read(f);
    assert.doesNotMatch(s, /sb_secret_[A-Za-z0-9_-]{20,}/, f);
    assert.doesNotMatch(s, /AIza[0-9A-Za-z_-]{35}/, f);
    assert.doesNotMatch(s, /re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/, f + ": clave de Resend");
    (s.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g) || []).forEach(function (jwt) {
      var role = "";
      try { role = JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString()).role; } catch (e) {}
      assert.notEqual(role, "service_role", f);
    });
  });
});

test("isJson / requireJson", function () {
  assert.equal(http.isJson({ headers: { "content-type": "application/json" } }), true);
  assert.equal(http.isJson({ headers: { "content-type": "Application/JSON; charset=utf-8" } }), true);
  ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", "application/jsonp", ""].forEach(function (t) {
    assert.equal(http.isJson({ headers: { "content-type": t } }), false, t);
  });
  assert.equal(http.isJson({ headers: {} }), false);
  var res = fakeRes();
  assert.equal(http.requireJson({ headers: { "content-type": "text/plain" } }, res), false);
  assert.equal(res.statusCode, 415);
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(JSON.parse(res.body).ok, false);
});

test("escrituras públicas: 415 si no es JSON, y JSON sigue funcionando", async function () {
  for (var i = 0; i < PUBLIC_WRITES.length; i++) {
    var f = PUBLIC_WRITES[i][0], m = PUBLIC_WRITES[i][1];
    for (var t of ["text/plain", "application/x-www-form-urlencoded", undefined]) {
      var res = await call(f, fakeReq(m, t ? { "content-type": t } : {}, "{}"));
      assert.equal(res.statusCode, 415, f + " " + m + " " + t);
    }
    var okRes = await call(f, fakeReq(m, { "content-type": "application/json" }, {}));
    assert.notEqual(okRes.statusCode, 415, f + " con JSON");
  }
});

test("escrituras del panel: 401 sin sesión, 403 sin encabezado, 415 si no es JSON", async function () {
  for (var i = 0; i < ADMIN_WRITES.length; i++) {
    var f = ADMIN_WRITES[i][0], m = ADMIN_WRITES[i][1];
    var json = { "content-type": "application/json", "x-listo-admin": "1" };
    if (f !== "admin-login.js") {
      assert.equal((await call(f, fakeReq(m, json, {}))).statusCode, 401, f + " " + m + " sin sesión");
      assert.equal((await call(f, fakeReq(m, { cookie: adminCookie, "content-type": "application/json" }, {}))).statusCode, 403, f + " " + m + " sin X-Listo-Admin");
    }
    var withSession = { cookie: adminCookie, "x-listo-admin": "1" };
    for (var t of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", undefined]) {
      var h = Object.assign({}, withSession);
      if (t) h["content-type"] = t;
      assert.equal((await call(f, fakeReq(m, h, "{}"))).statusCode, 415, f + " " + m + " " + t);
    }
    var okRes = await call(f, fakeReq(m, Object.assign({ "content-type": "application/json" }, withSession), {}));
    assert.notEqual(okRes.statusCode, 415, f + " " + m + " con JSON");
  }
});

test("lecturas y salida del panel no exigen JSON", async function () {
  assert.equal((await call("admin-login.js", fakeReq("GET", {}))).statusCode, 200);
  var out = await call("admin-login.js", fakeReq("DELETE", { cookie: adminCookie }));
  assert.equal(out.statusCode, 200, "cerrar sesión sin cuerpo sigue funcionando");
  assert.match(String(out.headers["set-cookie"]), /Max-Age=0/);
  for (var f of ["admin-inquiries.js", "admin-quotes.js", "admin-providers.js"]) {
    assert.equal((await call(f, fakeReq("GET", {}))).statusCode, 401, f + " GET sin sesión");
  }
});

test("el frontend manda Content-Type JSON en cada escritura", function () {
  var app = read("app.js"), prop = read("propuesta/index.html"), admin = read("admin/index.html");
  [[app, "/api/plan-selection"], [app, "/api/plan-inquiry"], [prop, "\"/api/proposal\""]].forEach(function (p) {
    var at = p[0].indexOf("fetch(" + (p[1][0] === "\"" ? p[1] : "\"" + p[1] + "\""));
    assert.ok(at !== -1, p[1]);
    assert.match(p[0].slice(at, at + 300), /"Content-Type": "application\/json"/, p[1]);
  });
  assert.match(admin, /if \(body\) \{ opts\.headers\["Content-Type"\] = "application\/json"; opts\.headers\["X-Listo-Admin"\] = "1";/);
});

test("vercel.json: encabezados de seguridad globales y los de /propuesta", function () {
  var cfg = JSON.parse(read("vercel.json"));
  function headersFor(source) {
    var h = {};
    cfg.headers.filter(function (x) { return x.source === source; }).forEach(function (x) {
      x.headers.forEach(function (y) { h[y.key] = y.value; });
    });
    return h;
  }
  var all = headersFor("/(.*)");
  assert.equal(all["X-Content-Type-Options"], "nosniff");
  assert.equal(all["X-Frame-Options"], "DENY");
  assert.match(all["Permissions-Policy"], /camera=\(\)/);
  assert.match(all["Permissions-Policy"], /microphone=\(\)/);
  assert.match(all["Permissions-Policy"], /geolocation=\(\)/);
  var prop = headersFor("/propuesta/(.*)");
  assert.equal(prop["X-Robots-Tag"], "noindex, nofollow");
  assert.equal(prop["Referrer-Policy"], "no-referrer");
  assert.equal(prop["Cache-Control"], "no-store");
  assert.ok(cfg.rewrites.some(function (r) { return r.source === "/propuesta/:code" && r.destination === "/propuesta/index.html"; }));
});

test("Vercel Hobby: como máximo " + MAX_FUNCTIONS + " funciones en /api", function () {
  var fns = fs.readdirSync(path.join(ROOT, "api")).filter(function (f) { return /\.js$/.test(f) && f[0] !== "_"; });
  assert.ok(fns.length <= MAX_FUNCTIONS, "hay " + fns.length + " funciones: " + fns.join(", "));
  ["plan-options.js", "place-photo.js", "event-request.js"].forEach(function (f) { assert.ok(fns.indexOf(f) !== -1, "falta " + f); });
  assert.deepEqual(fns.slice().sort(), ["admin-bookings.js", "admin-inquiries.js", "admin-login.js", "admin-proposals.js", "admin-providers.js",
    "admin-quotes.js", "event-request.js", "place-photo.js", "plan-inquiry.js", "plan-options.js", "plan-selection.js", "proposal.js"],
    "no apareció ninguna función nueva sin querer");
});

test("respuestas JSON: sin caché y sin indexar", function () {
  var res = fakeRes();
  http.sendJson(res, 200, { ok: true });
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.headers["x-robots-tag"], "noindex");
  assert.match(res.headers["content-type"], /application\/json/);
});

test("cookie del panel: HttpOnly, Secure y SameSite=Strict", function () {
  var c = auth.sessionCookie();
  assert.match(c, /HttpOnly/);
  assert.match(c, /Secure/);
  assert.match(c, /SameSite=Strict/);
});
