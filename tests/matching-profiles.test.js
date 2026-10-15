"use strict";
var test = require("node:test"), assert = require("node:assert/strict");
var h = require("./helpers"), plan = require("../api/_lib/plan"), f1 = require("./matching/f1");
var rate = require("../api/_lib/rate-limit");
process.env.SUPABASE_URL = "https://test.invalid";
process.env.SUPABASE_SECRET_KEY = "fake";
process.env.RATE_LIMIT_SECRET = "f1-local-rate-secret-1234567890123456";
process.env.GOOGLE_PLACES_API_KEY = "fake-google";
async function search(query, ip) {
  var req = h.fakeReq("GET", {}, undefined, ip), res = h.fakeRes(); req.query = query;
  await require("../api/plan-options")(req, res); return res;
}
function network() {
  return h.mockFetch([h.rpcRule(), {match: /places:searchText$/, reply: () => h.response(200, {places: []})}]);
}
function googleCalls(fetch) { return fetch.calls.filter(c => /places:searchText$/.test(c.url)); }
test("F1 perfiles cerrados, consultas de servidor y metadatos sin promesas", () => {
  for (var id of Object.keys(plan.PROFILES)) {
    assert.equal(plan.PROFILES[id].id, id);
    assert.ok(plan.PROFILES[id].primaryTypes.length);
    assert.equal(plan.buildProfileQuery(id, " PÁLERMO "), plan.PROFILES[id].textQuery + " en palermo, Buenos Aires");
  }
  for (var id of ["constructor", "toString", "__proto__", "texto libre"]) assert.equal(plan.buildProfileQuery(id, "Palermo"), "");
  for (var zone of ["Ana Perez", "en Marzo", "ana@example.invalid", "Palermo".repeat(100)]) assert.equal(plan.profileZone(zone), null);
  assert.equal(plan.buildProfileQuery("grill", ""), "parrillas en Buenos Aires");
  assert.equal(plan.buildProfileQuery("grill", "Rosario"), "parrillas en rosario");
  assert.equal(plan.buildProfileQuery("dinner", "Buenos Aires"), "restaurantes en buenos aires");
  assert.equal(plan.profileZone(["Palermo"]), null);
  var source = require("node:fs").readFileSync(require("node:path").join(h.ROOT, "app.js"), "utf8");
  var zoneList = source.match(/var ZONES = (\[[\s\S]*?\]).sort/)[1];
  JSON.parse(zoneList).forEach(zone => assert.notEqual(plan.profileZone(zone), null, zone));
});
test("F1 mapea tipos/necesidades a ids cerrados sin leer campos libres del objeto", () => {
  var examples = [["Asado", "grill"], ["Baby shower", "baby_shower"], ["Cena romántica", "romantic"], ["After office", "after_office"], ["Corporativo", "corporate"], ["Brunch", "cafe_brunch"], ["Cena vegana", "vegan"], ["Cumpleaños", "celebration"], ["Cena", "dinner"]];
  examples.forEach(([type, profile]) => assert.equal(f1.chooseProfile({type, guests:25, needs:["comida"]}), profile));
  assert.equal(f1.chooseProfile({type:"Fiesta", needs:["lugar", "musica", "deco", "torta", "foto"]}), "multi_service");
  assert.equal(f1.chooseProfile({type:"Cena", original_prompt:"asado", allergy:"vegan", contact_name:"parrilla"}), "dinner");
  assert.equal(f1.chooseProfile({type:"Cena", diet:{on:{vegan:true}}}), "vegan");
});
test("F1 request real a Google excluye todos los campos libres y mantiene es/AR/no-store", async t => {
  var fetch = network(); t.mock.method(global, "fetch", fetch);
  var res = await search({profile:"grill", zone:"Palermo", original_prompt:"Ana 1122334455 ana@example.invalid", allergies:"maní", comments:"nota privada", budget:"123456", textQuery:"secreto", includedType:"hospital"});
  assert.equal(res.statusCode, 200); assert.equal(res.headers["cache-control"], "no-store");
  assert.deepEqual(JSON.parse(googleCalls(fetch)[0].body), {textQuery:"parrillas en palermo, Buenos Aires", pageSize:20, languageCode:"es", regionCode:"AR"});
  assert.doesNotMatch(JSON.stringify(fetch.calls), /Ana|1122334455|ana@example|maní|nota privada|123456|hospital/);
});
test("F1 categorías viejas siguen funcionando; profile presente inválido no cae al alias", async t => {
  var fetch = network(); t.mock.method(global, "fetch", fetch);
  for (var category of ["restaurantes", "bares", "salones"]) {
    assert.equal((await search({category, zone:"Palermo"})).statusCode, 200);
    assert.equal(JSON.parse(googleCalls(fetch).at(-1).body).textQuery, plan.buildQuery(category, "Palermo"));
  }
  var count = fetch.calls.length;
  for (var profile of ["", "constructor", "__proto__", "inventado", ["dinner"]]) assert.equal((await search({profile, category:"restaurantes", zone:"Palermo"})).statusCode, 400);
  for (var profile of ["dinner", undefined]) {
    var query = {category:"restaurantes", zone:"Ana Perez"}; if (profile) query.profile = profile;
    assert.equal((await search(query)).statusCode, 400);
  }
  assert.equal(fetch.calls.length, count);
});
test("F1 search_repeat real persiste profile|zona normalizada antes de Google; topes intactos", async t => {
  var fetch = network(), ip = "10.70.0.1"; t.mock.method(global, "fetch", fetch);
  for (var zone of [" PÁLERMO ", "palermo"]) assert.equal((await search({profile:"grill", zone}, ip)).statusCode, 200);
  assert.equal((await search({profile:"grill", zone:"Palermo"}, ip)).statusCode, 429);
  assert.equal(googleCalls(fetch).length, 2);
  assert.equal((await search({profile:"dinner", zone:"Palermo"}, ip)).statusCode, 200);
  var expected = rate.visitorKey(process.env.RATE_LIMIT_SECRET, "search_repeat", ip + "|grill|palermo");
  var hits = fetch.calls.filter(c => /listo_rate_limit_hit$/.test(c.url)).map(c => JSON.parse(c.body)).filter(b => b.p_key === expected);
  assert.equal(hits.length, 3); assert.ok(hits.every(b => b.p_max === 2 && b.p_window_seconds === 10 && b.p_scope === "plan_options"));
  assert.ok(fetch.calls.findIndex(c => /listo_rate_limit_hit$/.test(c.url) && JSON.parse(c.body).p_key === expected) < fetch.calls.findIndex(c => /places:searchText$/.test(c.url)));
  assert.equal(rate.LIMITS.search_all.max, 200); assert.equal(rate.LIMITS.search_day.max, 1000);
});
test("F1 contador persistente caído falla cerrado sin Google", async t => {
  t.mock.method(console, "error", () => {});
  var fetch = h.mockFetch([{match:/rpc/, reply:() => h.response(500, {code:"XX000"})}]);
  t.mock.method(global, "fetch", fetch);
  assert.equal((await search({profile:"grill", zone:"Palermo"})).statusCode, 503);
  assert.equal(googleCalls(fetch).length, 0);
});
test("F1 línea base sintética reproducible; ranking idéntico y omisiones hasta tres no empeoran", () => {
  var baseline = require("./fixtures/matching/baseline-f1.json");
  assert.deepEqual(f1.report(), baseline);
  assert.equal(baseline.after.summary.prohibitedTexts, 0);
  assert.equal(baseline.after.summary.unverifiedClaims, 0);
  assert.ok(baseline.after.summary.adequateMissedSlots <= baseline.before.summary.adequateMissedSlots);
  assert.ok(baseline.after.summary.distinctSearches > baseline.before.summary.distinctSearches);
  assert.equal(baseline.after.targets.paddingMet, true);
  assert.equal(baseline.after.targets.zoneNoticeMet, false);
});
test("F1 resultado normal conserva option_token y guarda sólo ids/datos LISTO", async t => {
  process.env.PHOTO_SIGNING_SECRET = "f1-photo-secret-12345678901234567890";
  var id = "ChIJabcdefghij0001";
  var fetch = h.mockFetch([h.rpcRule(),
    {match:/places:searchText$/, reply:() => h.response(200, {places:[{id, displayName:{text:"Parrilla de prueba"}, primaryType:"steak_house", formattedAddress:"Palermo, Buenos Aires", businessStatus:"OPERATIONAL", rating:4.5, userRatingCount:100}]})},
    {match:/\/rest\/v1\/providers/, reply:c => h.response(c.method === "GET" ? 200 : 201, c.method === "GET" ? [] : null)}
  ]);
  t.mock.method(global, "fetch", fetch);
  var res = await search({profile:"grill", zone:"Palermo"});
  assert.equal(res.statusCode, 200); assert.equal(res.json().providers_saved, true);
  var option = res.json().options[0]; assert.equal(option.name, "Parrilla de prueba");
  assert.equal(require("../api/_lib/option-token").verify(process.env.PHOTO_SIGNING_SECRET, id, option.option_token), "");
  var writes = fetch.calls.filter(c => /providers/.test(c.url) && c.method === "POST");
  assert.equal(writes.length, 1);
  var row = JSON.parse(writes[0].body)[0];
  assert.deepEqual(Object.keys(row).sort(), ["google_place_id", "source", "provider_status", "last_verified_at"].sort());
  assert.equal(row.google_place_id, id);
  assert.doesNotMatch(writes[0].body, /Parrilla de prueba|steak_house|Palermo|rating|photos/);
});

