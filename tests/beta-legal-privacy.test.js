"use strict";

var test = require("node:test"), assert = require("node:assert/strict");
var fs = require("node:fs"), path = require("node:path");
var h = require("./helpers");

function read(name) { return fs.readFileSync(path.join(h.ROOT, name), "utf8"); }
function plain(html) {
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
function anchors(html) {
  return Array.from(html.matchAll(/<a\b([^>]*)href="([^"]+)"([^>]*)>/gi), function (m) {
    return { href:m[2], attrs:m[1] + m[3] };
  });
}

var index = read("index.html"), terms = read("terminos.html"), privacy = read("privacidad.html");
var termsText = plain(terms), privacyText = plain(privacy);

test("BETA-2 footer y formulario muestran Privacidad y Términos beta sin bloquear el flujo", () => {
  var footer = index.slice(index.indexOf('<footer class="footer">'), index.indexOf("</footer>") + 9);
  var form = index.slice(index.indexOf('<form id="advance-form"'), index.indexOf("</form>", index.indexOf('<form id="advance-form"')) + 7);
  for (var block of [footer, form]) {
    assert.match(block, /href="privacidad\.html"[^>]*>Privacidad<\/a>/);
    assert.match(block, /href="terminos\.html"[^>]*>Términos beta<\/a>/);
  }
  assert.match(plain(form), /Al avanzar aceptás que LISTO te contacte para coordinar tu pedido/);
  assert.match(plain(form), /Todavía no hay ninguna reserva ni pago/);
  assert.doesNotMatch(form, /type="checkbox"|required[^>]*(?:privacidad|terminos)|(?:privacidad|terminos)[^>]*required/i);
  assert.ok(fs.existsSync(path.join(h.ROOT, "privacidad.html")));
  assert.ok(fs.existsSync(path.join(h.ROOT, "terminos.html")));
});

test("BETA-2 términos describen rol, límites beta, restricciones y Google Maps", () => {
  for (var phrase of [
    /asistente e intermediario/i,
    /no es el restaurante, salón ni proveedor final/i,
    /No confirma una reserva automáticamente/i,
    /Elegir una opción o tocar “Quiero avanzar” expresa interés/i,
    /no garantiza disponibilidad, precio final, capacidad real/i,
    /restricción fuerte[\s\S]*coordinación manual/i,
    /debe confirmarse directamente con el proveedor/i,
    /Google Maps/i,
    /fotos pueden estar desactualizadas/i,
    /beta puede tener errores/i,
    /WhatsApp es un canal externo operado por Meta/i,
    /Pendiente de revisión legal profesional/i
  ]) assert.match(termsText, phrase);
  assert.match(terms, /href="\/privacidad\.html"/);
  assert.match(terms, /maps\.google\.com\/help\/terms_maps/);
  assert.match(terms, /policies\.google\.com\/privacy/);
});

test("BETA-2 privacidad explica datos, usos, terceros, derechos y límites pendientes", () => {
  for (var phrase of [
    /tipo de plan, zona, cantidad de personas/i,
    /fecha, hora y presupuesto/i,
    /preferencias o restricciones alimentarias y de salud/i,
    /nombre, teléfono o WhatsApp, email y comentarios/i,
    /coordinar manualmente, contactar al usuario/i,
    /mejorar el servicio durante la beta/i,
    /no vende datos personales/i,
    /no los usa para publicidad de terceros/i,
    /información sensible para coordinación manual/i,
    /WhatsApp es un canal externo operado por Meta/i,
    /El usuario decide qué detalle adicional escribir y enviar/i,
    /podés pedir acceso, corrección o eliminación/i,
    /política final de plazos de conservación todavía debe definirse/i,
    /No reemplaza una política final ni revisión legal profesional/i
  ]) assert.match(privacyText, phrase);
  assert.match(privacyText, /Vercel, Supabase, Resend y Cloudflare Turnstile/);
  assert.match(privacyText, /sus propias condiciones y políticas/);
  assert.match(privacy, /href="\/terminos\.html"/);
});

test("BETA-2 WhatsApp de datos es genérico, externo y no contiene identificadores ni salud", () => {
  var wa = anchors(privacy).find(function (a) { return /^https:\/\/wa\.me\//.test(a.href); });
  assert.ok(wa);
  var url = new URL(wa.href.replace(/&amp;/g, "&"));
  assert.equal(url.hostname, "wa.me");
  assert.equal(url.pathname, "/5491158065840");
  assert.deepEqual(Array.from(url.searchParams.keys()), ["text"]);
  assert.equal(url.searchParams.get("text"), "Hola LISTO. Quiero hacer una consulta sobre mis datos.");
  assert.doesNotMatch(decodeURIComponent(url.href), /alerg|celiac|tacc|kosher|halal|gluten|lactosa|email|telefono|pedido|inquiry|request[_ -]?id/i);
  assert.match(wa.attrs, /target="_blank"/);
  assert.match(wa.attrs, /rel="noopener noreferrer"/);
});

test("BETA-2 páginas legales son estáticas y no agregan tracking, formularios ni llamadas", () => {
  for (var html of [terms, privacy]) {
    assert.doesNotMatch(html, /<script\b|<form\b|<input\b|fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/i);
    assert.doesNotMatch(html, /google-analytics|googletagmanager|facebook\.net|connect\.facebook|pixel/i);
    assert.doesNotMatch(html, /GOOGLE_PLACES_API_KEY|SUPABASE_SECRET_KEY|SECRET_KEY|service_role/i);
  }
});
