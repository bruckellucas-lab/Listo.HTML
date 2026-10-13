"use strict";
var fs = require("node:fs"), path = require("node:path");
var plan = require("../../api/_lib/plan"), quality = require("./quality");
var world = require("../fixtures/matching/world-f6a");
var places = require("../../api/_lib/google-places");
var source = fs.readFileSync(path.join(__dirname, "../../app.js"), "utf8");
function grab(name) {
  var start = source.indexOf("  function " + name + "(");
  if (start < 0) throw Error("Falta función " + name);
  return source.slice(start, source.indexOf("\n  }\n", start) + 4);
}
var chooseProfile = new Function(grab("normalize") + grab("chooseCategory") + grab("chooseProfile") + "return chooseProfile;")();
// Sólo adaptador de fixtures: conserva exactamente los pools, tipos y ratings F6a.
// Los barrios ficticios se renombran a localidades admitidas; jamás se agregan al servidor.
var zones = {"Villa Cero":"Agronomia", "Villa Uno":"Boedo", "Villa Dos":"Flores", "Villa Pocos":"Villa Devoto", "Villa Borde":"Saavedra", "Villa Lejos":"Coghlan"};
var scenarios = quality.scenarios.map(function (s) { return Object.assign({}, s, {zone: zones[s.zone] || s.zone}, s.note === "preferencia vegana" ? {diet:{on:{vegan:true}, level:{vegan:"soft"}}} : {}); });
function syntheticSearch(request) {
  var query = request.textQuery;
  Object.keys(zones).forEach(function (old) { query = query.replace(new RegExp(" en " + zones[old] + "(?=,|$)", "i"), " en " + old); });
  return world.search(Object.assign({}, request, {textQuery: query})).map(function (p) {
    var serialized = JSON.stringify(p);
    Object.keys(zones).forEach(function (old) { serialized = serialized.split(old).join(zones[old]); });
    return JSON.parse(serialized);
  });
}
// Sin picker inyectado, mantiene el modo legacy para el snapshot histórico F1.
function adapter(s, picker) {
  var profile = chooseProfile(s), zone = plan.profileZone(s.zone);
  var query = zone === null ? "" : plan.buildProfileQuery(profile, zone);
  return {request: {textQuery: query}, costKey: profile + "|" + (zone || ""), pick: function (found) {
    var status = {}; found.forEach(function (p) { status[p.id] = p.businessStatus; });
    return (picker || plan.pickOptions)(places.toProviderRows(found, "2026-10-07T12:00:00.000Z").rows, zone, status, 3)
      .map(function (p) { return {id: p.google_place_id, text: "Precio y disponibilidad a confirmar", reasons: [], claims: []}; });
  }};
}
function report() {
  var opts = {scenarios: scenarios, world: Object.assign({}, world, {search: syntheticSearch})};
  var before = quality.run(quality.current, opts), after = quality.run(adapter, opts);
  after.targets.omissionsNotWorse = after.summary.adequateMissedSlots <= before.summary.adequateMissedSlots;
  return {synthetic: true, before: before, after: after};
}
module.exports = {chooseProfile: chooseProfile, adapter: adapter, scenarios: scenarios, syntheticSearch: syntheticSearch, report: report};
if (require.main === module) console.log(JSON.stringify(report(), null, 2));