var officialNeighborhoods = [
  "Agronomía", "Almagro", "Balvanera", "Barracas", "Belgrano", "Boedo", "Caballito", "Chacarita",
  "Coghlan", "Colegiales", "Constitución", "Flores", "Floresta", "La Boca", "La Paternal", "Liniers",
  "Mataderos", "Monserrat", "Monte Castro", "Nueva Pompeya", "Núñez", "Palermo", "Parque Avellaneda",
  "Parque Chacabuco", "Parque Chas", "Parque Patricios", "Puerto Madero", "Recoleta", "Retiro", "Saavedra",
  "San Cristóbal", "San Nicolás", "San Telmo", "Vélez Sarsfield", "Versalles", "Villa Crespo",
  "Villa del Parque", "Villa Devoto", "Villa General Mitre", "Villa Lugano", "Villa Luro", "Villa Ortúzar",
  "Villa Pueyrredón", "Villa Real", "Villa Riachuelo", "Villa Santa Rita", "Villa Soldati", "Villa Urquiza"
];
var geographicAliases = ["Palermo Viejo", "Palermo Hollywood", "Palermo Soho", "Palermo Chico", "Barrio Norte",
  "Once", "Abasto", "Belgrano R", "Belgrano C", "Capital", "CABA", "Bernal", "Temperley", "San Fernando", "Hurlingham"];
