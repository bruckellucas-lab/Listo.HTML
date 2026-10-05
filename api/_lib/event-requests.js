/* =========================================================
   LISTO — Pedidos (tabla event_requests), validados en el servidor
   - El navegador genera el id (UUID) para conocerlo sin leer la tabla;
     acá se valida que sea un UUID real.
   - Restricciones alimentarias (dietary_requirements), igual que la web:
       null  → nunca se tocaron;
       []    → se tocaron y no quedó ninguna activa;
       lista → restricciones activas { code, level, detail? }.
     No se corrige ni se inventa nada: si algo no cumple las reglas, se rechaza.
   - Las mismas reglas las controla Supabase (event_requests_dietary_ok).
   ========================================================= */
"use strict";

var store = require("./providers-store");

var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var LIMITS = {
  promptMin: 8, promptMax: 2000,     // mismo rango que la policy original de Supabase
  textMax: 120,                      // tipo de plan y zona
  guestsMax: 2000,                   // mismo tope que la web
  budgetMax: 999999999999,           // 12 dígitos, como la web
  needsMax: 30, needMax: 100,
  dietMax: 10, detailMin: 2, detailMax: 200
};
var DIET_CODES = ["kosher", "halal", "celiac_safe", "gluten_free", "vegan", "vegetarian", "lactose_free", "kids_menu", "allergy"];
var ALWAYS_HARD = ["kosher", "halal", "celiac_safe", "allergy"];
var ALWAYS_SOFT = ["gluten_free"];
var FIELDS = ["id", "original_prompt", "event_type", "guests", "zone", "budget", "needs", "dietary_requirements", "status"];

function optionalText(v, max, label) {
  if (v === undefined || v === null) return { value: null };
  if (typeof v !== "string") return { error: label + " no es válido." };
  var s = v.trim();
  if (s.length > max) return { error: label + " es demasiado largo." };
  return { value: s || null };
}

function optionalInt(v, max, label) {
  if (v === undefined || v === null) return { value: null };
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > max) return { error: label + " no es válido." };
  return { value: v };
}

// null / [] / lista, con las mismas reglas que la web y que Supabase.
function validateDiet(v) {
  if (v === undefined || v === null) return { value: null };
  if (!Array.isArray(v)) return { error: "Las restricciones alimentarias no son válidas." };
  if (v.length > LIMITS.dietMax) return { error: "Hay demasiadas restricciones alimentarias." };
  var seen = {}, out = [];
  for (var i = 0; i < v.length; i++) {
    var item = v[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) return { error: "Las restricciones alimentarias no son válidas." };
    var keys = Object.keys(item);
    if (keys.some(function (k) { return ["code", "level", "detail"].indexOf(k) === -1; })) return { error: "Las restricciones alimentarias no son válidas." };
    var code = item.code, level = item.level;
    if (DIET_CODES.indexOf(code) === -1) return { error: "Restricción alimentaria desconocida." };
    if (level !== "hard" && level !== "soft") return { error: "Las restricciones alimentarias no son válidas." };
    if (ALWAYS_HARD.indexOf(code) !== -1 && level !== "hard") return { error: "Las restricciones alimentarias no son válidas." };
    if (ALWAYS_SOFT.indexOf(code) !== -1 && level !== "soft") return { error: "Las restricciones alimentarias no son válidas." };
    if (seen[code]) return { error: "Hay una restricción alimentaria repetida." };
    seen[code] = true;
    var clean = { code: code, level: level };
    if (code === "allergy") {
      if (typeof item.detail !== "string") return { error: "Contanos a qué sos alérgico/a." };
      var detail = item.detail.trim();
      if (detail.length < LIMITS.detailMin || detail.length > LIMITS.detailMax || detail !== item.detail) {
        return { error: "Revisá el detalle de la alergia." };
      }
      clean.detail = detail;
    } else if (item.detail !== undefined) {
      return { error: "Las restricciones alimentarias no son válidas." };
    }
    out.push(clean);
  }
  return { value: out };
}

