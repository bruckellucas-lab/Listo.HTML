/* CO-2a: sólo lecturas PostgREST. Cursor por creación + UUID; sin OFFSET ni SQL.
   Las propuestas vigentes se resuelven en servidor ANTES de paginar los filtros derivados. */
"use strict";
var crypto = require("node:crypto");
var store = require("./providers-store");
var inquiries = require("./inquiries");
var PAGE_SIZE = 50, SCAN_SIZE = 200;
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
var PRECONFIRMED = ["inquiry_requested", "provider_contacted", "quoted"];
var PROPOSAL = "plan_proposals!plan_proposals_plan_inquiry_id_fkey(status)";
var FIELDS = "id,created_at,status,notification_status,event_date,approximate_time,contact_name";
var MISSING = ["PGRST200", "PGRST201", "PGRST204", "42703", "42P01", "PGRST205"];

function invalid() { var e = new Error("Consulta no válida. Actualizá la bandeja."); e.httpStatus = 400; return e; }
function timestamp(s) { return typeof s === "string" && TIME.test(s) && Number.isFinite(Date.parse(s)); }
function signature(s) { return crypto.createHmac("sha256", "listo-inbox:" + process.env.ADMIN_PASSWORD).update(s).digest("base64url"); }
function encode(value) { var s = Buffer.from(JSON.stringify(value)).toString("base64url"); return s + "." + signature(s); }
function searchOf(req) {
  var raw = req.headers["x-listo-search"] || "";
  if (typeof raw !== "string" || raw.length > 1500) throw invalid();
  var q;
  try { q = decodeURIComponent(raw).trim(); } catch (e) { throw invalid(); }
  if (q.length > 120 || /[\x00-\x1f\x7f]/.test(q)) throw invalid();
  return q;
}
function parse(req, query) {
  if (Object.keys(query).some(function (key) { return ["id", "status", "cursor"].indexOf(key) === -1 || typeof query[key] !== "string"; })) throw invalid();
  var search = searchOf(req);
  if (Object.hasOwn(query, "id")) {
    if (!UUID.test(query.id) || query.status || query.cursor || search) throw invalid();
    return { id: query.id };
  }
  var status = query.status || "open";
  if (["all", "open", "proposal_accepted"].concat(inquiries.STATUSES).indexOf(status) === -1) throw invalid();
  var hash = crypto.createHash("sha256").update(search).digest("hex");
  var state = { status: status, search_hash: hash, as_of: new Date().toISOString(), after: null };
  if (query.cursor) {
    if (query.cursor.length > 1600) throw invalid();
    var parts = query.cursor.split(".");
    if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || parts[1] !== signature(parts[0])) throw invalid();
    try { state = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); } catch (e) { throw invalid(); }
    if (!state || state.status !== status || state.search_hash !== hash || !timestamp(state.as_of) ||
      !state.after || !timestamp(state.after.created_at) || !UUID.test(state.after.id)) throw invalid();
  }
  return { status: status, search: search, state: state };
}
// Regex literals: neither PostgREST grammar nor user-supplied regex can escape the quoted value.
function literal(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function namePattern(s) {
  return Array.from(s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")).map(function (c) {
    var accents = { a: "[aáàâäãå]", e: "[eéèêë]", i: "[iíìîï]", o: "[oóòôöõ]", u: "[uúùûü]", n: "[nñ]", c: "[cç]" };
    return accents[c.toLowerCase()] || literal(c);
  }).join("");
}
function quoted(s) { return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'; }
function filters(options) {
  var p = new URLSearchParams();
  p.set("created_at", "lte." + options.state.as_of);
  if (options.status === "open") p.set("status", "in.(" + inquiries.OPEN_STATUSES.join(",") + ")");
  else if (options.status === "proposal_accepted") p.set("status", "in.(" + PRECONFIRMED.join(",") + ")");
  else if (options.status !== "all") p.set("status", "eq." + options.status);
  if (options.search) {
    var pattern = namePattern(options.search), digits = options.search.replace(/\D/g, "");
    var matches = ["contact_name.imatch." + quoted(pattern), "contact_email.imatch." + quoted(pattern)];
    if (digits.length >= 3) matches.push("contact_phone.imatch." + quoted(digits.split("").join("[^0-9]*")));
    if (UUID.test(options.search)) matches.push("id.eq." + options.search);
    p.append("or", "(" + matches.join(",") + ")");
  }
  return p;
}
function seek(p, after) {
  if (!after) return;
  var cursor = "(created_at.lt." + after.created_at + ",and(created_at.eq." + after.created_at + ",id.lt." + after.id + "))";
  var search = p.get("or");
  if (search) { p.delete("or"); p.set("and", "(or" + search + ",or" + cursor + ")"); }
  else p.set("or", cursor);
}
function proposalParams(p) {
  p.set("plan_proposals.status", "neq.proposal_replaced");
  p.set("plan_proposals.order", "created_at.desc,id.desc");
  p.set("plan_proposals.limit", "1");
}
async function request(cfg, table, p, count) {
  var total = null;
  var rows = await store.request(async function (url, opts) {
    var res = await fetch(url, opts);
    if (res.ok && count) {
      var range = res.headers && res.headers.get("content-range");
      var m = /\/(\d+)$/.exec(range || "");
      if (!m || !Number.isSafeInteger(Number(m[1]))) throw new Error("Conteo no disponible");
      total = Number(m[1]);
    }
    return res;
  }, store.normalizeUrl(cfg.url) + "/rest/v1/" + table + "?" + p.toString(), {
    method: count === "head" ? "HEAD" : "GET", headers: store.headersFor(cfg.key, count ? { Prefer: "count=exact" } : {}),
    signal: AbortSignal.timeout(10000)
  }, "bandeja admin");
  if (count !== "head" && !Array.isArray(rows)) throw new Error("Lista no disponible");
  return { rows: rows, total: total };
}
function viewStatus(row) {
  var proposal = row.plan_proposals && row.plan_proposals[0];
  return PRECONFIRMED.indexOf(row.status) !== -1 && proposal && proposal.status === "proposal_accepted" ? "proposal_accepted" : row.status;
}
function summary(row) {
  return { id: row.id, created_at: row.created_at, status: row.status, view_status: viewStatus(row),
    notification_status: row.notification_status || null, event_date: row.event_date, approximate_time: row.approximate_time,
    contact_label: String(row.contact_name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map(function (s) { return Array.from(s)[0]; }).join(".").toUpperCase() || "—" };
}
function lastOf(rows) { var r = rows[rows.length - 1]; return { created_at: r.created_at, id: r.id }; }
// Compare timestamps without discarding Postgres microseconds.
function micros(s) {
  var fraction = /\.(\d+)/.exec(s);
  return BigInt(Date.parse(s.replace(/\.\d+/, ""))) * 1000n + BigInt(((fraction && fraction[1] || "") + "000000").slice(0, 6));
}
function older(row, after) { return !after || micros(row.created_at) < micros(after.created_at) || micros(row.created_at) === micros(after.created_at) && row.id < after.id; }
async function list(cfg, options) {
  var derived = PRECONFIRMED.indexOf(options.status) !== -1 || options.status === "proposal_accepted";
  var ready = true, rows, total, more;
  if (derived) {
    // A latest-related-row predicate cannot be pushed into a parent PostgREST filter without SQL.
    // Scan only IDs/state/latest proposal, never contacts or commercial details; no hard row cap.
    var after = null, selected = [], n = 0;
    do {
      var scan = filters(options);
      scan.set("select", "id,created_at,status," + PROPOSAL);
      scan.set("order", "created_at.desc,id.desc"); scan.set("limit", String(SCAN_SIZE));
      proposalParams(scan); seek(scan, after);
      var batch;
      try { batch = (await request(cfg, "plan_inquiries", scan)).rows; }
      catch (e) {
        if (MISSING.indexOf(e.code) === -1) throw e;
        if (options.status === "proposal_accepted") { var unavailable = new Error("No se puede consultar propuestas. Actualizá o contactá al equipo técnico."); unavailable.httpStatus = 503; throw unavailable; }
        ready = false;
        scan.set("select", "id,created_at,status");
        ["status", "order", "limit"].forEach(function (s) { scan.delete("plan_proposals." + s); });
        batch = (await request(cfg, "plan_inquiries", scan)).rows;
      }
      batch.forEach(function (r) {
        if (viewStatus(r) !== options.status) return;
        n++;
        if (selected.length <= PAGE_SIZE && older(r, options.state.after)) selected.push(r);
      });
      after = batch.length ? lastOf(batch) : null;
    } while (after);
    total = n;
    rows = selected;
    if (rows.length) {
      var display = new URLSearchParams({ select: FIELDS });
      var details = [], displayAfter = null;
      display.set("order", "id.asc"); display.set("limit", String(PAGE_SIZE));
      do {
        if (displayAfter) display.set("id", "gt." + displayAfter);
        // Keep membership in an AND clause when adding a seek on id.
        display.set("and", "(id.in.(" + rows.slice(0, PAGE_SIZE).map(function (r) { return r.id; }).join(",") + "))");
        if (!displayAfter) display.delete("id");
        var found = (await request(cfg, "plan_inquiries", display)).rows;
        details = details.concat(found); displayAfter = found.length ? found[found.length - 1].id : null;
      } while (displayAfter);
      // Preserve the ordering and classification from the scan, not a mutable display response.
      rows = rows.map(function (r) { var d = details.find(function (x) { return x.id === r.id; }); return Object.assign({}, d || {}, r); });
    }
  } else {
    var p = filters(options);
    p.set("select", FIELDS + "," + PROPOSAL); p.set("order", "created_at.desc,id.desc"); p.set("limit", String(PAGE_SIZE + 1));
    proposalParams(p); seek(p, options.state.after);
    var page;
    try { page = await request(cfg, "plan_inquiries", p, true); }
    catch (e) {
      if (MISSING.indexOf(e.code) === -1) throw e;
      ready = false; p.set("select", FIELDS);
      ["status", "order", "limit"].forEach(function (s) { p.delete("plan_proposals." + s); });
      page = await request(cfg, "plan_inquiries", p, true);
    }
    rows = page.rows;
    more = page.total > Math.min(rows.length, PAGE_SIZE);
    var counter = filters(options); counter.set("select", "id");
    total = (await request(cfg, "plan_inquiries", counter, "head")).total;
  }
  if (derived) more = rows.length > PAGE_SIZE;
  rows = rows.slice(0, PAGE_SIZE);
  return { ok: true, items: rows.map(summary), count: rows.length, total: total, has_more: more,
    next_cursor: more ? encode(Object.assign({}, options.state, { after: lastOf(rows) })) : null,
    as_of: options.state.as_of, counted_at: new Date().toISOString(), proposals_ready: ready, statuses: inquiries.STATUSES };
}
// Currency metrics also need pagination: the PostgREST row cap is not a global total.
async function metrics(cfg) {
  var after = null, rows = [];
  do {
    var p = new URLSearchParams({ select: "id,booking_status,currency,final_total_amount,commission_amount,commission_status", booking_status: "eq.confirmed", order: "id.asc", limit: String(SCAN_SIZE) });
    if (after) p.set("id", "gt." + after);
    var batch = (await request(cfg, "plan_bookings", p)).rows;
    rows = rows.concat(batch);
    after = batch.length ? batch[batch.length - 1].id : null;
  } while (after);
  return rows;
}
module.exports = { parse: parse, list: list, metrics: metrics };