test("B1 los 48 barrios oficiales, alias y localidades funcionan con profile y app vieja", async t => {
  assert.equal(new Set(officialNeighborhoods).size, 48);
  var fetch = network(); t.mock.method(global, "fetch", fetch);
  for (var zone of officialNeighborhoods.concat(geographicAliases)) {
    for (var query of [{profile:"dinner", zone}, {category:"restaurantes", zone}]) {
      var res = await search(query); assert.equal(res.statusCode, 200, JSON.stringify(query));
      assert.ok(JSON.parse(googleCalls(fetch).at(-1).body).textQuery.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(plan.profileZone(zone)));
    }
  }
  assert.equal((await search({category:"bares", zone:"Mataderos"})).statusCode, 200);
  assert.equal((await search({category:"salones", zone:"Mataderos"})).statusCode, 200);
});
test("B1 sufijos permitidos se normalizan antes de query y search_repeat", async t => {
  var fetch = network(); t.mock.method(global, "fetch", fetch);
  for (var suffix of [", CABA", ", Capital", ", Capital Federal", ", Buenos Aires", ", Provincia de Buenos Aires"]) {
    assert.equal(plan.profileZone("  PÁLERMO " + suffix), "palermo");
    for (var query of [{profile:"dinner", zone:"Palermo" + suffix}, {category:"restaurantes", zone:"Palermo" + suffix}]) {
      assert.equal((await search(query)).statusCode, 200);
      assert.equal(JSON.parse(googleCalls(fetch).at(-1).body).textQuery, "restaurantes en palermo, Buenos Aires");
    }
  }
  var ip = "10.70.9.1";
  assert.equal((await search({profile:"grill", zone:"Palermo, CABA"}, ip)).statusCode, 200);
  assert.equal((await search({profile:"grill", zone:" PÁLERMO , Buenos Aires"}, ip)).statusCode, 200);
  assert.equal((await search({profile:"grill", zone:"Palermo"}, ip)).statusCode, 429);
  assert.equal((await search({category:"restaurantes", zone:"Palermo, CABA"}, ip)).statusCode, 200);
  assert.equal((await search({category:"restaurantes", zone:"Palermo, Buenos Aires"}, ip)).statusCode, 200);
  assert.equal((await search({category:"restaurantes", zone:"Palermo"}, ip)).statusCode, 429);
});
test("B1 basura/no-zona ni siquiera llama a contadores o Google, también en clientes viejos", async t => {
  var fetch = network(); t.mock.method(global, "fetch", fetch);
  var invalid = ["en Marzo", "Ana Perez", "ana@example.invalid", "Mi cena con amigos", "1122334455",
    "Ana Perez, CABA", "Palermo, ana@example.invalid", "Palermo, Buenos Aires, CABA", ", CABA", "Palermo, secreto", "Palermo\nnota privada"];
  for (var zone of invalid) {
    assert.equal(plan.profileZone(zone), null, zone);
    for (var query of [{profile:"dinner", zone}, {category:"restaurantes", zone}]) assert.equal((await search(query)).statusCode, 400, zone);
  }
  assert.equal(fetch.calls.length, 0);
});
test("O1 cumpleaños chicos conservan comida/bar; celebración requiere lugar o cantidad", () => {
  var cases = [
    [{type:"Cumpleaños", guests:6, needs:["comida"]}, "dinner"],
    [{type:"Cumpleaños con cena", guests:6, needs:["comida"]}, "dinner"],
    [{type:"Cumpleaños", guests:4, needs:[]}, "dinner"],
    [{type:"Cumpleaños", needs:[]}, "dinner"],
    [{type:"Fiesta", needs:[]}, "dinner"],
    [{type:"Cumpleaños", guests:10, needs:["bebida"]}, "bars"],
    [{type:"Cumpleaños", guests:30, needs:["lugar"]}, "celebration"],
    [{type:"Fiesta", guests:15, needs:[]}, "celebration"],
    [{type:"Cumpleaños", guests:6, needs:["lugar"]}, "celebration"],
    [{type:"Cumpleaños en salón", guests:6, needs:[]}, "celebration"],
    [{type:"Fiesta de 15", needs:["lugar"]}, "venues"]
  ];
  cases.forEach(([input, expected]) => assert.equal(f1.chooseProfile(input), expected, JSON.stringify(input)));
});
test("O2 foto real suma, foto sola no fuerza salón y cena gana a servicios accesorios", () => {
  assert.equal(f1.chooseProfile({type:"Fiesta", needs:["lugar", "musica", "deco", "torta", "foto"]}), "multi_service");
  assert.equal(f1.chooseProfile({type:"Fiesta", needs:["lugar", "musica", "foto"]}), "multi_service");
  assert.equal(f1.chooseProfile({type:"Cena", needs:["musica", "torta"]}), "dinner");
  assert.equal(f1.chooseProfile({type:"Comida", needs:["lugar", "musica", "foto"]}), "dinner");
  assert.equal(f1.chooseProfile({type:"Cena", guests:80, needs:["musica", "torta"]}), "venues");
  assert.equal(f1.chooseProfile({type:"Juntada", needs:["foto"]}), "dinner");
  var scenario = require("./fixtures/matching/scenarios-f6a").find(s => s.id === "musica-deco-torta-fotos");
  assert.ok(scenario.needs.includes("foto")); assert.ok(!scenario.needs.includes("fotos"));
});

