"use strict";

var test = require("node:test"), assert = require("node:assert/strict");
var fs = require("node:fs"), path = require("node:path");
var h = require("./helpers");
var source = fs.readFileSync(path.join(h.ROOT, "app.js"), "utf8");
var MESSAGE = "Hola LISTO. Quiero ayuda para coordinar un plan con requisitos especiales.";
var PHONE = "5491158065840";

function grab(name) {
  var start = source.indexOf("  function " + name + "(");
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf("\n  }\n", start) + 4);
}

var definitions = source.slice(source.indexOf("  var DIET = ["), source.indexOf("  function dietById("));
var render = new Function("state", "$", "$all", "LISTO_WHATSAPP", "unexpected",
  definitions + ["escapeHTML", "dietItems", "dietLabel", "currentDiet", "hardRequirements", "softPreferences",
    "setOptionsTitle", "optionsFeedback", "optionsFeedbackHTML", "reasonForCard", "visibleReason",
    "renderSensitive", "renderOptions"].map(grab).join("\n") +
  "var photoHTML=unexpected, safeHttps=unexpected, ratingText=unexpected, shareText=unexpected; renderOptions();");

function links(html) {
  return Array.from(html.matchAll(/<a\b[^>]*href="([^"]+)"/g), m => new URL(m[1]))
    .filter(url => url.hostname === "wa.me");
}

function sensitive(diet) {
  var state = {
    text:"SENTINEL-PROMPT Ana Pérez ana@example.invalid +54 11 5555 1234, 30 personas en Palermo, " +
      "2030-11-20, presupuesto 876543, celíaco sin TACC, gluten, maní y frutos secos, kosher y halal",
    data:{diet, zone:"Palermo", date:"2030-11-20", guests:30, budget:876543,
      contact_name:"Ana Pérez", contact_email:"ana@example.invalid", contact_phone:"+54 11 5555 1234",
      comments:"SENTINEL-COMENTARIO", original_prompt:"SENTINEL-ORIGINAL"},
    // Incluso si quedan opciones viejas, el guard sensible no debe mostrar tarjetas ni links de compartir.
    options:[{google_place_id:"SYNcached", name:"SENTINEL-OPCION"}], selected:null
  };
  var before = JSON.stringify(state), box = {innerHTML:""};
  render(state, () => box, () => [], PHONE, () => assert.fail("No debe procesar opciones automáticas"));
  assert.equal(JSON.stringify(state), before, "render no modifica datos ni recibos");
  assert.match(box.innerHTML, /Pedile a LISTO que lo busque/);
  assert.match(box.innerHTML, /data-action="details"/);
  assert.doesNotMatch(box.innerHTML, /data-choose|data-advance|card-wa|SENTINEL-OPCION/);
  var urls = links(box.innerHTML);
  assert.equal(urls.length, 1, "sólo salida manual; no compartir tarjeta");
  var url = urls[0];
  assert.equal(url.protocol, "https:");
  assert.equal(url.pathname, "/" + PHONE);
  assert.deepEqual(Array.from(url.searchParams.keys()), ["text"]);
  assert.equal(url.searchParams.get("text"), MESSAGE);
  assert.equal(url.hash, "");
  var decoded = decodeURIComponent(url.href);
  assert.doesNotMatch(decoded, /SENTINEL|cel[ií]aco|alerg|al[eé]rg|man[ií]|frutos secos|kosher|halal|TACC|gluten|lactosa|vegano|vegetariano|infantil|Palermo|2030-11-20|876543|30 personas|Ana|example|5555/i);
  assert.match(box.innerHTML, /target="_blank" rel="noopener noreferrer"/);
  return box.innerHTML;
}

function diet(id, extra) {
  return Object.assign({on:{[id]:true}, level:{}, removed:[]}, extra);
}

test("BETA-1 celiaquía y gluten obligatorio: coordinación sin prompt ni dieta en URL", () => {
  sensitive(diet("celiac"));
  sensitive(diet("gluten", {gluten:"celiac"}));
});

test("BETA-1 alergia: detalle queda local, nunca en link ni texto WhatsApp", () => {
  for (var detail of ["maní", "mani y frutos secos", "alérgico al maní", "SENTINEL-DETALLE &email=privado@example.invalid <script>"]) {
    var html = sensitive(diet("allergy", {allergy:detail}));
    assert.match(html, /Alergia:/, "la explicación local del requisito se conserva");
    assert.doesNotMatch(html, /<script>/, "la explicación local sigue escapada");
  }
});

test("BETA-1 kosher, halal y requisitos combinados: mismo mensaje genérico", () => {
  sensitive(diet("kosher"));
  sensitive(diet("halal"));
  sensitive({on:{kosher:true, halal:true, celiac:true, allergy:true}, level:{}, removed:[], allergy:"maní y frutos secos"});
});

test("BETA-1 preferencias obligatorias, fecha/zona/presupuesto y contactos no salen en link", () => {
  for (var id of ["vegan", "vegetarian", "lactose", "kids"]) sensitive(diet(id, {level:{[id]:"hard"}}));
});

test("BETA-1 fallback F5 conserva texto genérico original en 0/1/2 y fuera de zona", () => {
  var feedback = new Function("state", "LISTO_WHATSAPP", "list",
    grab("escapeHTML") + grab("optionsFeedback") + grab("optionsFeedbackHTML") + "return optionsFeedbackHTML(list);");
  for (var list of [[], [{}], [{}, {}], [{outside_zone:true}, {}, {}]]) {
    var urls = links(feedback({text:"SENTINEL-PROMPT", data:{allergy:"maní"}}, PHONE, list));
    assert.equal(urls.length, 1);
    assert.equal(urls[0].pathname, "/" + PHONE);
    assert.deepEqual(Array.from(urls[0].searchParams.keys()), ["text"]);
    assert.equal(urls[0].searchParams.get("text"), "Hola LISTO. Quiero ayuda para coordinar un plan.");
  }
});
