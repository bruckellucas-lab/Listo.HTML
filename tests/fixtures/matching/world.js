/* F0 · "Mundo" SINTÉTICO para medir el matching: lugares inventados con forma de respuesta
   de Google Places (New). No son datos reales de Google ni coordenadas reales: sólo sirven
   para comparar algoritmos de forma reproducible. Las mismas búsquedas (categoría + zona)
   devuelven siempre la misma lista, como pasa con Google. */
"use strict";

// [nombre, primaryType, etiqueta, rating, reseñas, barrio (Google), estado]
function place(prefix, i, row) {
  return {
    id: "SYN" + prefix + String(i).padStart(3, "0") + "xxxxxxxxxx",
    displayName: { text: row[0] },
    primaryType: row[1],
    primaryTypeDisplayName: { text: row[2] },
    rating: row[3],
    userRatingCount: row[4],
    formattedAddress: "Calle Sintética " + (100 + i) + ", " + (row[5] || "CABA"),
    addressComponents: row[5] ? [{ longText: row[5], types: ["neighborhood", "political"] }] : [],
    businessStatus: row[6] || "OPERATIONAL",
    googleMapsUri: "https://maps.google.com/?cid=" + prefix + i
  };
}
function pool(prefix, rows) { return rows.map(function (r, i) { return place(prefix, i + 1, r); }); }

