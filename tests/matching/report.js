/* F0 · Imprime la línea base del matching actual en Markdown.
   Uso: node tests/matching/report.js            (sólo imprime)
        node tests/matching/report.js --write    (además actualiza tests/fixtures/matching/baseline.json) */
"use strict";

var fs = require("node:fs");
var path = require("node:path");
var harness = require("./harness");

function snapshot(out) {
  return {
    summary: out.summary,
    scenarios: out.results.map(function (r) {
      return { id: r.id, category: r.category, shown: r.shown, pertinent: r.pertinent, inZone: r.inZone,
        adequate: r.adequate, padding: r.padding, missed: r.missed, distinctAcrossUsers: r.distinctAcrossUsers };
    })
  };
}

function markdown(out) {
  var s = out.summary;
  var lines = [
    "| Métrica | Valor |", "|---|---|",
    "| Escenarios | " + s.scenarios + " |",
    "| Opciones mostradas | " + s.shown + " |",
    "| Pertinencia (tipo de lugar acorde al plan) | " + Math.round(s.pertinentRate * 100) + " % |",
    "| Dentro de la zona pedida | " + Math.round(s.inZoneRate * 100) + " % |",
    "| Mostradas que no eran adecuadas (relleno) | " + s.padding + " |",
    "| Adecuadas disponibles que no se mostraron | " + s.missed + " |",
    "| Escenarios con menos de 3 adecuadas | " + s.scenariosWithFewerThan3Adequate + " |",
    "| Escenarios donde todas las personas ven lo mismo | " + s.scenariosShowingSameForAllUsers + " de " + s.scenarios + " |",
    "| Pares de planes distintos con la misma búsqueda | " + s.differentPlansSameQueryPairs + " |",
    "| …que reciben exactamente los mismos 3 | " + s.differentPlansIdenticalTop3 + " |",
    "| Búsquedas distintas a Google para 20 planes | " + s.distinctQueries + " |",
    "",
    "| Escenario | Categoría | Pertinentes | En zona | Adecuadas disp. | Relleno | Omitidas |", "|---|---|---|---|---|---|---|"
  ];
  out.results.forEach(function (r) {
    lines.push("| " + r.id + " | " + r.category + " | " + r.pertinent + "/" + r.shown + " | " + (r.inZone === null ? "—" : r.inZone + "/" + r.shown) +
      " | " + r.adequate + " | " + r.padding + " | " + r.missed + " |");
  });
  return lines.join("\n");
}

if (require.main === module) {
  var out = harness.run();
  console.log(markdown(out));
  if (process.argv.indexOf("--write") !== -1) {
    fs.writeFileSync(path.join(__dirname, "..", "fixtures", "matching", "baseline.json"), JSON.stringify(snapshot(out), null, 2) + "\n");
    console.error("baseline.json actualizado");
  }
}

module.exports = { snapshot: snapshot, markdown: markdown };
