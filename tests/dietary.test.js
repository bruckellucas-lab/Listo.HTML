/* Pruebas de api/_lib/dietary.js: fuentes, señales, certificador, categorías kosher y vencimientos. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var dietary = require("../api/_lib/dietary");

var TODAY = "2026-10-05";
var PLACE = "ChIJabcdefghij1234";

function body(extra) {
  return Object.assign({ provider_google_place_id: PLACE, attribute: "vegan_options", status: "verified", source_type: "official_website",
    source_url: "https://ejemplo.com/menu" }, extra || {});
}
function ok(extra) { var r = dietary.validate(body(extra), TODAY); assert.equal(r.error, undefined, r.error); return r.data; }
function err(extra) { var r = dietary.validate(body(extra), TODAY); assert.ok(r.error, "tenía que dar error: " + JSON.stringify(extra)); return r.error; }

test("fuentes confiables permiten Verificado", function () {
  dietary.TRUSTED.forEach(function (s) {
    var d = ok({ source_type: s });
    assert.equal(d.status, "verified");
    assert.equal(d.source_type, s);
  });
});

test("señales (Google, reseñas, nombre) NUNCA verifican: sólo No verificado", function () {
  dietary.SIGNALS.forEach(function (s) {
    assert.match(err({ source_type: s, status: "verified" }), /NO alcanza/);
    err({ source_type: s, status: "no" });
    assert.equal(ok({ source_type: s, status: "unverified" }).status, "unverified");
  });
  err({ source_type: "inventada" });
});

test("Verificado sin fuente no se acepta", function () {
  err({ source_type: "" });
});

test("kosher y halal verificados exigen certificador", function () {
  assert.match(err({ attribute: "kosher", source_type: "certifier" }), /certificador/);
  assert.match(err({ attribute: "halal", source_type: "certifier" }), /certificador/);
  assert.equal(ok({ attribute: "kosher", source_type: "certifier", certifier: "Ajdut Kosher" }).certifier, "Ajdut Kosher");
  assert.equal(ok({ attribute: "halal", source_type: "certifier", certifier: "Centro Islámico" }).certifier, "Centro Islámico");
  // Sin verificar no hace falta certificador.
  ok({ attribute: "kosher", status: "unverified", source_type: "google_signal" });
  err({ attribute: "kosher", source_type: "certifier", certifier: "A" });
});

test("categoría kosher: sólo meat/dairy/parve y sólo para Kosher", function () {
  dietary.KOSHER_CATEGORIES.forEach(function (c) {
    assert.equal(ok({ attribute: "kosher", source_type: "certifier", certifier: "Ajdut", kosher_category: c }).kosher_category, c);
  });
  err({ attribute: "kosher", source_type: "certifier", certifier: "Ajdut", kosher_category: "mixed" });
  err({ attribute: "halal", source_type: "certifier", certifier: "X1", kosher_category: "meat" });
  assert.equal(ok({ attribute: "kosher", source_type: "certifier", certifier: "Ajdut" }).kosher_category, null);
});

test("link de la fuente: sólo https", function () {
  err({ source_url: "http://ejemplo.com" });
  err({ source_url: "javascript:alert(1)" });
  assert.equal(ok({ source_url: "" }).source_url, null);
});

test("Desconocido borra la evidencia", function () {
  var d = ok({ status: "unknown", source_type: "certifier", certifier: "X1", verified_at: "2026-10-01", review_after: "2027-01-01" });
  assert.deepEqual([d.source_type, d.source_url, d.certifier, d.kosher_category, d.verified_at, d.review_after, d.evidence_valid_until],
    [null, null, null, null, null, null, null]);
});

test("fechas: verificación por defecto hoy, nunca futura, al mediodía de Argentina", function () {
  var d = ok();
  assert.equal(d.verified_at, "2026-10-05T15:00:00.000Z");
  assert.equal(dietary.dayAR(d.verified_at), TODAY);
  assert.equal(d.verified_at.slice(0, 10), TODAY, "el mismo día en UTC");
  err({ verified_at: "2026-10-06" });
  err({ verified_at: "2026-13-01" });
  err({ verified_at: "05/10/2026" });
  assert.equal(ok({ status: "no" }).verified_at, "2026-10-05T15:00:00.000Z");
  assert.equal(ok({ status: "unverified", source_type: "review_signal" }).verified_at, null);
});

test("revisar después de: por defecto 6 meses (kosher/halal/celíacos) o 12 meses", function () {
  assert.equal(ok().review_after, "2027-10-05");
  assert.equal(ok({ attribute: "celiac_safe" }).review_after, "2027-04-05");
  assert.equal(ok({ attribute: "kosher", source_type: "certifier", certifier: "Ajdut" }).review_after, "2027-04-05");
  assert.equal(ok({ review_after: "2026-12-01" }).review_after, "2026-12-01");
  err({ verified_at: "2026-10-01", review_after: "2026-09-30" });
  err({ verified_at: "2026-10-01", evidence_valid_until: "2026-09-30" });
});

test("addMonths: si el día no existe usa el último del mes", function () {
  assert.equal(dietary.addMonths("2026-08-31", 6), "2027-02-28");
  assert.equal(dietary.addMonths("2027-08-31", 6), "2028-02-29");
  assert.equal(dietary.addMonths("2026-10-05", 12), "2027-10-05");
  assert.equal(dietary.addMonths("2026-12-15", 1), "2027-01-15");
});

test("vencimiento: la primera fecha entre 'revisar después de' y 'evidencia válida hasta'", function () {
  var row = { status: "verified", review_after: "2027-01-01", evidence_valid_until: "2026-12-01" };
  assert.equal(dietary.expiresOn(row), "2026-12-01");
  assert.equal(dietary.effectiveStatus(row, "2026-11-30"), "verified");
  assert.equal(dietary.effectiveStatus(row, "2026-12-01"), "expired", "vence ese mismo día");
  assert.equal(dietary.effectiveStatus({ status: "verified", review_after: null, evidence_valid_until: null }, TODAY), "verified");
});

test("estados efectivos", function () {
  ["unverified", "no", "unknown"].forEach(function (s) {
    assert.equal(dietary.effectiveStatus({ status: s, review_after: "2000-01-01" }, TODAY), s, "sólo Verificado puede vencer");
  });
  assert.equal(dietary.effectiveStatus({ status: "raro" }, TODAY), "unknown");
  assert.equal(dietary.effectiveStatus(null, TODAY), "unknown");
  var w = dietary.withEffective({ status: "verified", review_after: "2026-01-01" }, TODAY);
  assert.equal(w.effective_status, "expired");
  assert.equal(w.expires_on, "2026-01-01");
  assert.equal(dietary.withEffective({ status: "no", review_after: "2026-01-01" }, TODAY).expires_on, null);
});

test("ids y atributos inválidos", function () {
  err({ provider_google_place_id: "corto" });
  err({ provider_google_place_id: "ChIJ<script>alert(1)" });
  err({ attribute: "pizza" });
  err({ status: "maybe" });
  assert.equal(dietary.CODES.length, 10);
});
