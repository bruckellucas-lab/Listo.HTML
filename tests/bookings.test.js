/* Pruebas de api/_lib/bookings.js: montos en pesos, porcentaje, comisión y validaciones. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var bookings = require("../api/_lib/bookings");

var TODAY = "2026-10-05";
var INQ = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
var QUOTE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
var PROP = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function form(extra) {
  return Object.assign({
    plan_inquiry_id: INQ, provider_quote_id: QUOTE, acceptance_source: "manual",
    acceptance_channel: "whatsapp", acceptance_note: "Aceptó por WhatsApp el 02/10.",
    final_total_amount: "1.000.000", currency: "ARS", commission_type: "percentage", commission_rate: "10",
    confirmed_at: "2026-10-04"
  }, extra || {});
}

test("cents: formato argentino", function () {
  assert.deepEqual(bookings.cents("1.250.000"), { value: 125000000 });
  assert.deepEqual(bookings.cents("1250000,50"), { value: 125000050 });
  assert.deepEqual(bookings.cents("1.250.000,5"), { value: 125000050 });
  assert.deepEqual(bookings.cents("$ 1.000"), { value: 100000 });
  assert.deepEqual(bookings.cents("1000.25"), { value: 100025 });
  assert.deepEqual(bookings.cents(1500.5), { value: 150050 });
  assert.deepEqual(bookings.cents(""), { value: null });
  assert.deepEqual(bookings.cents(null), { value: null });
  ["abc", "1,2,3", "-5", "10,123", "1e5"].forEach(function (v) { assert.equal(bookings.cents(v).error, true, v); });
  assert.equal(bookings.cents(-1).error, true);
  assert.equal(bookings.cents(Infinity).error, true);
  assert.equal(bookings.cents("1" + "0".repeat(15)).error, true, "montos absurdos se rechazan");
});

test("rateHundredths: porcentajes con coma o punto", function () {
  assert.deepEqual(bookings.rateHundredths("8"), { value: 800 });
  assert.deepEqual(bookings.rateHundredths("8,5"), { value: 850 });
  assert.deepEqual(bookings.rateHundredths("8.25%"), { value: 825 });
  assert.deepEqual(bookings.rateHundredths(""), { value: null });
  assert.equal(bookings.rateHundredths("8,555").error, true);
  assert.equal(bookings.rateHundredths("abc").error, true);
});

test("percentCommission: redondeo a centavos (mitad hacia arriba)", function () {
  assert.equal(bookings.percentCommission(100000000, 1000), 10000000);   // 1.000.000 × 10% = 100.000
  assert.equal(bookings.percentCommission(12345, 850), 1049);            // 123,45 × 8,5% = 10,49325
  assert.equal(bookings.percentCommission(100, 50), 1);                  // 1,00 × 0,5% = 0,005 → 0,01
  assert.equal(bookings.percentCommission(99999999999999, 3000), 30000000000000);       // montos grandes sin perder precisión
});

test("validateConfirm: porcentaje", function () {
  var r = bookings.validateConfirm(form(), TODAY);
  assert.equal(r.error, undefined);
  assert.equal(r.data.commission_type, "percentage");
  assert.equal(r.data.commission_rate, 10);
  assert.equal(r.data.final_total_amount, 1000000);
  assert.equal(r.data.commission_amount, 100000);
  assert.equal(r.data.commission_status, "pending");
  assert.equal(r.data.booking_status, "confirmed");
  assert.equal(r.data.confirmed_at, "2026-10-04T15:00:00.000Z", "otro día → mediodía de Argentina");
});

test("validateConfirm: tope del porcentaje (0 < % <= 30)", function () {
  assert.ok(bookings.validateConfirm(form({ commission_rate: "30" }), TODAY).data);
  assert.ok(bookings.validateConfirm(form({ commission_rate: "30,01" }), TODAY).error);
  assert.ok(bookings.validateConfirm(form({ commission_rate: "0" }), TODAY).error);
  assert.ok(bookings.validateConfirm(form({ commission_rate: "" }), TODAY).error);
});

test("validateConfirm: monto fijo", function () {
  var r = bookings.validateConfirm(form({ commission_type: "fixed", commission_rate: "", commission_fixed_amount: "50.000" }), TODAY);
  assert.equal(r.data.commission_rate, null);
  assert.equal(r.data.commission_amount, 50000);
  assert.ok(bookings.validateConfirm(form({ commission_type: "fixed", commission_fixed_amount: "2.000.000" }), TODAY).error, "no puede superar el total");
  assert.ok(bookings.validateConfirm(form({ commission_type: "fixed", commission_fixed_amount: "" }), TODAY).error);
  assert.ok(bookings.validateConfirm(form({ commission_type: "otro" }), TODAY).error);
});

test("validateConfirm: la comisión mostrada tiene que coincidir con la del servidor", function () {
  assert.ok(bookings.validateConfirm(form({ expected_commission_amount: "100.000" }), TODAY).data);
  var bad = bookings.validateConfirm(form({ expected_commission_amount: "99.999" }), TODAY);
  assert.ok(bad.error);
  assert.equal(bad.mismatch, true);
});

test("validateConfirm: aceptación por link o manual", function () {
  assert.ok(bookings.validateConfirm(form({ acceptance_source: "proposal_link" }), TODAY).error, "por link exige propuesta");
  var link = bookings.validateConfirm(form({ acceptance_source: "proposal_link", plan_proposal_id: PROP }), TODAY);
  assert.equal(link.data.acceptance_channel, null);
  assert.equal(link.data.acceptance_note, null);
  assert.ok(bookings.validateConfirm(form({ acceptance_channel: "paloma" }), TODAY).error);
  assert.ok(bookings.validateConfirm(form({ acceptance_note: "ok" }), TODAY).error, "nota demasiado corta");
  assert.ok(bookings.validateConfirm(form({ acceptance_source: "" }), TODAY).error);
});

test("validateConfirm: ids, monto y moneda", function () {
  assert.ok(bookings.validateConfirm(form({ plan_inquiry_id: "1" }), TODAY).error);
  assert.ok(bookings.validateConfirm(form({ provider_quote_id: "x" }), TODAY).error);
  assert.ok(bookings.validateConfirm(form({ plan_proposal_id: "x" }), TODAY).error);
  assert.ok(bookings.validateConfirm(form({ final_total_amount: "0" }), TODAY).error);
  assert.ok(bookings.validateConfirm(form({ final_total_amount: "abc" }), TODAY).error);
  assert.ok(bookings.validateConfirm(form({ currency: "EUR" }), TODAY).error);
  assert.ok(bookings.validateConfirm(form({ currency: "USD" }), TODAY).data);
});

test("validateConfirm: fechas", function () {
  assert.ok(bookings.validateConfirm(form({ confirmed_at: "2026-10-06" }), TODAY).error, "no puede ser futura");
  assert.ok(bookings.validateConfirm(form({ confirmed_at: "2026-13-01" }), TODAY).error);
  assert.ok(bookings.validateConfirm(form({ commission_due_date: "2026-10-03" }), TODAY).error, "cobro antes de confirmar");
  assert.equal(bookings.validateConfirm(form({ commission_due_date: "2026-11-01" }), TODAY).data.commission_due_date, "2026-11-01");
  var hoy = bookings.validateConfirm(form({ confirmed_at: "" }), TODAY);
  assert.ok(hoy.data.confirmed_at, "sin fecha → hoy");
});

test("validDate y dayToTimestamp", function () {
  assert.equal(bookings.validDate("2026-02-28"), true);
  assert.equal(bookings.validDate("2026-2-28"), false);
  assert.equal(bookings.validDate("hola"), false);
  assert.equal(bookings.dayToTimestamp("2026-10-01", TODAY), "2026-10-01T15:00:00.000Z");
  assert.match(bookings.todayAR(), /^\d{4}-\d{2}-\d{2}$/);
});
