/* IDs de recuperación: sólo IDs y huellas en sessionStorage; nunca formularios o tokens. */
(function (root) {
  "use strict";
  var memory = {}, key = "listo-recovery-v1";
  async function operation(scope, payload) {
    if (!root.crypto || !root.crypto.subtle || !root.crypto.randomUUID) throw new Error("No pudimos preparar una operación recuperable. Usá un navegador actualizado y recargá la página antes de continuar.");
    var bytes = new TextEncoder().encode(JSON.stringify(payload));
    var digest = await root.crypto.subtle.digest("SHA-256", bytes);
    var hash = Array.from(new Uint8Array(digest)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    var records = memory;
    try { records = Object.assign({}, JSON.parse(root.sessionStorage.getItem(key) || "{}"), memory); } catch (e) { /* memoria si no hay storage */ }
    if (!records || typeof records !== "object" || Array.isArray(records)) records = {};
    var entry = records[scope];
    if (!entry || entry.hash !== hash) entry = { hash: hash, id: root.crypto.randomUUID() };
    records[scope] = entry;
    var scopes = Object.keys(records);
    scopes.slice(0, Math.max(0, scopes.length - 100)).forEach(function (s) { if (s !== scope) delete records[s]; });
    memory = records;
    try { root.sessionStorage.setItem(key, JSON.stringify(records)); } catch (e) { /* conserva en memoria */ }
    return entry.id;
  }
  root.ListoRecovery = { operation: operation };
})(window);
