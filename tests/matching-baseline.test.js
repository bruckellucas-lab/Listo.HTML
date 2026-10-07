/* F0 · Línea base del matching ACTUAL (reproducible, sin red).
   No mide lo deseado: congela cómo funciona hoy para comparar F1 contra esto.
   Si cambia el algoritmo actual a propósito, regenerar con:
   node tests/matching/report.js --write  (y actualizar docs/MATCHING-F0.md). */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var harness = require("./matching/harness");
var report = require("./matching/report");
var world = require("./fixtures/matching/world");
var SCENARIOS = require("./fixtures/matching/scenarios");
var BASELINE = require("./fixtures/matching/baseline.json");

test("los escenarios sintéticos son válidos", function () {
  var ids = {};
  SCENARIOS.forEach(function (s) {
    assert.ok(!ids[s.id], "id repetido " + s.id); ids[s.id] = true;
    assert.ok(Array.isArray(s.relevant) && s.relevant.length, s.id + " sin tipos pertinentes");
    assert.ok(world.search(harness.chooseCategory({ type: s.type, needs: s.needs, guests: s.guests }), s.zone).length > 0, s.id + " sin resultados");
  });
  assert.ok(SCENARIOS.length >= 20);
});

test("el mundo sintético no tiene datos reales de Google", function () {
  Object.keys(world.POOLS).forEach(function (k) {
    world.POOLS[k].forEach(function (p) {
      assert.match(p.id, /^SYN/, "ids inventados");
      assert.match(p.formattedAddress, /^Calle Sintética /);
      assert.equal(p.location, undefined, "sin coordenadas");
    });
  });
});

test("la medición es reproducible (dos corridas dan lo mismo)", function () {
  assert.deepEqual(report.snapshot(harness.run()), report.snapshot(harness.run()));
});

test("la línea base coincide con la documentada", function () {
  assert.deepEqual(report.snapshot(harness.run()), BASELINE);
});

test("línea base: hoy todas las personas ven lo mismo y nunca hay menos de 3", function () {
  var out = harness.run();
  out.results.forEach(function (r) {
    assert.equal(r.distinctAcrossUsers, r.shown, r.id + ": el orden actual es fijo");
    assert.equal(r.shown, 3, r.id + ": hoy siempre se completan 3");
  });
  assert.equal(out.summary.differentPlansIdenticalTop3, out.summary.differentPlansSameQueryPairs, "planes distintos con la misma búsqueda reciben los mismos 3");
});

test("la medición usa el código real de la web y del servidor", function () {
  assert.equal(harness.chooseCategory({ type: "After office", needs: [], guests: 8 }), "bares");
  assert.equal(harness.chooseCategory({ type: "Casamiento", needs: [], guests: 120 }), "salones");
  assert.equal(harness.chooseCategory({ type: "Fiesta", needs: [], guests: 30 }), "restaurantes", "hoy una fiesta de 30 busca restaurantes");
});
