"use strict";
var fs = require("node:fs"), path = require("node:path");
var plan = require("../../api/_lib/plan"), quality = require("./quality");
var world = require("../fixtures/matching/world-f6a");
var places = require("../../api/_lib/google-places");
var source = fs.readFileSync(path.join(__dirname, "../../app.js"), "utf8");
function grabFrom(input, name) {
  var start = input.indexOf("  function " + name + "(");
  if (start < 0) throw Error("Falta función " + name);
  return input.slice(start, input.indexOf("\n  }\n", start) + 4);
}
function grab(name) { return grabFrom(source, name); }
function buildClassifier(input) {
  var definitions = input.slice(input.indexOf("  var EVENT_TYPES = ["), input.indexOf("  // Zonas conocidas"));
  var core = definitions + grabFrom(input, "normalize") + grabFrom(input, "escapeRegExp") + grabFrom(input, "hasWord") +
    grabFrom(input, "detectType") + grabFrom(input, "detectNeeds");
  var venue = input.indexOf("  function explicitVenueMention(") === -1 ? "" :
    grabFrom(input, "explicitVenueMention") + grabFrom(input, "explicitVenueIntent");
  var choose = new Function(core + venue + grabFrom(input, "chooseCategory") + grabFrom(input, "chooseProfile") + "return chooseProfile;")();
  var interpret = new Function(core + grabFrom(input, "detectGuests") +
    "return function (text) { var t = normalize(text); return { type: detectType(t), guests: detectGuests(t), needs: detectNeeds(t) }; };")();
  return {
    chooseProfile: choose,
    profileForText: function (text) { var data = interpret(text); return {data:data, profile:choose(data, text)}; }
  };
}
var classifier = buildClassifier(source), chooseProfile = classifier.chooseProfile;
function profileForText(text) {
  return classifier.profileForText(text);
}
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
module.exports = {buildClassifier: buildClassifier, chooseProfile: chooseProfile, profileForText: profileForText, adapter: adapter, scenarios: scenarios, syntheticSearch: syntheticSearch, report: report};
if (require.main === module) console.log(JSON.stringify(report(), null, 2));
