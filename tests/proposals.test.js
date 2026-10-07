/* Pruebas de api/_lib/proposals.js: códigos, vencimiento y qué ve el usuario. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var proposals = require("../api/_lib/proposals");

var TODAY = "2026-10-05";

function row(status, quote) {
  return {
    id: "11111111-1111-1111-1111-111111111111", status: status, public_code: "AbCdEf123456",
    plan_inquiry_id: "22222222-2222-2222-2222-222222222222", user_comment: "nota", responded_at: null,
    provider_quotes: Object.assign({ id: "q", total_price: "150000", price_per_person: null, currency: "ARS", availability: "yes", valid_until: null }, quote || {}),
    plan_inquiries: { id: "i", event_date: "2026-11-01", approximate_time: "21:00", contact_email: "x@y.z",
      plan_selections: { provider_google_place_id: "ChIJxxxxxxxxxx",
        event_requests: { event_type: "cena", guests: 6, zone: "Palermo" } } }
  };
}

test("códigos: 12 caracteres alfanuméricos, al azar", function () {
  var seen = {};
  for (var i = 0; i < 500; i++) {
    var c = proposals.newCode();
    assert.match(c, proposals.CODE_RE);
    assert.equal(c.length, 12);
    seen[c] = true;
  }
  assert.equal(Object.keys(seen).length, 500, "no se repiten");
});

test("CODE_RE rechaza formatos raros", function () {
  ["", "abc", "AbCdEf12345", "AbCdEf1234567", "AbCdEf12345-", "AbCdEf 12345", "../etc/passw"].forEach(function (c) {
    assert.equal(proposals.CODE_RE.test(c), false, c);
  });
});

test("vencimiento: vence el día siguiente a valid_until", function () {
  assert.equal(proposals.isExpired(null, TODAY), false);
  assert.equal(proposals.isExpired("2026-10-05", TODAY), false, "el mismo día sigue vigente");
  assert.equal(proposals.isExpired("2026-10-04", TODAY), true);
  assert.equal(proposals.isExpired("2026-12-31", TODAY), false);
});

test("can_accept: sólo enviada, vigente y con disponibilidad distinta de 'no'", function () {
  assert.equal(proposals.toPublic(row("proposal_sent"), TODAY).can_accept, true);
  assert.equal(proposals.toPublic(row("proposal_sent", { availability: "pending" }), TODAY).can_accept, true);
  assert.equal(proposals.toPublic(row("proposal_sent", { availability: "no" }), TODAY).can_accept, false);
  assert.equal(proposals.toPublic(row("proposal_sent", { valid_until: "2026-10-04" }), TODAY).can_accept, false);
  ["proposal_accepted", "proposal_declined", "proposal_replaced"].forEach(function (s) {
    var p = proposals.toPublic(row(s), TODAY);
    assert.equal(p.can_accept, false, s);
    assert.equal(p.can_decline, false, s);
  });
  assert.equal(proposals.toPublic(row("proposal_sent"), TODAY).can_decline, true);
});

// Datos del lugar en tiempo real (place-details.fetchPlace); en Supabase sólo está el place_id.
var LIVE = { ok: true, google_place_id: "ChIJxxxxxxxxxx", name: "Lugar Real", category: "Restaurante", address: "Calle 1", maps_url: "http://inseguro" };

test("toPublic: sin IDs internos, notas ni datos personales; links sólo https", function () {
  var p = proposals.toPublic(row("proposal_sent"), TODAY, LIVE);
  var json = JSON.stringify(p);
  ["11111111-", "22222222-", "AbCdEf123456", "x@y.z", "ChIJ", "nota"].forEach(function (s) {
    assert.equal(json.indexOf(s), -1, "no debe aparecer " + s);
  });
  assert.equal(p.place.maps_url, null, "http:// no se muestra");
  assert.equal(p.quote.total_price, 150000);
  assert.equal(p.quote.price_per_person, null, "no se inventa precio por persona");
  assert.equal(p.place.name, "Lugar Real");
});

test("toPublic: si falta la cotización no inventa precio ni disponibilidad", function () {
  var r = row("proposal_sent");
  r.provider_quotes = null;
  var p = proposals.toPublic(r, TODAY);
  assert.equal(p.quote.total_price, null);
  assert.equal(p.quote.availability, "pending");
});
