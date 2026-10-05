/* Pruebas del email interno: sólo lo necesario para reaccionar, sin PII extra. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var h = require("./helpers");

process.env.RESEND_API_KEY = "re_prueba_no_real";
var notify = require("../api/_lib/notify");

var CTX = {
  request: { event_type: "Cena", guests: 6, zone: "Palermo", budget: 150000, needs: ["Lugar", "Torta sin TACC"],
    original_prompt: "PROMPT-ORIGINAL-PRIVADO", dietary_requirements: [{ code: "allergy", level: "hard", detail: "ALERGIA-MANI" }] },
  provider: { name: "Lugar Real", address: "Calle 123", rating: 4.6, review_count: 300, maps_url: "https://maps.google.com/?cid=1" },
  contact: { contact_name: "Ana Pérez", contact_phone: "11 5555 1234", contact_email: "ana-privada@ejemplo.com",
    notes: "COMENTARIO-PRIVADO soy celíaca", event_date: "2026-11-20", approximate_time: "21:30" },
  eventRequestId: "11111111-2222-4333-8444-555555555555", selectionId: "66666666-7777-4888-9999-000000000000",
  updated: false, receivedAt: "20/10/26 10:00"
};

function all(email) { return email.subject + "\n" + email.html + "\n" + email.text; }

test("email: trae lo necesario para reaccionar", function () {
  var e = notify.buildEmail(CTX), s = all(e);
  ["Ana Pérez", "11 5555 1234", "https://wa.me/5491155551234", "Cena", "20/11/2026", "21:30", "Palermo", "Lugar Real", "https://maps.google.com/?cid=1"]
    .forEach(function (v) { assert.ok(s.indexOf(v) !== -1, "falta " + v); });
  assert.match(e.text, /Personas: 6/);
});

test("email: sin email del usuario, comentarios, pedido original, restricciones ni IDs", function () {
  var s = all(notify.buildEmail(CTX));
  ["ana-privada@ejemplo.com", "COMENTARIO-PRIVADO", "celíaca", "PROMPT-ORIGINAL-PRIVADO", "ALERGIA-MANI", "allergy", "Torta sin TACC",
    "11111111-2222", "66666666-7777", "event_request_id", "plan_selection_id", "150.000", "Calle 123"]
    .forEach(function (v) { assert.equal(s.indexOf(v), -1, "no debería aparecer " + v); });
});

test("email: ni siquiera se leen de Supabase los datos que no van", async function () {
  var fetch = h.mockFetch([
    { match: /\/rest\/v1\/event_requests\?/, reply: function () { return h.response(200, [CTX.request]); } },
    { match: /\/rest\/v1\/providers\?/, reply: function () { return h.response(200, [CTX.provider]); } },
    { match: /api\.resend\.com/, reply: function () { return h.response(200, { id: "x" }); } },
    { match: /\/rest\/v1\/plan_inquiries/, reply: function () { return h.response(204, ""); } }
  ]);
  var sent = await notify.notifyInquiry({ url: "https://ejemplo-de-prueba.supabase.co", key: "clave" }, {
    eventRequestId: CTX.eventRequestId, placeId: "ChIJabcdefghij1234", selectionId: CTX.selectionId, contact: CTX.contact, updated: false
  }, fetch);
  assert.equal(sent, true);
  var reqRead = fetch.calls.filter(function (c) { return /event_requests\?/.test(c.url); })[0];
  assert.doesNotMatch(decodeURIComponent(reqRead.url), /original_prompt|budget|needs|dietary/);
  var mail = JSON.parse(fetch.calls.filter(function (c) { return /resend/.test(c.url); })[0].body);
  var body = mail.subject + mail.html + mail.text;
  ["ana-privada@ejemplo.com", "COMENTARIO-PRIVADO", "PROMPT-ORIGINAL-PRIVADO", "ALERGIA-MANI"].forEach(function (v) {
    assert.equal(body.indexOf(v), -1, "no debería aparecer " + v);
  });
});

test("email de respuesta a propuesta: sin el email del usuario", function () {
  var e = notify.buildProposalEmail({ action: "accept", contact: CTX.contact, quote: {}, request: CTX.request, provider: CTX.provider });
  assert.equal(all(e).indexOf("ana-privada@ejemplo.com"), -1);
  assert.ok(all(e).indexOf("Ana Pérez") !== -1);
});