test("BETA-6B cenas pequeñas no se convierten en salones por necesidades ambiguas o accesorias", () => {
  var cases = [
    ["Cena de cumpleaños para 6 personas en Palermo", "dinner"],
    ["Cena para 6 personas en un lugar lindo con buena ambientación", "dinner"],
    ["Cena de cumpleaños para 6 personas con torta", "dinner"],
    ["Cena para 6 personas con fotos y decoración", "dinner"],
    ["Cena de cumpleaños para 6 personas en un lugar lindo con buena ambientación", "dinner"],
    ["Cena de cumpleaños para 6 personas con torta y ambientación", "dinner"],
    ["Cena de cumpleaños para 6 personas con fotos y decoración", "dinner"]
  ];
  for (var [prompt, expected] of cases) {
    assert.equal(f1.profileForText(prompt).profile, expected, prompt);
  }
});

test("BETA-6B conserva salones explícitos, celebraciones grandes y pedidos multiservicio", () => {
  var cases = [
    ["Cumpleaños para 30 personas con salón", "celebration"],
    ["Evento con lugar, música, fotografía y catering", "multi_service"],
    ["Quiero alquilar un salón para 6 personas", "venues"],
    ["Cena de cumpleaños para 6 personas en un salón privado", "celebration"]
  ];
  for (var [prompt, expected] of cases) {
    assert.equal(f1.profileForText(prompt).profile, expected, prompt);
  }
});

