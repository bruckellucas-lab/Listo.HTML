"use strict";
var test = require("node:test"), assert = require("node:assert/strict");
var plan = require("../api/_lib/plan"), h = require("./helpers");
function row(id, rating, reviews, zone) {
  return {google_place_id:id, name:"Fixture " + id, rating:rating, review_count:reviews, zone:zone || "Palermo", address:null};
}
function ranking(types, profile) {
  var places = Object.create(null);
  Object.keys(types).forEach(id => { places[id] = {primaryType:types[id]}; });
  return {profile:profile || "grill", placesById:places};
}
function ids(rows, opts, status, max) { return plan.pickOptions(rows, "Palermo", status, max || 3, opts).map(r => r.google_place_id); }
test("F2 primaryType real pertinente gana a rating alto no pertinente; no usa label", () => {
  var rows = [row("cafe", 5, 5000), row("steak", 4.3, 600), row("bbq", 4.4, 800), row("otro", 4.9, 4000)];
  rows[0].category = "Parrilla"; rows[1].category = "Café";
  assert.deepEqual(ids(rows, ranking({cafe:"cafe", steak:"steak_house", bbq:"barbecue_restaurant", otro:"restaurant"})), ["bbq", "steak", "cafe"]);
});
test("F2 confianza bayesiana: 4.9 con cinco reseñas no domina 4.6 con dos mil", () => {
  var rows = [row("pocas", 4.9, 5), row("muchas", 4.6, 2000), row("alta", 4.7, 600), row("media", 4.5, 800)];
  var opts = ranking({pocas:"steak_house", muchas:"steak_house", alta:"steak_house", media:"steak_house"});
  assert.ok(plan.qualityScore(rows[1]) > plan.qualityScore(rows[0]));
  assert.equal(plan.qualityScore(row("x", 4.9, 5)), (5 * 4.9 + 50 * 4) / 55);
  assert.deepEqual(ids(rows, opts), ["alta", "muchas", "media"]);
});
test("F2 fallback anterior sin perfil, sin primaryTypes o sin coincidencias utilizables", () => {
  var rows = [row("pocas", 4.9, 21), row("muchas", 4.6, 2000), row("otro", 4.5, 100)];
  var legacy = ids(rows);
  assert.deepEqual(legacy, ["pocas", "muchas", "otro"]);
  for (var opts of [{profile:"grill"}, ranking({pocas:"cafe", muchas:"restaurant"}), ranking({pocas:"steak_house"}, "invalido")]) {
    assert.deepEqual(ids(rows, opts), legacy);
  }
  assert.deepEqual(ids(rows, ranking({otro:"steak_house"}), {otro:"CLOSED_PERMANENTLY"}), ["pocas", "muchas"]);
});
test("F2 zona clara: no matches por subcadenas, calle o barrio contradictorio", () => {
  for (var zone of ["SuperPalermo", "Palermoide", "No Palermo", "Palermo Bar", "Belgrano"]) assert.equal(plan.zoneMatches(row("x", 4, 100, zone), "Palermo"), false, zone);
  for (var zone of ["Palermo", "PÁLERMO", "Palermo Soho", "Palermo Viejo", "Palermo, CABA"]) assert.equal(plan.zoneMatches(row("x", 4, 100, zone), "Palermo"), true, zone);
  assert.equal(plan.zoneMatches(row("x", 4, 100, "Palermo"), "Palermo Soho"), false);
  assert.equal(plan.zoneMatches(row("x", 4, 100, "Belgrano R"), "Belgrano"), true);
  assert.equal(plan.zoneMatches(row("x", 4, 100, "Mataderos"), "Capital"), true);
  assert.equal(plan.zoneMatches(row("x", 4, 100, "Bernal"), "CABA"), false);
  assert.equal(plan.zoneMatches({zone:null, address:"Av. Palermo 1500, Belgrano, CABA"}, "Palermo"), false);
  assert.equal(plan.zoneMatches({zone:null, address:"Calle 123, SuperPalermo, CABA"}, "Palermo"), false);
  assert.equal(plan.zoneMatches({zone:null, address:"Gorriti 123, C1414 Palermo, CABA"}, "Palermo"), true);
  assert.equal(plan.zoneMatches({zone:"Belgrano", address:"Calle 123, Palermo, CABA"}, "Palermo"), false);
  assert.equal(plan.zoneMatches({zone:null, address:"Palermo"}, "Palermo"), false);
});
test("F2 fuera de zona no desplaza opciones locales; todas fuera siguen siendo reales", () => {
  var rows = [row("afuera", 5, 9000, "Belgrano"), row("local", 4.4, 200), row("relleno", 4.8, 1000)];
  assert.deepEqual(ids(rows, ranking({afuera:"steak_house", local:"steak_house", relleno:"cafe"})), ["local", "relleno", "afuera"]);
  rows.forEach(r => { r.zone = "Belgrano"; });
  assert.equal(ids(rows, ranking({afuera:"steak_house", local:"steak_house", relleno:"cafe"})).length, 3);
});
test("F2 faltantes/valores inválidos no rompen ni se presentan como rating inventado", () => {
  for (var [r, v] of [[null,100], [4.9,null], [NaN,50], [Infinity,50], [6,50], [4.5,-1], [4.5,0], [4.5,1.5], [4.9,1e308], ["4.9",50], [4.9,"100"]]) assert.equal(plan.qualityScore(row("x", r, v)), null);
  var rows = [row("sin", null, null), row("dato", 4.3, 100), row("cero", 4.9, 0)];
  assert.deepEqual(ids(rows, ranking({sin:"steak_house", dato:"steak_house", cero:"steak_house"})), ["dato", "sin", "cero"]);
  assert.equal(rows[0].rating, null);
});
test("F2 ranking estable y sin mutación, cerrados/duplicados excluidos; conserva tres", () => {
  var rows = [row("a",4.6,100), row("b",4.6,100), row("c",4.6,100), row("d",5,9000), row("a",5,9000)];
  var before = JSON.stringify(rows), opts = ranking({a:"steak_house", b:"steak_house", c:"steak_house", d:"steak_house"});
  rows.forEach(Object.freeze); Object.freeze(rows);
  var out = plan.pickOptions(rows, "Palermo", {d:"CLOSED_TEMPORARILY"}, 3, opts);
  assert.deepEqual(out.map(r => r.google_place_id), ["a", "b", "c"]);
  assert.deepEqual(ids(rows, opts, {d:"CLOSED_TEMPORARILY"}), out.map(r => r.google_place_id));
  assert.equal(out[0], rows[0]); assert.equal(JSON.stringify(rows), before);
  assert.deepEqual(ids([], opts), []);
});
process.env.SUPABASE_URL = "https://test.invalid";
process.env.SUPABASE_SECRET_KEY = "fake";
process.env.RATE_LIMIT_SECRET = "f2-local-rate-secret-1234567890123456";
process.env.PHOTO_SIGNING_SECRET = "f2-local-photo-secret-123456789012345";
process.env.GOOGLE_PLACES_API_KEY = "fake-google";
async function endpoint(query) {
  var req = h.fakeReq("GET"), res = h.fakeRes(); req.query = query;
  await require("../api/plan-options")(req, res); return res;
}
test("F2 endpoint real usa primaryType, firma opciones, no guarda score/type ni cambia Google", async t => {
  var fixtures = [
    {id:"ChIJabcdefghij0001", primaryType:"cafe", rating:4.9, userRatingCount:2000},
    {id:"ChIJabcdefghij0002", primaryType:"steak_house", rating:4.6, userRatingCount:2000},
    {id:"ChIJabcdefghij0003", primaryType:"steak_house", rating:4.9, userRatingCount:5},
    {id:"ChIJabcdefghij0004", primaryType:"barbecue_restaurant", rating:4.5, userRatingCount:800}
  ].map(p => Object.assign(p, {displayName:{text:"Fixture " + p.id}, primaryTypeDisplayName:{text:"Etiqueta genérica"}, formattedAddress:"Calle 1, Palermo, CABA", addressComponents:[{longText:"Palermo", types:["neighborhood"]}], businessStatus:"OPERATIONAL"}));
  var fetch = h.mockFetch([h.rpcRule(), {match:/places:searchText$/, reply:() => h.response(200, {places:fixtures})},
    {match:/\/rest\/v1\/providers/, reply:c => h.response(c.method === "GET" ? 200 : 201, c.method === "GET" ? [] : null)}]);
  t.mock.method(global, "fetch", fetch);
  var res = await endpoint({profile:"grill", zone:"Palermo"});
  assert.equal(res.statusCode, 200); assert.equal(res.headers["cache-control"], "no-store");
  assert.deepEqual(res.json().options.map(p => p.google_place_id), [fixtures[1].id, fixtures[3].id, fixtures[2].id]);
  res.json().options.forEach(p => {
    assert.equal(require("../api/_lib/option-token").verify(process.env.PHOTO_SIGNING_SECRET, p.google_place_id, p.option_token), "");
    for (var field of ["score", "quality", "relevant", "primaryType", "reasons", "capacity", "price", "availability"]) assert.equal(Object.hasOwn(p, field), false);
  });
  var google = fetch.calls.find(c => /places:searchText$/.test(c.url));
  assert.deepEqual(JSON.parse(google.body), {textQuery:"parrillas en palermo, Buenos Aires", pageSize:20, languageCode:"es", regionCode:"AR"});
  for (var c of fetch.calls.filter(c => /providers/.test(c.url) && c.method === "POST")) {
    JSON.parse(c.body).forEach(r => assert.deepEqual(Object.keys(r).sort(), ["google_place_id", "source", "provider_status", "last_verified_at"].sort()));
  }
  var legacy = await endpoint({category:"restaurantes", zone:"Palermo"});
  assert.equal(legacy.statusCode, 200);
  assert.deepEqual(legacy.json().options.map(p => p.google_place_id), [fixtures[0].id, fixtures[1].id, fixtures[3].id]);
});
test("F2 snapshot reproducible compara F1 publicado con igual consulta/mundo, sin nuevas certezas", () => {
  var f2 = require("./matching/f2"), baseline = require("./fixtures/matching/baseline-f2.json");
  assert.deepEqual(f2.report(), baseline);
  assert.deepEqual(baseline.before, require("./fixtures/matching/baseline-f1.json").after);
  assert.equal(baseline.after.summary.shown, baseline.before.summary.shown);
  assert.equal(baseline.after.summary.distinctSearches, baseline.before.summary.distinctSearches);
  assert.ok(baseline.after.summary.pertinentRate >= baseline.before.summary.pertinentRate);
  assert.ok(baseline.after.summary.padding <= baseline.before.summary.padding);
  assert.ok(baseline.after.summary.adequateMissedSlots <= baseline.before.summary.adequateMissedSlots);
  assert.ok(baseline.after.summary.outside <= baseline.before.summary.outside);
  for (var key of ["unverifiedClaims", "prohibitedTexts", "unsupportedReasons"]) assert.equal(baseline.after.summary[key], 0);
  var queries = list => list.map(r => [r.id, r.query, r.includedType]);
  assert.deepEqual(queries(baseline.before.results), queries(baseline.after.results));
});
