/* =========================================================
   LISTO — Atributos alimentarios de proveedores (tabla provider_dietary_attributes)
   - Sólo el panel /admin los carga, a mano y con evidencia.
   - Google, reseñas o el nombre del lugar son SEÑALES: como mucho "No verificado".
     Nunca pueden quedar como "Verificado" (lo controla este archivo y también Supabase).
   - Una verificación vence en la primera de estas fechas: "revisar después de"
     o "evidencia válida hasta". Vencida = deja de valer (no se borra ni se modifica).
   ========================================================= */
"use strict";

var validDate = require("./calendar").validDate;

var ATTRIBUTES = [
  { code: "kosher", label: "Kosher", months: 6 },
  { code: "halal", label: "Halal", months: 6 },
  { code: "celiac_safe", label: "Apto celíacos / Sin TACC", months: 6 },
  { code: "gluten_free_options", label: "Opciones sin gluten", months: 12 },
  { code: "vegan_only", label: "100% vegano", months: 12 },
  { code: "vegan_options", label: "Opciones veganas", months: 12 },
  { code: "vegetarian_only", label: "100% vegetariano", months: 12 },
  { code: "vegetarian_options", label: "Opciones vegetarianas", months: 12 },
  { code: "lactose_free_options", label: "Opciones sin lactosa", months: 12 },
  { code: "kids_menu", label: "Menú infantil", months: 12 }
];
var CODES = ATTRIBUTES.map(function (a) { return a.code; });
var STATUSES = ["verified", "unverified", "no", "unknown"];
var TRUSTED = ["certifier", "official_website", "provider_document", "provider_direct", "other_trusted"];
var SIGNALS = ["google_signal", "review_signal", "name_signal"];
var NEEDS_CERTIFIER = ["kosher", "halal"];
var KOSHER_CATEGORIES = ["meat", "dairy", "parve"];
var PLACE_ID_RE = /^[A-Za-z0-9_-]{10,500}$/;
var FIELDS = "id,created_at,updated_at,provider_google_place_id,attribute,status,source_type,source_url,certifier,kosher_category," +
  "verification_notes,verified_at,review_after,evidence_valid_until";

function todayAR() { return new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); }
function text(v, max) { var s = String(v === undefined || v === null ? "" : v).trim(); return s ? s.slice(0, max) : null; }
function monthsOf(code) { var a = ATTRIBUTES.filter(function (x) { return x.code === code; })[0]; return a ? a.months : 12; }

// Suma meses a una fecha AAAA-MM-DD (si el día no existe en ese mes, usa el último día).
function addMonths(day, months) {
  var p = day.split("-").map(Number);
  var y = p[0], m = p[1] - 1 + months, d = p[2];
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return y + "-" + String(m + 1).padStart(2, "0") + "-" + String(Math.min(d, last)).padStart(2, "0");
}

// La fecha guardada de verificación es un instante; para comparar fechas se usa el día en Argentina.
function dayAR(ts) {
  if (!ts) return null;
  var t = Date.parse(ts);
  return isNaN(t) ? null : new Date(t - 3 * 3600e3).toISOString().slice(0, 10);
}

// Vencimiento efectivo: la primera entre "revisar después de" y "evidencia válida hasta".
function expiresOn(row) {
  var dates = [row.review_after, row.evidence_valid_until].filter(function (d) { return d && validDate(String(d).slice(0, 10)); })
    .map(function (d) { return String(d).slice(0, 10); }).sort();
  return dates[0] || null;
}

// Estado que vale HOY: "expired" si está verificado pero ya llegó la fecha de vencimiento.
function effectiveStatus(row, today) {
  if (!row || STATUSES.indexOf(row.status) === -1) return "unknown";
  if (row.status !== "verified") return row.status;
  var exp = expiresOn(row);
  return exp && (today || todayAR()) >= exp ? "expired" : "verified";
}

function withEffective(row, today) {
  var out = {};
  Object.keys(row).forEach(function (k) { out[k] = row[k]; });
  out.expires_on = row.status === "verified" ? expiresOn(row) : null;
  out.effective_status = effectiveStatus(row, today);
  return out;
}

