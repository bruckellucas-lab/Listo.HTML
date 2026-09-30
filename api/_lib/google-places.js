/* =========================================================
   LISTO — Google Places API (New) · Text Search
   Corre SOLO en el servidor (Vercel). La clave de Google
   nunca llega al navegador.
   ========================================================= */
"use strict";

var SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

// Pedimos únicamente los campos que vamos a guardar (menos campos = menos costo).
// No pedimos precios, horarios, fotos, reseñas ni nada de disponibilidad o capacidad.
var FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.businessStatus",
  "places.googleMapsUri",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount"
].join(",");

var MAX_RESULTS = 20;

function searchText(apiKey, query, limit, fetchImpl) {
  var doFetch = fetchImpl || fetch;
  var pageSize = Math.max(1, Math.min(MAX_RESULTS, parseInt(limit, 10) || 10));

  return doFetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK
    },
    body: JSON.stringify({
      textQuery: query,
      pageSize: pageSize,
      languageCode: "es",
      regionCode: "AR"
    })
  }).then(function (res) {
    return res.text().then(function (text) {
      var data = {};
      try { data = text ? JSON.parse(text) : {}; } catch (e) { data = {}; }
      if (!res.ok) {
        var err = new Error((data.error && data.error.message) || ("Google respondió " + res.status));
        err.status = res.status;
        err.googleStatus = data.error && data.error.status;
        throw err;
      }
      return Array.isArray(data.places) ? data.places : [];
    });
  });
}

// Barrio según Google (sin inventar: si Google no lo informa, queda vacío).
function zoneFrom(components) {
  if (!Array.isArray(components)) return null;
  var order = ["neighborhood", "sublocality_level_1", "sublocality"];
  for (var i = 0; i < order.length; i++) {
    for (var j = 0; j < components.length; j++) {
      var c = components[j];
      if (c && Array.isArray(c.types) && c.types.indexOf(order[i]) !== -1 && c.longText) return c.longText;
    }
  }
  return null;
}

function numberOrNull(v) {
  return typeof v === "number" && isFinite(v) ? v : null;
}

// Convierte un lugar de Google en una fila de la tabla "providers".
function toProviderRow(place, nowIso) {
  if (!place || !place.id) return null;
  var name = place.displayName && place.displayName.text;
  if (!name) return null;
  var loc = place.location || {};
  return {
    name: name,
    category: (place.primaryTypeDisplayName && place.primaryTypeDisplayName.text) || place.primaryType || null,
    address: place.formattedAddress || null,
    zone: zoneFrom(place.addressComponents),
    latitude: numberOrNull(loc.latitude),
    longitude: numberOrNull(loc.longitude),
    google_place_id: place.id,
    rating: numberOrNull(place.rating),
    review_count: numberOrNull(place.userRatingCount),
    website: place.websiteUri || null,
    maps_url: place.googleMapsUri || null,
    source: "google",
    last_verified_at: nowIso,
    provider_status: "discovered"
  };
}

function toProviderRows(places, nowIso) {
  var seen = {};
  var rows = [];
  var skippedClosed = 0;
  (places || []).forEach(function (place) {
    // Un lugar cerrado definitivamente no sirve como proveedor.
    if (place && place.businessStatus === "CLOSED_PERMANENTLY") { skippedClosed++; return; }
    var row = toProviderRow(place, nowIso);
    if (row && !seen[row.google_place_id]) {
      seen[row.google_place_id] = true;
      rows.push(row);
    }
  });
  return { rows: rows, skippedClosed: skippedClosed };
}

module.exports = {
  FIELD_MASK: FIELD_MASK,
  MAX_RESULTS: MAX_RESULTS,
  searchText: searchText,
  toProviderRow: toProviderRow,
  toProviderRows: toProviderRows,
  zoneFrom: zoneFrom
};
