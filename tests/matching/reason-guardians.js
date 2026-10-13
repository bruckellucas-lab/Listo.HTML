/* F3 estricto: ningún claim comercial/dietario se habilita por evidence o verified. */
"use strict";
var plan = require("../../api/_lib/plan");
function normalize(text) {
  return String(text || "").normalize("NFKD").replace(/\p{M}|\p{Cf}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}$]+/gu, " ").trim();
}
var BANNED = /\b(?:apt[oa]s?|tacc|celiac[oa]s?|gluten|kosher|halal|certificad\w*|verificad\w*|verificar\w*|disponible\w*|disponibilidad|reserv\w*|capacidad|ars|recomendad\w*|garantizad\w*|confirmad\w*)\b|\beventos? privados?\b|\b(?:hasta|entran|para)\s+(?:[\p{L}\p{N}]+\s+){1,4}personas?\b|\bprecio desde\b|\bdesde\s*\$|\bpor persona\b|\bideal para tu grupo\b|\$\s*\d/u;
function textIssues(text) {
  // Única excepción de disponibilidad: frase segura completa. El resto continúa escaneándose.
  var n = normalize(text).replace(/\bprecio y disponibilidad a confirmar\b/g, "");
  return BANNED.test(n) ? ["forbidden-claim"] : [];
}
var TYPE_LABELS = {
  steak_house:"Parrilla · Datos de Google Maps", barbecue_restaurant:"Parrilla · Datos de Google Maps",
  restaurant:"Restaurante · Datos de Google Maps", cafe:"Café · Datos de Google Maps",
  bar:"Bar · Datos de Google Maps", pub:"Bar · Datos de Google Maps", cocktail_bar:"Bar · Datos de Google Maps", wine_bar:"Bar · Datos de Google Maps",
  banquet_hall:"Salón / espacio · Datos de Google Maps", wedding_venue:"Salón / espacio · Datos de Google Maps",
  event_venue:"Lugar para eventos · Datos de Google Maps", convention_center:"Lugar para eventos · Datos de Google Maps"
};
function reasonIssues(r, context) {
  if (!r || typeof r.label !== "string") return ["invalid-reason"];
  var out = textIssues(r.label); context = context || {};
  if (Object.keys(r).sort().join() !== "code,label,source,verified") out.push("unexpected-fields");
  if (r.code === "profile_type") {
    var t=context.primaryType;
    var expected = typeof t === "string" && t.endsWith("_restaurant") ? "Restaurante · Datos de Google Maps" : TYPE_LABELS[t];
    if (r.source !== "google_maps" || r.verified !== true || !expected || r.label !== expected) out.push("type-without-source");
  } else if (r.code === "zone_match") {
    if (r.source !== "google_maps" || r.verified !== true || !context.expectedZoneLabel || r.label !== context.expectedZoneLabel || !Object.values(plan.ZONE_REASON_LABELS).includes(r.label)) out.push("zone-without-source");
  } else {
    var policies={zone_uncertain:"Zona a confirmar", manual_confirmation:"Precio y disponibilidad a confirmar", dietary_unverified:"Preferencias alimentarias a confirmar"};
    if (!Object.hasOwn(policies,r.code) || r.label !== policies[r.code] || r.source !== "listo_policy" || r.verified !== false) out.push("invalid-policy");
    if (r.code === "dietary_unverified" && !context.softPreference) out.push("diet-without-preference");
  }
  return out;
}
module.exports={textIssues:textIssues,reasonIssues:reasonIssues};
