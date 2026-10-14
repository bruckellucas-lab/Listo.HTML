"use strict";

var test = require("node:test"), assert = require("node:assert/strict");
var fs = require("node:fs"), path = require("node:path");
var h = require("./helpers");
var source = fs.readFileSync(path.join(h.ROOT, "app.js"), "utf8");

function grab(name) {
  var start = source.indexOf("  function " + name + "(");
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf("\n  }\n", start) + 4);
}

test("F6B búsqueda real con restricciones fuertes corta antes de perfil, fetch y opciones cacheadas", () => {
  var definitions = source.slice(source.indexOf("  var DIET = ["), source.indexOf("  function dietById("));
  var run = new Function("state", "$", "renderSummary", "renderOptions", "savePlan", "setSearching",
    "setOptionsTitle", "chooseProfile", "fetch", definitions + grab("dietItems") + grab("currentDiet") +
    grab("hardRequirements") + grab("runSearch") + "runSearch(); return hardRequirements();");
  var cases = [
    ["kosher", {}, "kosher"], ["halal", {}, "halal"],
    ["celiac", {}, "celiac_safe"], ["allergy", {allergy:"detalle sintético"}, "allergy"],
    ["gluten", {gluten:"celiac"}, "celiac_safe"],
    ["vegan", {level:{vegan:"hard"}}, "vegan"],
    ["vegetarian", {level:{vegetarian:"hard"}}, "vegetarian"],
    ["lactose", {level:{lactose:"hard"}}, "lactose_free"],
    ["kids", {level:{kids:"hard"}}, "kids_menu"]
  ];
  for (var [id, extra, code] of cases) {
    var diet = Object.assign({on:{[id]:true}, level:{}, removed:[]}, extra);
    var state = {data:{type:"Cena", zone:"Palermo", diet}, options:[{name:"Opción cacheada"}], optionsAt:123};
    var box = {innerHTML:"Contenido anterior"}, renders = 0, saves = 0, searching = true;
    function prohibited() { assert.fail("Una restricción fuerte no debe iniciar búsqueda automática: " + id); }
    var hard = run(state, () => box, () => {}, () => { renders++; }, () => { saves++; },
      on => { searching = on; }, prohibited, prohibited, prohibited);
    assert.deepEqual(hard.map(item => item.code), [code]);
    assert.equal(state.options, null, id);
    assert.equal(state.optionsAt, 0, id);
    assert.equal(state.hasProposals, true, id);
    assert.equal(box.innerHTML, "", id);
    assert.equal(renders, 1, id);
    assert.equal(saves, 1, id);
    assert.equal(searching, false, id);
  }
});

test("F6B lista blanca visible exacta: label válida no habilita código, fuente o flag falsos", () => {
  var visible = new Function(grab("reasonForCard") + grab("visibleReason") + "return visibleReason;")();
  var types = ["Parrilla", "Restaurante", "Bar", "Café", "Salón / espacio", "Lugar para eventos"];
  var allowed = types.map(type => ({code:"profile_type", label:type + " · Datos de Google Maps", source:"google_maps", verified:true}));
  allowed.push({code:"zone_uncertain", label:"Zona a confirmar", source:"listo_policy", verified:false});
  allowed.push({code:"manual_confirmation", label:"Precio y disponibilidad a confirmar", source:"listo_policy", verified:false});
  for (var reason of allowed) {
    assert.equal(visible({reasons:[reason]}, false), reason.label);
    assert.doesNotMatch(visible({reasons:[reason]}, false), /verified|verificad/i);
    for (var mutation of [
      {code:"invented"}, {source:"invented"}, {source:reason.source === "google_maps" ? "listo_policy" : "google_maps"},
      {verified:!reason.verified}, {verified:String(reason.verified)}, {verified:undefined},
      {label:reason.label.toLowerCase()}, {label:reason.label + " ideal"}, {label:"<b>" + reason.label + "</b>"}
    ]) {
      assert.equal(visible({reasons:[Object.assign({}, reason, mutation)]}, false), "", JSON.stringify(mutation));
    }
  }
  assert.equal(visible({reasons:[{code:"zone_match", label:"En Palermo · Datos de Google Maps", source:"google_maps", verified:true}]}, false), "");
  assert.equal(visible({reasons:allowed}, true), "Preferencias alimentarias a confirmar");
});
