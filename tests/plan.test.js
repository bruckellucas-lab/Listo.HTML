/* Pruebas de api/_lib/plan.js: categorías, zonas, duplicados, cerrados y orden de los 3 lugares. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var plan = require("../api/_lib/plan");

function place(id, name, extra) {
  return Object.assign({ google_place_id: id, name: name, zone: null, address: null, rating: null, review_count: null }, extra || {});
}

test("categorías: sólo restaurantes, bares y salones", function () {
  assert.deepEqual(Object.keys(plan.CATEGORIES).sort(), ["bares", "restaurantes", "salones"]);
  assert.equal(plan.buildQuery("restaurantes", ""), "restaurantes en Buenos Aires");
  assert.equal(plan.buildQuery("salones", "Palermo"), "salones para eventos en Palermo, Buenos Aires");
  assert.equal(plan.buildQuery("bares", "CABA"), "bares en CABA");
  assert.equal(plan.buildQuery("bares", "Rosario"), "bares en Rosario");
  assert.equal(plan.buildQuery("pizza gratis", "Palermo"), "", "una categoría libre no arma búsqueda");
  ["__proto__", "constructor", "toString", "hasOwnProperty"].forEach(function (c) {
    assert.equal(plan.CATEGORIES[c], undefined, c + " no es categoría");
    assert.equal(plan.buildQuery(c, "Palermo"), "", c);
  });
});

test("zonas: sólo letras; lo raro se ignora", function () {
  assert.equal(plan.cleanZone("  Villa   Crespo "), "Villa Crespo");
  assert.equal(plan.cleanZone("Núñez"), "Núñez");
  assert.equal(plan.cleanZone("Palermo<script>"), "");
  assert.equal(plan.cleanZone("1234"), "");
  assert.equal(plan.cleanZone(""), "");
  assert.equal(plan.cleanZone(null), "");
  assert.equal(plan.cleanZone("a".repeat(60)), "a".repeat(40), "se corta en 40 letras");
});

test("zoneMatches: por barrio o por dirección, sin acentos", function () {
  assert.equal(plan.zoneMatches(place("a", "A", { zone: "Núñez" }), "nunez"), true);
  assert.equal(plan.zoneMatches(place("a", "A", { zone: "Palermo Soho" }), "Palermo"), true);
  assert.equal(plan.zoneMatches(place("a", "A", { address: "Gorriti 5000, Palermo, CABA" }), "palermo"), true);
  assert.equal(plan.zoneMatches(place("a", "A", { zone: "Belgrano" }), "Palermo"), false);
  assert.equal(plan.zoneMatches(place("a", "A", { zone: "Belgrano" }), ""), false);
});

test("pickOptions: excluye cerrados y duplicados (mismo id o mismo nombre)", function () {
  var rows = [
    place("p1", "Uno", { rating: 4.5, review_count: 100 }),
    place("p1", "Uno otra vez", { rating: 4.9, review_count: 900 }),
    place("p2", "  UNO ", { rating: 4.8, review_count: 500 }),
    place("p3", "Cerrado", { rating: 5, review_count: 999 }),
    place("p4", "Pausado", { rating: 5, review_count: 999 }),
    place("", "Sin id", { rating: 5, review_count: 999 }),
    place("p5", "", { rating: 5, review_count: 999 }),
    place("p6", "Dos", { rating: 4, review_count: 50 })
  ];
  var out = plan.pickOptions(rows, "", { p3: "CLOSED_PERMANENTLY", p4: "CLOSED_TEMPORARILY" });
  assert.deepEqual(out.map(function (r) { return r.google_place_id; }), ["p1", "p6"]);
});

test("pickOptions: primero la zona, después rating con reseñas suficientes", function () {
  var rows = [
    place("fuera", "Fuera de zona", { zone: "Belgrano", rating: 5, review_count: 1000 }),
    place("pocas", "Pocas reseñas", { zone: "Palermo", rating: 5, review_count: plan.MIN_REVIEWS - 1 }),
    place("buena", "Buena", { zone: "Palermo", rating: 4.2, review_count: 300 }),
    place("mejor", "Mejor", { zone: "Palermo", rating: 4.6, review_count: 40 }),
    place("empate", "Empate más reseñas", { zone: "Palermo", rating: 4.6, review_count: 80 })
  ];
  var out = plan.pickOptions(rows, "Palermo");
  assert.deepEqual(out.map(function (r) { return r.google_place_id; }), ["empate", "mejor", "buena"]);
  assert.equal(plan.pickOptions(rows, "Palermo", null, 5).length, 5);
  assert.equal(plan.pickOptions(rows, "Palermo", null, 5)[3].google_place_id, "pocas", "zona sin reseñas suficientes va antes que fuera de zona");
  assert.equal(plan.pickOptions([], "Palermo").length, 0);
});

test("pickOptions: sin datos inventados (devuelve las filas tal cual)", function () {
  var row = place("x", "Lugar", { rating: null, review_count: null });
  var out = plan.pickOptions([row], "");
  assert.equal(out[0], row);
  assert.equal(out[0].rating, null);
});

test("shortAddress", function () {
  assert.equal(plan.shortAddress("Gorriti 5000, C1414 CABA, Argentina"), "Gorriti 5000");
  assert.equal(plan.shortAddress(""), null);
  assert.equal(plan.shortAddress(null), null);
});
