/* F0 · Escenarios SINTÉTICOS de pedidos. "relevant" = tipos de lugar (primaryType de Google)
   que consideramos pertinentes para ese plan. Es una etiqueta de referencia para medir,
   no una regla del producto. */
"use strict";

var DINNER = ["restaurant", "french_restaurant", "italian_restaurant", "steak_house", "sushi_restaurant", "pizza_restaurant",
  "vegan_restaurant", "spanish_restaurant", "fine_dining_restaurant", "barbecue_restaurant"];
var ROMANTIC = ["french_restaurant", "italian_restaurant", "fine_dining_restaurant", "wine_bar", "sushi_restaurant", "spanish_restaurant"];
var ASADO = ["steak_house", "barbecue_restaurant"];
var BARS = ["bar", "cocktail_bar", "pub", "wine_bar"];
var VENUES = ["event_venue", "banquet_hall", "wedding_venue", "convention_center"];
var GROUP_FOOD = ["restaurant", "steak_house", "pizza_restaurant", "italian_restaurant", "barbecue_restaurant", "spanish_restaurant", "bar"];
var CASUAL = ["cafe", "brunch_restaurant", "bar", "restaurant", "pizza_restaurant"];

// type = lo que detecta app.js; needs = ids de necesidades de app.js.
module.exports = [
  { id: "cena-pareja-palermo", type: "Cena", needs: ["comida"], guests: 2, zone: "Palermo", relevant: DINNER },
  { id: "aniversario-palermo", type: "Aniversario", needs: ["comida"], guests: 2, zone: "Palermo", relevant: ROMANTIC },
  { id: "asado-12-palermo", type: "Asado", needs: ["comida"], guests: 12, zone: "Palermo", relevant: ASADO },
  { id: "cumple-15-palermo", type: "Cumpleaños", needs: ["lugar", "comida"], guests: 15, zone: "Palermo", relevant: GROUP_FOOD },
  { id: "juntada-6-palermo", type: "Juntada", needs: [], guests: 6, zone: "Palermo", relevant: CASUAL },
  { id: "reunion-4-palermo", type: "Reunión", needs: [], guests: 4, zone: "Palermo", relevant: ["cafe", "brunch_restaurant", "restaurant"] },
  { id: "cena-vegana-palermo", type: "Cena", needs: ["comida"], guests: 6, zone: "Palermo", relevant: ["vegan_restaurant"], note: "preferencia vegana" },
  { id: "baby-shower-palermo", type: "Baby shower", needs: ["lugar", "torta"], guests: 20, zone: "Palermo", relevant: ["cafe", "brunch_restaurant", "event_venue"] },
  { id: "after-8-palermo", type: "After office", needs: ["bebida"], guests: 8, zone: "Palermo", relevant: BARS },
  { id: "despedida-10-palermo", type: "Despedida", needs: ["bebida"], guests: 10, zone: "Palermo", relevant: BARS },
  { id: "tragos-6-palermo", type: "", needs: ["bebida"], guests: 6, zone: "Palermo", relevant: BARS },
  { id: "fiesta-30-palermo", type: "Fiesta", needs: ["lugar", "musica"], guests: 30, zone: "Palermo", relevant: VENUES.concat(["bar"]) },
  { id: "casamiento-120-palermo", type: "Casamiento", needs: ["lugar", "comida"], guests: 120, zone: "Palermo", relevant: VENUES },
  { id: "corporativo-50-palermo", type: "Evento corporativo", needs: ["lugar"], guests: 50, zone: "Palermo", relevant: VENUES.concat(["hotel"]) },
  { id: "cumple-45-palermo", type: "Cumpleaños", needs: ["lugar"], guests: 45, zone: "Palermo", relevant: VENUES },
  { id: "graduacion-25-palermo", type: "Graduación", needs: ["lugar"], guests: 25, zone: "Palermo", relevant: VENUES.concat(GROUP_FOOD) },
  { id: "cena-4-caballito", type: "Cena", needs: ["comida"], guests: 4, zone: "Caballito", relevant: DINNER },
  { id: "asado-10-caballito", type: "Asado", needs: ["comida"], guests: 10, zone: "Caballito", relevant: ASADO },
  { id: "cena-6-nunez", type: "Cena", needs: ["comida"], guests: 6, zone: "Núñez", relevant: DINNER },
  { id: "cena-sin-zona", type: "Cena", needs: ["comida"], guests: 6, zone: "", relevant: DINNER }
];
