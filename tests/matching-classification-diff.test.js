"use strict";

var test = require("node:test"), assert = require("node:assert/strict");
var child = require("node:child_process");
var f1 = require("./matching/f1");
var cases = require("./fixtures/matching/classification-beta6b");

var MAIN_SHA = "a04af77743f2a53d1b3ee05116ebf83c8fb25430";

function evaluate(classifier, item) {
  var data = item.data ? JSON.parse(JSON.stringify(item.data)) : classifier.profileForText(item.prompt).data;
  Object.keys(item.edits || {}).forEach(function (key) { data[key] = item.edits[key]; });
  return classifier.chooseProfile(data, item.prompt || "");
}

function expectedMain(item) {
  return item.group === "desired" ? item.main : item.expected;
}

test("BETA-6B matriz diferencial cubre cambios deseados y regresiones", () => {
  assert.ok(cases.length >= 40, "la comparación no puede reducirse a los ejemplos de la última review");
  assert.equal(new Set(cases.map(function (item) { return item.id; })).size, cases.length);
  assert.equal(cases.filter(function (item) { return item.group === "desired"; }).length, 5);
  assert.ok(cases.every(function (item) { return item.group === "desired" || item.group === "unchanged"; }));
});

test("BETA-6B compara el clasificador real de main y rama sin diferencias inesperadas", () => {
  var base = null;
  try {
    var source = child.execFileSync("git", ["show", MAIN_SHA + ":app.js"], {encoding:"utf8", stdio:["ignore", "pipe", "ignore"]});
    base = f1.buildClassifier(source);
  } catch (err) {
    // checkout shallow de CI: se usa el snapshot de salida, no una copia del clasificador.
  }

  for (var item of cases) {
    var before = base ? evaluate(base, item) : expectedMain(item);
    var after = evaluate(f1, item);
    assert.equal(before, expectedMain(item), "baseline main: " + item.id);
    assert.equal(after, item.expected, "rama: " + item.id);
    if (item.group === "desired") assert.notEqual(after, before, "diferencia deseada: " + item.id);
    else assert.equal(after, before, "regresión no autorizada: " + item.id);
  }
});
