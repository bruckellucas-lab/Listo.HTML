/* =========================================================
   LISTO — Lógica simple para elegir 3 lugares reales
   (sin scoring complejo, a propósito).
   ========================================================= */
"use strict";

// Únicas categorías que la web puede pedir (no se aceptan búsquedas libres).
// Sin "prototipo": así "constructor" o "toString" no pasan como categoría.
var CATEGORIES = Object.assign(Object.create(null), {
  restaurantes: "restaurantes",
  bares: "bares",
  salones: "salones para eventos"
});

// Barrios y localidades de Buenos Aires: se les agrega ", Buenos Aires" para que
// Google no confunda, por ejemplo, Belgrano (CABA) con otra localidad.
var BA_ZONES = [
  "palermo", "palermo soho", "palermo hollywood", "palermo chico", "las canitas", "puerto madero", "san telmo",
  "villa crespo", "villa urquiza", "villa devoto", "villa del parque", "villa ortuzar", "la boca", "belgrano",
  "recoleta", "nunez", "colegiales", "chacarita", "microcentro", "caballito", "almagro", "saavedra", "coghlan",
  "retiro", "barracas", "boedo", "flores", "devoto", "monserrat", "balvanera", "agronomia", "parque patricios",
  "congreso", "centro", "olivos", "vicente lopez", "san isidro", "martinez", "acassuso", "beccar", "tigre",
  "nordelta", "pilar", "escobar", "quilmes", "lomas de zamora", "adrogue", "banfield", "lanus", "avellaneda",
  "ramos mejia", "moron", "haedo", "castelar", "ituzaingo", "san justo", "canning", "zona norte", "zona sur",
  "zona oeste", "caba", "capital federal"
];

var MIN_REVIEWS = 20;

function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

// Zona escrita por el usuario: sólo letras, espacios y signos simples. Si no, se ignora.
function cleanZone(z) {
  var s = String(z || "").replace(/\s+/g, " ").trim().slice(0, 40);
  return /^[\p{L}][\p{L} .'’-]{1,39}$/u.test(s) ? s : "";
}

function buildQuery(category, zone) {
  var label = CATEGORIES[category];
  if (!label) return "";
  if (!zone) return label + " en Buenos Aires";
  var n = norm(zone);
  var suffix = BA_ZONES.indexOf(n) !== -1 && n !== "caba" && n !== "capital federal" ? ", Buenos Aires" : "";
  return label + " en " + zone + suffix;
}

// F1: consultas y tipos cerrados. Los tipos quedan como metadata; no cambian el ranking.
var PROFILES = Object.create(null);
[
  ["dinner", "Cena", "restaurantes", ["restaurant", "italian_restaurant", "fine_dining_restaurant"]],
  ["grill", "Parrilla", "parrillas", ["steak_house", "barbecue_restaurant"]],
  ["vegan", "Preferencia veggie", "restaurantes veganos", ["vegan_restaurant", "vegetarian_restaurant"]],
  ["romantic", "Cena romántica", "restaurantes para cena romantica", ["restaurant", "fine_dining_restaurant"]],
  ["cafe_brunch", "Café / brunch", "cafes y brunch", ["cafe", "brunch_restaurant"]],
  ["bars", "Bar", "bares", ["bar", "pub", "cocktail_bar"]],
  ["after_office", "After office", "bares para after office", ["bar", "pub", "cocktail_bar"]],
  ["celebration", "Celebración", "salones para celebraciones", ["event_venue", "banquet_hall", "bar"]],
  ["baby_shower", "Baby shower", "lugares para baby shower", ["cafe", "brunch_restaurant", "event_venue"]],
  ["multi_service", "Evento con varias necesidades", "salones para eventos", ["event_venue", "banquet_hall"]],
  ["venues", "Salón", "salones para eventos", ["event_venue", "banquet_hall", "wedding_venue"]],
  ["corporate", "Evento corporativo", "salones para eventos corporativos", ["event_venue", "convention_center"]]
].forEach(function (p) {
  PROFILES[p[0]] = Object.freeze({ id: p[0], label: p[1], textQuery: p[2], primaryTypes: Object.freeze(p[3]) });
});
Object.freeze(PROFILES);

var SEARCH_ZONES = BA_ZONES.concat(["la plata", "rosario", "cordoba", "mendoza", "mar del plata", "bariloche", "salta", "tucuman", "buenos aires"]);

function profileZone(value) {
  if (value !== undefined && value !== null && typeof value !== "string") return null;
  var zone = norm(value);
  if (!zone) return "";
  // No truncar ni interpolar texto libre. Sólo nombres del catálogo existente.
  return SEARCH_ZONES.indexOf(zone) !== -1 ? zone : null;
}

function buildProfileQuery(id, zone) {
  var profile = PROFILES[id], safeZone = profileZone(zone);
  if (!profile || safeZone === null) return "";
  return profile.textQuery + " en " + (safeZone || "Buenos Aires") +
    (BA_ZONES.indexOf(safeZone) !== -1 && safeZone !== "caba" && safeZone !== "capital federal" ? ", Buenos Aires" : "");
}

function zoneMatches(row, zone) {
  var z = norm(zone);
  if (!z) return false;
  var rz = norm(row.zone);
  if (rz && (rz === z || rz.indexOf(z) !== -1 || z.indexOf(rz) !== -1)) return true;
  return norm(row.address).indexOf(z) !== -1;
}

function hasGoodRating(row) {
  return typeof row.rating === "number" && typeof row.review_count === "number" && row.review_count >= MIN_REVIEWS;
}

// Ordena: 1) coincide con la zona, 2) tiene rating y reseñas suficientes, 3) rating, 4) reseñas.
// Excluye cerrados (definitiva o temporalmente) y duplicados (mismo lugar o mismo nombre).
function pickOptions(rows, zone, statusById, max) {
  max = max || 3;
  var seenId = {}, seenName = {};
  var candidates = [];
  rows.forEach(function (row, i) {
    var status = statusById && statusById[row.google_place_id];
    if (status === "CLOSED_PERMANENTLY" || status === "CLOSED_TEMPORARILY") return;
    var nameKey = norm(row.name);
    if (!row.google_place_id || seenId[row.google_place_id] || !nameKey || seenName[nameKey]) return;
    seenId[row.google_place_id] = true;
    seenName[nameKey] = true;
    candidates.push({ row: row, tier: (zoneMatches(row, zone) ? 0 : 2) + (hasGoodRating(row) ? 0 : 1), order: i });
  });
  candidates.sort(function (a, b) {
    if (a.tier !== b.tier) return a.tier - b.tier;
    var ra = typeof a.row.rating === "number" ? a.row.rating : -1;
    var rb = typeof b.row.rating === "number" ? b.row.rating : -1;
    if (ra !== rb) return rb - ra;
    var ca = a.row.review_count || 0, cb = b.row.review_count || 0;
    if (ca !== cb) return cb - ca;
    return a.order - b.order;
  });
  return candidates.slice(0, max).map(function (c) { return c.row; });
}

// "Gorriti 5000, C1414 CABA, Argentina" → "Gorriti 5000"
function shortAddress(address) {
  var first = String(address || "").split(",")[0].trim();
  return first || null;
}

module.exports = {
  CATEGORIES: CATEGORIES,
  PROFILES: PROFILES,
  profileZone: profileZone,
  buildProfileQuery: buildProfileQuery,
  MIN_REVIEWS: MIN_REVIEWS,
  cleanZone: cleanZone,
  buildQuery: buildQuery,
  pickOptions: pickOptions,
  shortAddress: shortAddress,
  zoneMatches: zoneMatches
};
