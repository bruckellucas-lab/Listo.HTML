/* =========================================================
   LISTO — Guardado de proveedores en Supabase (servidor)
   Usa la clave SECRETA de Supabase, que vive sólo en las
   variables de entorno de Vercel (nunca en el navegador).
   - Proveedor nuevo  → se inserta con provider_status = discovered.
   - Proveedor que ya existe (mismo google_place_id) → se actualizan
     sus datos, sin tocar provider_status ni source.
   ========================================================= */
"use strict";

var TABLE = "providers";

// Campos que se actualizan cuando el proveedor ya existía.
var UPDATABLE = ["name", "category", "address", "zone", "latitude", "longitude",
  "rating", "review_count", "website", "maps_url", "last_verified_at"];

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

function saveProviders(cfg, rows, fetchImpl) {
  var doFetch = fetchImpl || fetch;
  var base = normalizeUrl(cfg.url) + "/rest/v1/" + TABLE;
  if (!rows.length) return Promise.resolve({ inserted: 0, updated: 0 });

  var ids = rows.map(function (r) { return r.google_place_id; });

  // 1) ¿Cuáles ya están guardados?
  var findUrl = base + "?select=google_place_id&google_place_id=in." + encodeURIComponent(quoteList(ids));
  return request(doFetch, findUrl, { method: "GET", headers: headersFor(cfg.key) }, "buscar existentes")
    .then(function (existing) {
      var known = {};
      (existing || []).forEach(function (r) { known[r.google_place_id] = true; });
      var fresh = rows.filter(function (r) { return !known[r.google_place_id]; });
      var old = rows.filter(function (r) { return known[r.google_place_id]; });

      // 2) Insertar los nuevos. "ignore-duplicates" evita duplicados aunque dos búsquedas corran a la vez.
      var insertStep = fresh.length
        ? request(doFetch, base + "?on_conflict=google_place_id", {
            method: "POST",
            headers: headersFor(cfg.key, { "Prefer": "resolution=ignore-duplicates,return=minimal" }),
            body: JSON.stringify(fresh)
          }, "insertar nuevos")
        : Promise.resolve();

      return insertStep.then(function () {
        // 3) Actualizar los existentes, sólo con datos que Google sí informó (no borramos lo que ya había).
        return Promise.all(old.map(function (row) {
          var patch = {};
          UPDATABLE.forEach(function (k) { if (row[k] !== null && row[k] !== undefined) patch[k] = row[k]; });
          return request(doFetch, base + "?google_place_id=eq." + encodeURIComponent(row.google_place_id), {
            method: "PATCH",
            headers: headersFor(cfg.key, { "Prefer": "return=minimal" }),
            body: JSON.stringify(patch)
          }, "actualizar existentes");
        }));
      }).then(function () {
        return { inserted: fresh.length, updated: old.length };
      });
    });
}

module.exports = {
  saveProviders: saveProviders,
  normalizeUrl: normalizeUrl,
  headersFor: headersFor,
  request: request,
  UPDATABLE: UPDATABLE
};
