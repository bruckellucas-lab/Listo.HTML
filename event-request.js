/* =========================================================
   LISTO — Guardado de pedidos
   Envía cada pedido a /api/event-request (servidor de Vercel).
   El navegador ya no habla con Supabase ni tiene ninguna clave:
   el servidor valida el pedido y lo guarda en event_requests.
   ========================================================= */
(function () {
  "use strict";

  var ENDPOINT = "/api/event-request";
  var TIMEOUT_MS = 12000;

  var MESSAGES = {
    "offline": "No pudimos guardar tu pedido: parece que no hay conexión a internet. Probá de nuevo en un rato.",
    "timeout": "No pudimos guardar tu pedido: el servidor tardó demasiado en responder. Probá de nuevo.",
    "network": "No pudimos guardar tu pedido. Probá de nuevo en un rato.",
    "server": "No pudimos guardar tu pedido. Probá de nuevo en un rato."
  };

  function saveEventRequest(row) {
    var controller = "AbortController" in window ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;

    return fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(row),
      credentials: "same-origin",
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      clearTimeout(timer);
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.ok && data && data.ok) return { ok: true };
        // El servidor ya manda un mensaje entendible (sin datos técnicos).
        var reason = res.status === 429 ? "rate-limit" : res.status >= 500 ? "server" : "invalid";
        if (window.console) console.warn("[LISTO] El pedido no se guardó (" + res.status + ").");
        return { ok: false, reason: reason, message: (data && data.error) || MESSAGES.server };
      });
    }, function (err) {
      clearTimeout(timer);
      var reason = err && err.name === "AbortError" ? "timeout" : navigator.onLine === false ? "offline" : "network";
      return { ok: false, reason: reason, message: MESSAGES[reason] };
    });
  }

  window.ListoDB = {
    saveEventRequest: saveEventRequest,
    isConfigured: function () { return true; }
  };
})();
