/* =========================================================
   LISTO — Guardado de proveedores en Supabase (servidor)
   Usa la clave SECRETA de Supabase, que vive sólo en las
   variables de entorno de Vercel (nunca en el navegador).

   G1B (políticas de Google Maps Platform): de cada lugar se guarda SÓLO
   la fila mínima que necesitan los vínculos internos de LISTO
   (plan_selections, plan_bookings, atributos alimentarios):
     google_place_id, source, provider_status, last_verified_at.
   Nombre, dirección, rating, reseñas, web, link de Maps, zona, categoría y
   coordenadas NO se guardan ni se actualizan: se piden a Google en el
   momento de mostrarlos (ver place-details.js).
   - Lugar nuevo       → fila mínima con provider_status = discovered.
   - Lugar que ya está → sólo se actualiza last_verified_at (fecha interna de
     "visto en una búsqueda"); no se toca nada más.
   ========================================================= */
"use strict";

var TABLE = "providers";

// Los ÚNICOS campos que LISTO escribe en providers.
var STORED_FIELDS = ["google_place_id", "source", "provider_status", "last_verified_at"];
// Campos con contenido de Google que NUNCA se escriben (lo controla un test guardián).
var GOOGLE_FIELDS = ["name", "category", "address", "zone", "latitude", "longitude",
  "rating", "review_count", "website", "maps_url"];
// Si alguna de estas columnas todavía fuera obligatoria (NOT NULL) en Supabase, se completa con
// texto vacío (nunca con un dato de Google ni inventado) hasta la limpieza de G1B-2.
var TEXT_PLACEHOLDER_OK = ["name", "category", "address", "zone", "website", "maps_url"];

function normalizeUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
}

function headersFor(key, extra) {
  var h = { "apikey": key, "Content-Type": "application/json" };
  // Claves viejas (JWT, empiezan con eyJ) también van como Authorization.
  if (/^eyJ/.test(key)) h["Authorization"] = "Bearer " + key;
  Object.keys(extra || {}).forEach(function (k) { h[k] = extra[k]; });
  return h;
}

function storeError(res, text, step) {
  var info = {};
  try { info = JSON.parse(text) || {}; } catch (e) { info = { message: text }; }
  var err = new Error(info.message || ("Supabase respondió " + res.status));
  err.status = res.status;
  err.code = info.code || "";
  err.step = step;
  return err;
}

function request(fetchImpl, url, opts, step) {
  return fetchImpl(url, opts).then(function (res) {
    return res.text().then(function (text) {
      if (!res.ok) throw storeError(res, text, step);
      if (!text) return null;
      try { return JSON.parse(text); } catch (e) { return null; }
    });
  });
}

function quoteList(ids) {
  return "(" + ids.map(function (id) { return '"' + String(id).replace(/"/g, "") + '"'; }).join(",") + ")";
}

// Fila mínima a partir de cualquier fila (descarta todo lo que no sea propio de LISTO).
function minimalRow(row, nowIso) {
  return {
    google_place_id: row.google_place_id,
    source: "google",
    provider_status: "discovered",
    last_verified_at: row.last_verified_at || nowIso || new Date().toISOString()
  };
}

function notNullColumn(err) {
  if (!err || err.code !== "23502") return "";
  var m = /column "([a-z_]+)"/.exec(String(err.message || ""));
  return m ? m[1] : "";
}

// Inserta filas mínimas. Si Supabase dice que una columna de texto de Google es obligatoria,
// reintenta con texto vacío en esa columna (sin datos de Google).
function insertMinimal(doFetch, base, key, rows, tries) {
  return request(doFetch, base + "?on_conflict=google_place_id", {
    method: "POST",
    headers: headersFor(key, { "Prefer": "resolution=ignore-duplicates,return=minimal" }),
    body: JSON.stringify(rows)
  }, "insertar nuevos").catch(function (err) {
    var col = notNullColumn(err);
    if (!col || TEXT_PLACEHOLDER_OK.indexOf(col) === -1 || (tries || 0) >= TEXT_PLACEHOLDER_OK.length) throw err;
    console.error("[providers] la columna " + col + " es obligatoria en Supabase: se completa vacía hasta G1B-2");
    return insertMinimal(doFetch, base, key, rows.map(function (r) { var o = Object.assign({}, r); o[col] = ""; return o; }), (tries || 0) + 1);
  });
}

function saveProviders(cfg, rows, fetchImpl) {
  var doFetch = fetchImpl || fetch;
  var base = normalizeUrl(cfg.url) + "/rest/v1/" + TABLE;
  var nowIso = new Date().toISOString();
  var seen = {};
  var minimal = (rows || []).filter(function (r) {
    if (!r || !r.google_place_id || seen[r.google_place_id]) return false;
    seen[r.google_place_id] = true;
    return true;
  }).map(function (r) { return minimalRow(r, nowIso); });
  if (!minimal.length) return Promise.resolve({ inserted: 0, updated: 0 });

  var ids = minimal.map(function (r) { return r.google_place_id; });

  // 1) ¿Cuáles ya están guardados?
  var findUrl = base + "?select=google_place_id&google_place_id=in." + encodeURIComponent(quoteList(ids));
  return request(doFetch, findUrl, { method: "GET", headers: headersFor(cfg.key) }, "buscar existentes")
    .then(function (existing) {
      var known = {};
      (existing || []).forEach(function (r) { known[r.google_place_id] = true; });
      var fresh = minimal.filter(function (r) { return !known[r.google_place_id]; });
      var old = minimal.filter(function (r) { return known[r.google_place_id]; });

      // 2) Insertar los nuevos (fila mínima). "ignore-duplicates" evita duplicados aunque dos búsquedas corran a la vez.
      var insertStep = fresh.length ? insertMinimal(doFetch, base, cfg.key, fresh) : Promise.resolve();

      return insertStep.then(function () {
        // 3) Los que ya estaban: sólo la fecha interna, en UN pedido. Nunca datos de Google.
        if (!old.length) return null;
        return request(doFetch, base + "?google_place_id=in." + encodeURIComponent(quoteList(old.map(function (r) { return r.google_place_id; }))), {
          method: "PATCH",
          headers: headersFor(cfg.key, { "Prefer": "return=minimal" }),
          body: JSON.stringify({ last_verified_at: nowIso })
        }, "actualizar existentes");
      }).then(function () {
        return { inserted: fresh.length, updated: old.length };
      });
    });
}

// Asegura que exista la fila mínima de UN lugar (para los vínculos de plan_selections).
function ensureProvider(cfg, placeId, fetchImpl) {
  var base = normalizeUrl(cfg.url) + "/rest/v1/" + TABLE;
  return insertMinimal(fetchImpl || fetch, base, cfg.key, [minimalRow({ google_place_id: placeId })]);
}

module.exports = {
  saveProviders: saveProviders,
  ensureProvider: ensureProvider,
  minimalRow: minimalRow,
  normalizeUrl: normalizeUrl,
  headersFor: headersFor,
  request: request,
  STORED_FIELDS: STORED_FIELDS,
  GOOGLE_FIELDS: GOOGLE_FIELDS
};