// Valida lo que manda el panel. Devuelve { data } (fila lista para guardar) o { error }.
function validate(b, today) {
  today = today || todayAR();
  var placeId = String(b.provider_google_place_id || "");
  if (!PLACE_ID_RE.test(placeId)) return { error: "Proveedor no válido." };
  var attribute = String(b.attribute || "");
  if (CODES.indexOf(attribute) === -1) return { error: "Elegí un atributo." };
  var status = String(b.status || "");
  if (STATUSES.indexOf(status) === -1) return { error: "Elegí un estado." };

  // "Desconocido": sin evidencia.
  if (status === "unknown") {
    return { data: { provider_google_place_id: placeId, attribute: attribute, status: "unknown", source_type: null, source_url: null,
      certifier: null, kosher_category: null, verification_notes: text(b.verification_notes, 2000),
      verified_at: null, review_after: null, evidence_valid_until: null } };
  }

  var source = text(b.source_type, 40);
  if (source && TRUSTED.indexOf(source) === -1 && SIGNALS.indexOf(source) === -1) return { error: "Fuente no válida." };
  if (status === "verified") {
    if (!source) return { error: "Para marcar Verificado, elegí la fuente." };
    if (SIGNALS.indexOf(source) !== -1) return { error: "Una señal de Google, reseñas o nombre NO alcanza para marcar Verificado. Guardalo como No verificado." };
  }
  if (SIGNALS.indexOf(source) !== -1 && status !== "unverified") {
    return { error: "Una señal de Google, reseñas o nombre sólo puede guardarse como No verificado." };
  }

  var url = text(b.source_url, 1000);
  if (url && !/^https:\/\/[^\s]+$/.test(url)) return { error: "El link de la fuente tiene que empezar con https://" };
  var certifier = text(b.certifier, 200);
  if (certifier && certifier.length < 2) return { error: "Revisá el certificador." };
  if (status === "verified" && NEEDS_CERTIFIER.indexOf(attribute) !== -1 && !certifier) {
    return { error: (attribute === "kosher" ? "Kosher" : "Halal") + " verificado necesita el certificador (no lo inventes: tiene que figurar en la evidencia)." };
  }
  var category = text(b.kosher_category, 10);
  if (category && attribute !== "kosher") return { error: "La categoría kosher sólo aplica a Kosher." };
  if (category && KOSHER_CATEGORIES.indexOf(category) === -1) return { error: "Categoría kosher no válida." };

  var verifiedDay = text(b.verified_at, 10);
  if (!verifiedDay && (status === "verified" || status === "no")) verifiedDay = today;
  if (verifiedDay && !validDate(verifiedDay)) return { error: "Revisá la fecha de verificación." };
  if (verifiedDay && verifiedDay > today) return { error: "La fecha de verificación no puede ser futura." };

  var review = text(b.review_after, 10);
  if (review && !validDate(review)) return { error: "Revisá la fecha de \"revisar después de\"." };
  if (!review && status === "verified") review = addMonths(verifiedDay, monthsOf(attribute));
  if (review && verifiedDay && review < verifiedDay) return { error: "\"Revisar después de\" no puede ser anterior a la verificación." };

  var evidence = text(b.evidence_valid_until, 10);
  if (evidence && !validDate(evidence)) return { error: "Revisá la fecha de \"evidencia válida hasta\"." };
  if (evidence && verifiedDay && evidence < verifiedDay) return { error: "\"Evidencia válida hasta\" no puede ser anterior a la verificación." };

  return { data: {
    provider_google_place_id: placeId, attribute: attribute, status: status,
    source_type: source, source_url: url, certifier: certifier, kosher_category: attribute === "kosher" ? category : null,
    verification_notes: text(b.verification_notes, 2000),
    // Mediodía de Argentina: así el día es el mismo en Argentina y en UTC (Supabase compara en UTC).
    verified_at: verifiedDay ? new Date(verifiedDay + "T12:00:00-03:00").toISOString() : null,
    review_after: review, evidence_valid_until: evidence
  } };
}

module.exports = {
  ATTRIBUTES: ATTRIBUTES, CODES: CODES, STATUSES: STATUSES, TRUSTED: TRUSTED, SIGNALS: SIGNALS,
  KOSHER_CATEGORIES: KOSHER_CATEGORIES, FIELDS: FIELDS, PLACE_ID_RE: PLACE_ID_RE,
  todayAR: todayAR, addMonths: addMonths, dayAR: dayAR, expiresOn: expiresOn, effectiveStatus: effectiveStatus,
  withEffective: withEffective, validate: validate
};