var POOLS = {
  "restaurantes|Palermo": pool("RP", [
    ["Restaurante Alto A", "restaurant", "Restaurante", 4.8, 3200, "Palermo"],
    ["Bistró B", "french_restaurant", "Restaurante francés", 4.7, 2100, "Palermo"],
    ["Trattoria C", "italian_restaurant", "Restaurante italiano", 4.7, 1800, "Palermo"],
    ["Parrilla D", "steak_house", "Parrilla", 4.6, 5400, "Palermo"],
    ["Parrilla E", "steak_house", "Parrilla", 4.5, 2300, "Palermo"],
    ["Sushi F", "sushi_restaurant", "Restaurante de sushi", 4.6, 900, "Palermo"],
    ["Pizzería G", "pizza_restaurant", "Pizzería", 4.4, 3000, "Palermo"],
    ["Café H", "cafe", "Cafetería", 4.5, 1200, "Palermo"],
    ["Verde I", "vegan_restaurant", "Restaurante vegano", 4.6, 700, "Palermo"],
    ["Brunch J", "brunch_restaurant", "Brunch", 4.4, 650, "Palermo"],
    ["Bar K", "bar", "Bar", 4.3, 1500, "Palermo"],
    ["Casa L", "fine_dining_restaurant", "Alta cocina", 4.9, 21, "Palermo"],
    ["Cantina M", "restaurant", "Restaurante", 4.2, 400, "Villa Crespo"],
    ["Parrilla N", "steak_house", "Parrilla", 4.7, 4100, "Colegiales"],
    ["Asador O", "barbecue_restaurant", "Asador", 4.5, 800, "Belgrano"],
    ["Restaurante P", "restaurant", "Restaurante", 4.8, 2600, "Recoleta"],
    ["Cerrado Q", "restaurant", "Restaurante", 4.9, 5000, "Palermo", "CLOSED_PERMANENTLY"],
    ["Pausa R", "italian_restaurant", "Restaurante italiano", 4.8, 3000, "Palermo", "CLOSED_TEMPORARILY"],
    ["Restaurante Alto A", "restaurant", "Restaurante", 4.6, 300, "Palermo"],
    ["Tapas S", "spanish_restaurant", "Restaurante español", 4.3, 500, "Palermo"]
  ]),
  "bares|Palermo": pool("BP", [
    ["Bar Uno", "bar", "Bar", 4.6, 2400, "Palermo"],
    ["Coctelería Dos", "cocktail_bar", "Coctelería", 4.7, 1900, "Palermo"],
    ["Cervecería Tres", "pub", "Pub", 4.5, 2800, "Palermo"],
    ["Vinoteca Cuatro", "wine_bar", "Bar de vinos", 4.6, 800, "Palermo"],
    ["Bar Cinco", "bar", "Bar", 4.4, 1100, "Palermo"],
    ["Restaurante Seis", "restaurant", "Restaurante", 4.8, 3000, "Palermo"],
    ["Bar Siete", "bar", "Bar", 4.6, 1700, "Villa Crespo"],
    ["Pub Ocho", "pub", "Pub", 4.4, 900, "Belgrano"],
    ["Bar Nueve", "bar", "Bar", 4.9, 15, "Palermo"],
    ["Bar Diez", "bar", "Bar", 4.2, 600, "Palermo"]
  ]),
  "salones|Palermo": pool("SP", [
    ["Salón Uno", "event_venue", "Salón de eventos", 4.7, 600, "Palermo"],
    ["Salón Dos", "banquet_hall", "Salón de banquetes", 4.6, 450, "Palermo"],
    ["Quinta Tres", "wedding_venue", "Lugar para bodas", 4.8, 300, "Palermo"],
    ["Hotel Cuatro", "hotel", "Hotel", 4.5, 2500, "Palermo"],
    ["Restaurante Cinco", "restaurant", "Restaurante", 4.7, 1900, "Palermo"],
    ["Salón Seis", "event_venue", "Salón de eventos", 4.4, 200, "Colegiales"],
    ["Centro Siete", "convention_center", "Centro de convenciones", 4.5, 1200, "Recoleta"],
    ["Salón Ocho", "event_venue", "Salón de eventos", 4.9, 12, "Palermo"]
  ]),
  "restaurantes|Caballito": pool("RC", [
    ["Parrilla Caballito 1", "steak_house", "Parrilla", 4.5, 1300, "Caballito"],
    ["Pizzería Caballito 2", "pizza_restaurant", "Pizzería", 4.3, 900, "Caballito"],
    ["Restaurante Almagro 3", "restaurant", "Restaurante", 4.7, 2200, "Almagro"],
    ["Restaurante Flores 4", "restaurant", "Restaurante", 4.6, 1500, "Flores"],
    ["Café Boedo 5", "cafe", "Cafetería", 4.6, 700, "Boedo"],
    ["Restaurante Centro 6", "restaurant", "Restaurante", 4.8, 4000, "San Nicolás"]
  ]),
  "restaurantes|Nuñez": pool("RN", [
    ["Restaurante Núñez 1", "restaurant", "Restaurante", 4.4, 800, "Núñez"],
    ["Parrilla Núñez 2", "steak_house", "Parrilla", 4.6, 1400, "Núñez"],
    ["Restaurante Belgrano 3", "restaurant", "Restaurante", 4.7, 2100, "Belgrano"],
    ["Café Saavedra 4", "cafe", "Cafetería", 4.5, 500, "Saavedra"]
  ]),
  "restaurantes|": pool("RX", [
    ["Restaurante Ciudad 1", "restaurant", "Restaurante", 4.7, 5000, "San Nicolás"],
    ["Parrilla Ciudad 2", "steak_house", "Parrilla", 4.6, 6000, "Palermo"],
    ["Italiano Ciudad 3", "italian_restaurant", "Restaurante italiano", 4.6, 3000, "Recoleta"],
    ["Café Ciudad 4", "cafe", "Cafetería", 4.5, 2000, "Belgrano"],
    ["Sushi Ciudad 5", "sushi_restaurant", "Restaurante de sushi", 4.4, 1000, "Caballito"]
  ])
};

// Busca como Google: misma categoría + zona → misma lista (la zona se compara sin acentos).
function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim(); }
function search(category, zone) {
  var key = Object.keys(POOLS).filter(function (k) {
    var p = k.split("|");
    return p[0] === category && norm(p[1]) === norm(zone);
  })[0];
  return key ? POOLS[key] : [];
}

module.exports = { POOLS: POOLS, search: search, norm: norm };