// Valida el pedido. Devuelve { data } (fila lista para guardar) o { error }.
function validate(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return { error: "No pudimos leer el pedido." };
  var unknown = Object.keys(b).filter(function (k) { return FIELDS.indexOf(k) === -1; });
  if (unknown.length) return { error: "El pedido trae datos que no corresponden." };

  if (typeof b.id !== "string" || !UUID_RE.test(b.id)) return { error: "No pudimos identificar tu pedido. Recargá la página y probá de nuevo." };
  if (b.status !== undefined && b.status !== "new") return { error: "El estado del pedido no es válido." };

  if (typeof b.original_prompt !== "string") return { error: "Contanos qué querés hacer." };
  var prompt = b.original_prompt.trim();
  if (prompt.length < LIMITS.promptMin) return { error: "Contanos un poco más: qué querés hacer, para cuántos y dónde." };
  if (b.original_prompt.length > LIMITS.promptMax) return { error: "El pedido es demasiado largo (máximo " + LIMITS.promptMax + " caracteres)." };

  var type = optionalText(b.event_type, LIMITS.textMax, "El tipo de plan");
  if (type.error) return type;
  var zone = optionalText(b.zone, LIMITS.textMax, "La zona");
  if (zone.error) return zone;
  var guests = optionalInt(b.guests, LIMITS.guestsMax, "La cantidad de personas");
  if (guests.error) return guests;
  var budget = optionalInt(b.budget, LIMITS.budgetMax, "El presupuesto");
  if (budget.error) return budget;

  var needs = [];
  if (b.needs !== undefined && b.needs !== null) {
    if (!Array.isArray(b.needs) || b.needs.length > LIMITS.needsMax) return { error: "Las necesidades no son válidas." };
    for (var i = 0; i < b.needs.length; i++) {
      var n = b.needs[i];
      if (typeof n !== "string" || !n.trim() || n.trim().length > LIMITS.needMax) return { error: "Las necesidades no son válidas." };
      needs.push(n.trim());
    }
  }

  // Igual que antes: un pedido sin nada entendible no se guarda.
  if (!type.value && !guests.value && !zone.value && !budget.value && !needs.length) {
    return { error: "Contanos qué plan es o elegí al menos una cosa que necesites." };
  }

  var diet = validateDiet(b.dietary_requirements);
  if (diet.error) return diet;

  var data = {
    id: b.id.toLowerCase(),
    original_prompt: b.original_prompt,
    event_type: type.value,
    guests: guests.value,
    zone: zone.value,
    budget: budget.value,
    needs: needs,
    status: "new"
  };
  // Pedidos de versiones viejas de la web (sin el campo) se guardan sin tocar la columna.
  if (b.dietary_requirements !== undefined) data.dietary_requirements = diet.value;
  return { data: data };
}

function api(cfg) { return store.normalizeUrl(cfg.url) + "/rest/v1/event_requests"; }

function insert(cfg, row, fetchImpl) {
  return store.request(fetchImpl || fetch, api(cfg), {
    method: "POST",
    // "minimal": Supabase no devuelve la fila (no hace falta y no exponemos nada).
    headers: store.headersFor(cfg.key, { "Prefer": "return=minimal" }),
    body: JSON.stringify(row)
  }, "guardar pedido");
}

function copyWithout(row, key, value) {
  var out = {};
  Object.keys(row).forEach(function (k) { if (k !== key) out[k] = row[k]; });
  if (value !== undefined) out[key] = value;
  return out;
}

// Mismos reintentos que hacía la web:
// - si "needs" fuera texto (y no lista), se guarda "Lugar, Comida, Bebida";
// - si todavía no existiera la columna dietary_requirements, se guarda sin ella.
async function save(cfg, row, fetchImpl) {
  var current = row;
  for (var attempt = 0; attempt < 3; attempt++) {
    try {
      await insert(cfg, current, fetchImpl);
      return;
    } catch (err) {
      var detail = String(err.message || "") + " " + String(err.code || "");
      if (Array.isArray(current.needs) && err.status === 400 && /needs|array|malformed|json/i.test(detail) && !/dietary_requirements/.test(detail)) {
        current = copyWithout(current, "needs", current.needs.join(", "));
        continue;
      }
      if ("dietary_requirements" in current && (err.code === "PGRST204" || err.code === "42703") && /dietary_requirements/.test(String(err.message))) {
        current = copyWithout(current, "dietary_requirements");
        continue;
      }
      throw err;
    }
  }
}

function explain(err) {
  if (err.code === "23505") return { status: 409, message: "Ese pedido ya estaba guardado. Volvé a tocar “Buscar opciones”." };
  if (err.code === "23514" || err.code === "22P02" || err.status === 400) return { status: 400, message: "Algún dato del pedido no es válido. Revisalo y probá de nuevo." };
  if (err.code === "PGRST205" || err.code === "42P01") return { status: 503, message: "LISTO no puede guardar pedidos en este momento." };
  return { status: 502, message: "No pudimos guardar tu pedido. Probá de nuevo en un rato." };
}

module.exports = {
  UUID_RE: UUID_RE, LIMITS: LIMITS, DIET_CODES: DIET_CODES,
  validate: validate, validateDiet: validateDiet, save: save, explain: explain
};