test("BETA-6B no cambia perfiles no relacionados ni el guard de dieta", () => {
  var cases = [
    ["After office con tragos en Palermo", "after_office"],
    ["Asado para 8 personas en Palermo", "grill"],
    ["Aniversario para 2 personas en Recoleta", "romantic"],
    ["Evento corporativo para 20 personas en Palermo", "corporate"]
  ];
  for (var [prompt, expected] of cases) assert.equal(f1.profileForText(prompt).profile, expected, prompt);
  assert.equal(f1.chooseProfile({type:"Cena", needs:["comida"], diet:{on:{vegan:true}}}), "vegan");
});

test("BETA-6B B1 los campos editados prevalecen sobre el texto original", () => {
  function edited(prompt, changes) {
    var data = f1.profileForText(prompt).data;
    Object.keys(changes).forEach(function (key) { data[key] = changes[key]; });
    return f1.chooseProfile(data, prompt);
  }
  var birthday = "Cumpleaños en un salón para 6 personas con comida";
  assert.equal(edited(birthday, {type:"Cena"}), "dinner");
  assert.equal(edited(birthday, {type:"Cena", needs:["comida"]}), "dinner");
  assert.equal(edited("Quiero alquilar un salón para 6 personas", {type:"Cena", needs:["comida"]}), "dinner");
  assert.equal(edited("Cumple de 6 personas en un salón con comida", {needs:["comida"]}), "dinner");
  assert.equal(edited("Juntada de 6 amigos en un salón", {needs:["comida"]}), "dinner");
});

test("BETA-6B B2 negaciones y contexto gastronómico no se clasifican como salón", () => {
  var prompts = [
    "No quiero salón, quiero restaurante para cenar 6 personas",
    "Cena para 6 personas en Palermo, sin salón",
    "Cena para 6 personas, salón no",
    "Cena de 6 personas, no hace falta alquilar un lugar",
    "Juntada de 6 amigos sin salón, algo tranqui para comer",
    "Alquilar una mesa en un lugar lindo para cenar 6 personas",
    "Cena para 8 personas en un restaurante con salón privado"
  ];
  for (var prompt of prompts) assert.equal(f1.profileForText(prompt).profile, "dinner", prompt);
});

test("BETA-6B B2 conserva afirmaciones explícitas de salón", () => {
  var cases = [
    ["Quiero alquilar un salón para 6 personas", "venues"],
    ["Cena de cumpleaños para 6 personas en un salón privado", "celebration"],
    ["Quiero alquilar un espacio para cena de 10 personas", "venues"],
    ["Cumpleaños para 30 personas con salón", "celebration"]
  ];
  for (var [prompt, expected] of cases) assert.equal(f1.profileForText(prompt).profile, expected, prompt);
});

test("BETA-6B privacidad: el prompt se reduce localmente a profile y zone", () => {
  var source = require("node:fs").readFileSync(require("node:path").join(h.ROOT, "app.js"), "utf8");
  assert.match(source, /var profile = chooseProfile\(d, state\.text\);\s*var url = "\/api\/plan-options\?profile=" \+ encodeURIComponent\(profile\) \+ "&zone=" \+ encodeURIComponent\(d\.zone \|\| ""\);/);
});
