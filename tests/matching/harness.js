/* F0 · Mide el matching ACTUAL con el mundo sintético (sin red, sin Google, sin Supabase).
   Usa el código real: chooseCategory de app.js, plan.buildQuery, places.toProviderRows y
   plan.pickOptions. Así la línea base mide exactamente lo que hoy ve una persona. */
"use strict";

var fs = require("node:fs");
var path = require("node:path");
var ROOT = path.join(__dirname, "..", "..");
var plan = require(path.join(ROOT, "api/_lib/plan"));
var places = require(path.join(ROOT, "api/_lib/google-places"));
var world = require("../fixtures/matching/world");
var SCENARIOS = require("../fixtures/matching/scenarios");

var USERS = 20;                       // pedidos simulados por escenario (para medir repetición)
var MIN_REVIEWS = 20, MIN_RATING = 4.0;
var NOW = "2026-10-07T12:00:00.000Z";  // fijo: resultados reproducibles

// Extrae del navegador (sin modificarlo) la elección de categoría que hoy usa la web.
function loadChooseCategory() {
  var src = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  function grab(name) {
    var start = src.indexOf("  function " + name + "(");
    if (start === -1) throw new Error("No encontré " + name + " en app.js");
    var end = src.indexOf("\n  }\n", start);
    return src.slice(start, end + 4);
  }
  return new Function(grab("normalize") + grab("chooseCategory") + "return chooseCategory;")();
}
var chooseCategory = loadChooseCategory();

function runScenario(s) {
  var category = chooseCategory({ type: s.type, needs: s.needs, guests: s.guests });
  var zone = plan.cleanZone(s.zone);
  var query = plan.buildQuery(category, zone);
  var found = world.search(category, zone);
  var byId = {}, statusById = {};
  found.forEach(function (p) { byId[p.id] = p; statusById[p.id] = p.businessStatus; });
  var rows = places.toProviderRows(found, NOW).rows;

  var picks = [];
  for (var u = 0; u < USERS; u++) picks.push(plan.pickOptions(rows, zone, statusById, 3).map(function (r) { return r.google_place_id; }));
  var shown = picks[0];

  function relevant(id) { return s.relevant.indexOf(byId[id].primaryType) !== -1; }
  function inZone(id) { return !zone || world.norm(rows.filter(function (r) { return r.google_place_id === id; })[0].zone) === world.norm(zone); }
  var seenNames = {};
  var adequate = found.filter(function (p) {
    var key = world.norm(p.displayName.text);
    if (seenNames[key]) return false;
    seenNames[key] = true;
    return p.businessStatus === "OPERATIONAL" && relevant(p.id) && inZone(p.id) &&
      p.userRatingCount >= MIN_REVIEWS && p.rating >= MIN_RATING;
  }).map(function (p) { return p.id; });

  var distinct = {};
  picks.forEach(function (list) { list.forEach(function (id) { distinct[id] = true; }); });
  var shownAdequate = shown.filter(function (id) { return adequate.indexOf(id) !== -1; }).length;

  return {
    id: s.id, category: category, query: query,
    candidates: found.length, adequate: adequate.length,
    shown: shown.length,
    pertinent: shown.filter(relevant).length,
    inZone: zone ? shown.filter(inZone).length : null,
    padding: shown.length - shownAdequate,                       // mostradas que no eran adecuadas
    missed: Math.min(3, adequate.length) - shownAdequate,        // adecuadas disponibles que no se mostraron
    distinctAcrossUsers: Object.keys(distinct).length,
    shownIds: shown
  };
}

function summarize(results) {
  var sum = function (k) { return results.reduce(function (a, r) { return a + (r[k] || 0); }, 0); };
  var shown = sum("shown");
  var zoned = results.filter(function (r) { return r.inZone !== null; });
  var zonedShown = zoned.reduce(function (a, r) { return a + r.shown; }, 0);

  // Repetición entre planes distintos con la misma búsqueda (misma categoría + zona).
  var groups = {};
  results.forEach(function (r) { (groups[r.query] = groups[r.query] || []).push(r); });
  var pairs = 0, identical = 0;
  Object.keys(groups).forEach(function (q) {
    var g = groups[q];
    for (var i = 0; i < g.length; i++) for (var j = i + 1; j < g.length; j++) {
      pairs++;
      if (g[i].shownIds.slice().sort().join() === g[j].shownIds.slice().sort().join()) identical++;
    }
  });

  return {
    scenarios: results.length,
    shown: shown,
    pertinentRate: +(sum("pertinent") / shown).toFixed(3),
    inZoneRate: +(zoned.reduce(function (a, r) { return a + r.inZone; }, 0) / zonedShown).toFixed(3),
    padding: sum("padding"),
    missed: sum("missed"),
    scenariosWithFewerThan3Adequate: results.filter(function (r) { return r.adequate < 3; }).length,
    scenariosShowingSameForAllUsers: results.filter(function (r) { return r.distinctAcrossUsers === r.shown; }).length,
    differentPlansSameQueryPairs: pairs,
    differentPlansIdenticalTop3: identical,
    distinctQueries: Object.keys(groups).length
  };
}

function run() {
  var results = SCENARIOS.map(runScenario);
  return { results: results, summary: summarize(results) };
}

module.exports = { run: run, runScenario: runScenario, summarize: summarize, chooseCategory: chooseCategory, USERS: USERS };
