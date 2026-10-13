/* =========================================================
   LISTO — Lógica simple para elegir 3 lugares reales
   Ranking interno: zona, pertinencia y confianza de las reseñas.
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

// 48 barrios oficiales, más alias y localidades: sólo vocabulario geográfico cerrado.
var CABA_BARRIOS = [
  "agronomia", "almagro", "balvanera", "barracas", "belgrano", "boedo", "caballito", "chacarita",
  "coghlan", "colegiales", "constitucion", "flores", "floresta", "la boca", "la paternal", "liniers",
  "mataderos", "monserrat", "monte castro", "nueva pompeya", "nunez", "palermo", "parque avellaneda",
  "parque chacabuco", "parque chas", "parque patricios", "puerto madero", "recoleta", "retiro", "saavedra",
  "san cristobal", "san nicolas", "san telmo", "velez sarsfield", "versalles", "villa crespo",
  "villa del parque", "villa devoto", "villa general mitre", "villa lugano", "villa luro", "villa ortuzar",
  "villa pueyrredon", "villa real", "villa riachuelo", "villa santa rita", "villa soldati", "villa urquiza"
];
BA_ZONES = BA_ZONES.concat(CABA_BARRIOS, [
  "palermo viejo", "barrio norte", "once", "abasto", "belgrano r", "belgrano c",
  "bernal", "temperley", "san fernando", "hurlingham", "florida", "munro", "carapachay",
  "villa martelli", "boulogne", "don torcuato", "general pacheco", "benavidez", "del viso",
  "garin", "maschwitz", "villa ballester", "san martin", "caseros", "ciudadela", "santos lugares",
  "el palomar", "wilde", "sarandi", "gerli", "remedios de escalada", "ezpeleta", "berazategui",
  "florencio varela", "burzaco", "longchamps", "luis guillon", "monte grande", "ezeiza", "el jaguel",
  "san miguel", "bella vista", "jose c paz", "moreno", "merlo"
]);

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

// Consultas cerradas F1; F2 usa primaryTypes únicamente para ranking en memoria.
var PROFILES = Object.create(null);
[
  ["dinner", "Cena", "restaurantes", ["restaurant", "italian_restaurant", "fine_dining_restaurant"]],
  ["grill", "Parrilla", "parrillas", ["steak_house", "barbecue_restaurant"]],
  ["vegan", "Preferencia veggie", "restaurantes veganos", ["vegan_restaurant", "vegetarian_restaurant"]],
  ["romantic", "Cena romántica", "restaurantes para cena romantica", ["restaurant", "fine_dining_restaurant", "wine_bar"]],
  ["cafe_brunch", "Café / brunch", "cafes y brunch", ["cafe", "brunch_restaurant"]],
  ["bars", "Bar", "bares", ["bar", "pub", "cocktail_bar"]],
  ["after_office", "After office", "bares para after office", ["bar", "pub", "cocktail_bar"]],
  ["celebration", "Celebración", "salones para celebraciones", ["event_venue", "banquet_hall", "bar"]],
  ["baby_shower", "Baby shower", "lugares para baby shower", ["cafe", "brunch_restaurant", "event_venue"]],
  ["multi_service", "Evento con varias necesidades", "salones para eventos", ["event_venue", "banquet_hall"]],
  ["venues", "Salón", "salones para eventos", ["event_venue", "banquet_hall", "wedding_venue"]],
  ["corporate", "Evento corporativo", "salones para eventos corporativos", ["event_venue", "convention_center", "banquet_hall"]]
].forEach(function (p) {
  PROFILES[p[0]] = Object.freeze({ id: p[0], label: p[1], textQuery: p[2], primaryTypes: Object.freeze(p[3]) });
});
Object.freeze(PROFILES);

var SEARCH_ZONES = BA_ZONES.concat(["la plata", "rosario", "cordoba", "mendoza", "mar del plata", "bariloche", "salta", "tucuman", "buenos aires"]);

function profileZone(value) {
  if (value !== undefined && value !== null && typeof value !== "string") return null;
  var zone = norm(value);
  if (!zone) return "";
  // Se quita sólo un sufijo permitido completo; no se acepta contenido libre luego de la coma.
  zone = zone.replace(/\s*,\s*(?:caba|capital|capital federal|buenos aires|provincia de buenos aires)$/, "").trim();
  if (zone === "capital") zone = "capital federal";
  // No truncar ni interpolar texto libre. Sólo nombres del catálogo existente.
  return SEARCH_ZONES.indexOf(zone) !== -1 ? zone : null;
}

function buildProfileQuery(id, zone) {
  var profile = PROFILES[id], safeZone = profileZone(zone);
  if (!profile || safeZone === null) return "";
  return profile.textQuery + " en " + (safeZone || "Buenos Aires") +
    (BA_ZONES.indexOf(safeZone) !== -1 && safeZone !== "caba" && safeZone !== "capital federal" ? ", Buenos Aires" : "");
}

// Comparar componentes completos, no palabras dentro de calles o nombres de negocios.
var ZONE_CHILDREN = {
  palermo: ["palermo viejo", "palermo soho", "palermo hollywood", "palermo chico", "las canitas"],
  belgrano: ["belgrano r", "belgrano c"]
};
function zoneIdentity(value) {
  var n = norm(value), safe = profileZone(value);
  if (safe !== null) n = safe;
  return n === "caba" ? "capital federal" : n;
}
function clearZoneMatch(candidate, wanted) {
  if (candidate === wanted) return true;
  if (wanted === "capital federal") return CABA_BARRIOS.indexOf(candidate) !== -1 ||
    ["palermo viejo", "palermo soho", "palermo hollywood", "palermo chico", "las canitas", "barrio norte", "once", "abasto", "belgrano r", "belgrano c"].indexOf(candidate) !== -1;
  return Object.prototype.hasOwnProperty.call(ZONE_CHILDREN, wanted) && ZONE_CHILDREN[wanted].indexOf(candidate) !== -1;
}
function zoneMatches(row, zone) {
  var z = zoneIdentity(zone);
  if (!z) return false;
  var rz = zoneIdentity(row.zone);
  // Un barrio estructurado informado por Google tiene precedencia sobre la dirección textual.
  if (rz) return clearZoneMatch(rz, z);
  return String(row.address || "").split(",").slice(1).some(function (segment) {
    var component = segment.trim().replace(/^(?:[a-z]?\d{4}[a-z]{0,3})\s+/i, "");
    return clearZoneMatch(zoneIdentity(component), z);
  });
}

// Prior fijo conservador; no se infiere del usuario ni se almacena contenido Google.
var QUALITY_PRIOR = 4.0, QUALITY_WEIGHT = 50;
function qualityScore(row) {
  var r = row.rating, v = row.review_count;
  if (!Number.isFinite(r) || r < 0 || r > 5 || !Number.isSafeInteger(v) || v <= 0) return null;
  return (v * r + QUALITY_WEIGHT * QUALITY_PRIOR) / (v + QUALITY_WEIGHT);
}

// Familias abiertas de tipos de Google, sólo dentro de perfiles cerrados.
function pertinentType(profile, type) {
  if (!profile || typeof type !== "string") return false;
  if ((profile.id === "dinner" || profile.id === "romantic") && /_restaurant$/.test(type)) return true;
  if (profile.id === "dinner" && type === "steak_house") return true;
  return profile.primaryTypes.indexOf(type) !== -1;
}

function hasGoodRating(row) {
  return typeof row.rating === "number" && typeof row.review_count === "number" && row.review_count >= MIN_REVIEWS;
}

// Con perfil pertinente: zona clara, primaryType y calidad ajustada. Sin él, orden anterior.
// Excluye cerrados (definitiva o temporalmente) y duplicados (mismo lugar o mismo nombre).
function pickOptions(rows, zone, statusById, max, ranking) {
  ranking = ranking || {};
  var profile = typeof ranking.profile === "string" ? PROFILES[ranking.profile] : null;
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
    var place = ranking.placesById && Object.prototype.hasOwnProperty.call(ranking.placesById, row.google_place_id)
      ? ranking.placesById[row.google_place_id] : null;
    var relevant = !!(place && pertinentType(profile, place.primaryType));
    var inZone = zoneMatches(row, zone);
    candidates.push({ row: row, tier: (inZone ? 0 : 2) + (hasGoodRating(row) ? 0 : 1),
      inZone: inZone, relevant: relevant, quality: qualityScore(row), order: i });
  });
  // Sin perfil/tipos pertinentes entre candidatos utilizables: compatibilidad anterior.
  var useScoring = !!profile && candidates.some(function (c) { return c.relevant; });
  candidates.sort(function (a, b) {
    if (useScoring) {
      if (a.inZone !== b.inZone) return a.inZone ? -1 : 1;
      if (a.relevant !== b.relevant) return a.relevant ? -1 : 1;
      if (a.quality !== b.quality) {
        if (a.quality === null) return 1;
        if (b.quality === null) return -1;
        return b.quality - a.quality;
      }
      var reviews = (b.row.review_count || 0) - (a.row.review_count || 0);
      return reviews || a.order - b.order;
    }
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

// F5 filtra antes de limitar a tres, para no perder adecuadas más abajo en la respuesta.
var LEGACY_PROFILES = Object.assign(Object.create(null), { restaurantes: "dinner", bares: "bars", salones: "venues" });
function pickAdequateOptions(rows, zone, statusById, max, ranking) {
  ranking = ranking || {};
  var profile = typeof ranking.profile === "string" ? PROFILES[ranking.profile] : null;
  if (!profile) return [];
  var adequate = rows.filter(function (row) {
    var place = ranking.placesById && Object.prototype.hasOwnProperty.call(ranking.placesById, row.google_place_id)
      ? ranking.placesById[row.google_place_id] : null;
    return !!(place && pertinentType(profile, place.primaryType)) &&
      (ranking.allowOutsideZone !== false || !zone || zoneMatches(row, zone)) &&
      qualityScore(row) !== null && row.rating >= 4 && row.review_count >= MIN_REVIEWS;
  });
  return pickOptions(adequate, zone, statusById, max, ranking);
}
function optionZoneNotice(row, zone) {
  if (!zone || zoneMatches(row, zone)) return "";
  return row.zone && profileZone(row.zone) ? "Puede quedar fuera de la zona exacta." : "Zona a confirmar.";
}
function optionsFeedback(options) {
  var count = options.length, outside = options.some(function (o) { return o.outside_zone; });
  return {
    message: count === 0 ? "No encontramos opciones suficientemente buenas en esa zona. Podemos ayudarte a coordinarlo manualmente."
      : count === 1 ? "Encontramos 1 opción que encaja mejor con tu pedido."
      : count === 2 ? "Encontramos 2 opciones que encajan mejor con tu pedido." : "",
    manual_coordination: count < 3 || outside,
    outside_zone_message: outside ? "Algunas opciones pueden quedar fuera de la zona exacta." : ""
  };
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
  pickAdequateOptions: pickAdequateOptions,
  LEGACY_PROFILES: LEGACY_PROFILES,
  optionZoneNotice: optionZoneNotice,
  optionsFeedback: optionsFeedback,
  shortAddress: shortAddress,
  qualityScore: qualityScore,
  zoneMatches: zoneMatches
};
