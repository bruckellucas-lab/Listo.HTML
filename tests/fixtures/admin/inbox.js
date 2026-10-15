/* Synthetic PostgREST transport: interprets filters, projection, ordering, counts and row caps.
   No SQL or external requests. Does not implement application/view filtering for the handler. */
"use strict";
function id(n) { return "00000000-0000-4000-8000-" + String(n).padStart(12, "0"); }
function inquiry(n, status) {
  return { id: id(n), created_at: "2026-10-01T12:00:00." + String(Math.floor(n / 5)).padStart(6, "0") + "Z",
    updated_at: "2026-10-02T12:00:00Z", status: status || "inquiry_requested",
    contact_name: "Persona Sintética " + n, contact_phone: "+54 (11) 1234-5678", contact_email: "persona" + n + "@example.invalid",
    event_date: "2026-11-01", approximate_time: "20:00", notes: "COMENTARIO-PRIVADO", notification_status: "sent",
    plan_selection_id: id(10000 + n), provider_contacted_at: null, provider_contact_channel: null,
    plan_selections: { id: id(10000 + n), provider_google_place_id: "ChIJsynthetic0001", status: "interested", event_request_id: id(20000 + n),
      event_requests: { original_prompt: "PROMPT-PRIVADO", dietary_requirements: [{ code: "RESTRICCION-PRIVADA" }], event_type: "Cena" } },
    provider_quotes: [{ id: id(30000 + n), received_at: "2026-10-02", internal_notes: "NOTA-PRIVADA" }],
    plan_proposals: [], plan_bookings: [] };
}
function split(s) {
  var out = [], start = 0, depth = 0, quote = false, escape = false;
  for (var i = 0; i < s.length; i++) {
    var c = s[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { quote = !quote; continue; }
    if (quote) continue;
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start)); return out;
}
function unquote(s) { return s[0] === '"' ? s.slice(1, -1).replace(/\\(.)/g, "$1") : s; }
function predicate(row, expr) {
  if (expr.startsWith("and(") || expr.startsWith("or(")) {
    var or = expr.startsWith("or("), values = split(expr.slice(or ? 3 : 4, -1));
    return or ? values.some(function (v) { return predicate(row, v); }) : values.every(function (v) { return predicate(row, v); });
  }
  var m = /^([a-z_]+)\.(eq|neq|lt|lte|gt|in|imatch)\.(.*)$/.exec(expr);
  if (!m) throw new Error("Unexpected fixture filter: " + expr);
  var value = row[m[1]], expected = unquote(m[3]);
  if (m[2] === "in") return split(expected.slice(1, -1)).includes(value);
  if (m[2] === "imatch") return value != null && new RegExp(expected, "i").test(value);
  if (m[1] === "created_at") { value = Date.parse(value) * 1000 + Number((/\.(\d{6})/.exec(value) || [0, 0])[1]) % 1000; expected = Date.parse(expected) * 1000 + Number((/\.(\d{6})/.exec(expected) || [0, 0])[1]) % 1000; }
  return m[2] === "eq" ? value === expected : m[2] === "neq" ? value !== expected : m[2] === "lt" ? value < expected : m[2] === "lte" ? value <= expected : value > expected;
}
function transport(rows, opts) {
  opts = opts || {};
  var calls = [];
  async function fetch(url, req) {
    var u = new URL(url), q = u.searchParams;
    calls.push({ url: String(url), method: req.method, headers: req.headers });
    if (!u.pathname.startsWith("/rest/v1/")) throw new Error("External request blocked by fixture");
    if (req.method !== "GET" && req.method !== "HEAD") throw new Error("Write blocked by fixture");
    var source = u.pathname.endsWith("/plan_inquiries") ? rows : u.pathname.endsWith("/plan_bookings") ? opts.bookings || [] : null;
    if (!source) throw new Error("Unexpected table");
    var select = q.get("select") || "*";
    if (opts.missingProposals && select.includes("plan_proposals")) return new Response(JSON.stringify({ code: "PGRST200" }), { status: 400 });
    var found = source.filter(function (row) {
      return Array.from(q).every(function (entry) {
        var key = entry[0], value = entry[1];
        if (["select", "order", "limit"].includes(key) || key.includes(".")) return true;
        return predicate(row, key === "or" || key === "and" ? key + value : key + "." + value);
      });
    });
    var order = (q.get("order") || "id.asc").split(",");
    found.sort(function (a, b) {
      for (var field of order) {
        var parts = field.split("."), k = parts[0], cmp = a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0;
        if (cmp) return parts[1] === "desc" ? -cmp : cmp;
      }
      return 0;
    });
    var total = found.length;
    found = found.slice(0, Math.min(Number(q.get("limit") || 1000), opts.cap || 1000));
    var projected = found.map(function (row) {
      var out = {};
      split(select).forEach(function (field) {
        var relation = /^([a-z_]+)(?:![a-z_]+)?\((.*)\)$/.exec(field);
        if (!relation) { out[field] = row[field]; return; }
        var key = relation[1];
        if (key !== "plan_proposals") { out[key] = row[key]; return; }
        var children = (row[key] || []).filter(function (p) { return !q.has("plan_proposals.status") || predicate(p, "status." + q.get("plan_proposals.status")); });
        children.sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)) || b.id.localeCompare(a.id); });
        if (q.has("plan_proposals.limit")) children = children.slice(0, Number(q.get("plan_proposals.limit")));
        out[key] = children.map(function (p) { var c = {}; split(relation[2]).forEach(function (k) { c[k] = p[k]; }); return c; });
      });
      return out;
    });
    var headers = {};
    if (!opts.missingCount) headers["Content-Range"] = (found.length ? "0-" + (found.length - 1) : "*") + "/" + total;
    return new Response(req.method === "HEAD" ? null : JSON.stringify(projected), { status: 200, headers: headers });
  }
  fetch.calls = calls; return fetch;
}
module.exports = { id: id, inquiry: inquiry, transport: transport };
