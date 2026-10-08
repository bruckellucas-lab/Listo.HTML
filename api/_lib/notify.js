/* =========================================================
   LISTO — Aviso interno por email (Resend) de cada "Quiero avanzar"
   - Se ejecuta DESPUÉS de guardar la solicitud: si falla, la
     solicitud no se pierde y el usuario igual ve la confirmación.
   - Marca plan_inquiries.notification_status = 'sent' o 'failed'.
   - El detalle del error queda sólo en los registros de Vercel.
   - No envía nada por WhatsApp: sólo incluye un link para abrirlo.
   - El email trae SÓLO lo necesario para reaccionar (contacto, WhatsApp,
     plan, fecha, horario, personas, zona y lugar). No replica el email del
     usuario, sus comentarios, el pedido original, restricciones
     alimentarias ni IDs internos: todo eso queda en Supabase / panel.
   - G1B: en el email de "Quiero avanzar", nombre, dirección y link de Maps
     del lugar se piden a Google JUSTO al enviar (place-details.js) y no se
     guardan. Si Google falla, sale igual, sin nombre inventado, con un aviso
     y el link a Maps.
   - El email de respuesta a una propuesta (aceptar / pedir otra opción) NO
     llama a Google: lleva "Lugar elegido" y el link a Maps armado con el
     google_place_id (el nombre se ve en /admin).
   ========================================================= */
"use strict";

var store = require("./providers-store");
var placeDetails = require("./place-details");

var RESEND_URL = "https://api.resend.com/emails";
var NOTIFY_TO = "listoeventoss@gmail.com";
var DEFAULT_FROM = "LISTO <onboarding@resend.dev>";   // remitente de prueba de Resend (sin dominio propio)
var TIMEOUT_MS = 8000;

function api(cfg, path) { return store.normalizeUrl(cfg.url) + "/rest/v1/" + path; }
function first(rows) { return Array.isArray(rows) && rows.length ? rows[0] : null; }

// Atribución: nombre, dirección y link del lugar vienen de Google Maps.
var GMAPS_HTML = '<p style="margin:14px 0 0;font-size:12px;color:#5A5046">Datos del lugar: <span style="font-size:12px;font-weight:bold;letter-spacing:normal;text-transform:none">Google Maps</span></p>';
var GMAPS_TEXT = "Datos del lugar: Google Maps";

function esc(v) {
  return String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

// Teléfono del USUARIO → número para wa.me (formato internacional, sin "+").
// Argentina: agrega 54 + 9 (celular), quita el 0 de larga distancia y el 15.
function whatsappNumber(phone) {
  var raw = String(phone || "").trim();
  var d = raw.replace(/\D/g, "");
  if (!d) return "";
  if (d.indexOf("00") === 0) d = d.slice(2);
  if (d.indexOf("54") === 0) {
    var rest = d.slice(2);
    if (rest.charAt(0) === "9") rest = rest.slice(1);
    return "549" + stripFifteen(rest.replace(/^0/, ""));
  }
  if (raw.charAt(0) === "+") return d;                          // otro país: se respeta tal cual
  return "549" + stripFifteen(d.replace(/^0/, ""));
}

function stripFifteen(n) {
  // Área (2 a 4 dígitos) + "15" + número local = 12 dígitos → se quita el 15.
  if (n.length === 12) {
    for (var a = 2; a <= 4; a++) if (n.substr(a, 2) === "15") return n.slice(0, a) + n.slice(a + 2);
  }
  return n;
}

function dateAR(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? m[3] + "/" + m[2] + "/" + m[1] : String(iso || "");
}

function nowAR() {
  try {
    return new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" }) + " (hora de Argentina)";
  } catch (e) { return new Date().toISOString(); }
}

// Arma el email con lo mínimo para reaccionar (sólo para el equipo de LISTO).
// El resto del detalle (comentarios, pedido original, restricciones, email) se ve en /admin.
function buildEmail(ctx) {
  var r = ctx.request || {}, p = ctx.provider || {}, c = ctx.contact || {};
  var wa = whatsappNumber(c.contact_phone);
  var waLink = wa ? "https://wa.me/" + wa : "";
  var rows = [
    ["Contacto", c.contact_name],
    ["WhatsApp", c.contact_phone],
    ["Plan", r.event_type],
    ["Fecha", dateAR(c.event_date)],
    ["Horario", c.approximate_time],
    ["Personas", r.guests],
    ["Zona", r.zone],
    ["Proveedor elegido", p.name || (p.unavailable ? placeDetails.UNAVAILABLE : null)],
    ["Google Maps", p.maps_url],
    ["Recibido", ctx.receivedAt]
  ].filter(function (row) { return row[1] !== null && row[1] !== undefined && row[1] !== ""; });

  var subject = (ctx.updated ? "Solicitud actualizada · " : "Nueva solicitud · ") +
    (r.event_type || "Plan") + (r.guests ? " para " + r.guests : "") + " · " + (p.name || "LISTO");

  var html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#141210">' +
    '<p style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#5E4431;margin:0 0 8px">LISTO · Quiero avanzar</p>' +
    '<h1 style="font-size:24px;margin:0 0 6px">' + esc(ctx.updated ? "Solicitud actualizada" : "Nueva solicitud") + '</h1>' +
    '<p style="margin:0 0 18px;color:#5A5046">Todavía no hay reserva confirmada: hay que consultar disponibilidad y condiciones con el lugar. El detalle completo está en /admin.</p>' +
    (waLink ? '<p style="margin:0 0 22px"><a href="' + esc(waLink) + '" style="display:inline-block;background:#141210;color:#EFE8DC;text-decoration:none;padding:14px 22px;font-weight:bold;letter-spacing:2px;font-size:13px">ABRIR WHATSAPP</a></p>' : '') +
    '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px">' +
    rows.map(function (row) {
      var val = esc(row[1]);
      if (row[0] === "Google Maps" && /^https:\/\//.test(row[1])) val = '<a href="' + esc(row[1]) + '">Abrir en Google Maps</a>';
      return '<tr><td style="padding:8px 12px 8px 0;border-bottom:1px solid #E2D9CB;color:#8C857A;white-space:nowrap;vertical-align:top">' + esc(row[0]) +
        '</td><td style="padding:8px 0;border-bottom:1px solid #E2D9CB;vertical-align:top">' + val + '</td></tr>';
    }).join("") +
    '</table>' + GMAPS_HTML + '</div>';

  var text = (ctx.updated ? "Solicitud actualizada" : "Nueva solicitud") + " — LISTO\n" +
    "Todavía no hay reserva confirmada. El detalle completo está en /admin.\n\n" +
    rows.map(function (row) { return row[0] + ": " + row[1]; }).join("\n") +
    (waLink ? "\n\nABRIR WHATSAPP: " + waLink : "") + "\n\n" + GMAPS_TEXT;

  return { subject: subject, html: html, text: text, waLink: waLink };
}

// Busca el contexto para el email: el pedido en Supabase y el lugar en Google (en el momento, sin guardar).
function loadContext(cfg, eventRequestId, placeId, fetchImpl) {
  var doFetch = fetchImpl || fetch;
  var get = function (path, step) {
    return store.request(doFetch, api(cfg, path), { method: "GET", headers: store.headersFor(cfg.key) }, step).then(first);
  };
  return Promise.all([
    get("event_requests?select=event_type,guests,zone&id=eq." + encodeURIComponent(eventRequestId), "leer pedido"),
    livePlace(placeId, fetchImpl)
  ]).then(function (res) { return { request: res[0] || {}, provider: res[1] }; });
}

// Lugar en tiempo real para un email. Nunca falla: si Google no responde, aviso + link a Maps.
function livePlace(placeId, fetchImpl) {
  return placeDetails.fetchPlace(placeId, "email", fetchImpl ? { fetch: fetchImpl } : undefined).then(function (live) {
    return { name: live.name, address: live.address, maps_url: live.maps_url, unavailable: !live.ok };
  });
}

function sendEmail(apiKey, email, fetchImpl) {
  var doFetch = fetchImpl || fetch;
  var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  var timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;
  return doFetch(RESEND_URL, {
    method: "POST",
    headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.NOTIFY_FROM || DEFAULT_FROM,
      to: [NOTIFY_TO],
      subject: email.subject,
      html: email.html,
      text: email.text
    }),
    signal: controller ? controller.signal : undefined
  }).then(function (res) {
    clearTimeout(timer);
    if (res.ok) return true;
    return res.text().then(function (t) {
      var err = new Error("Resend " + res.status + ": " + String(t).slice(0, 300));
      err.status = res.status;
      throw err;
    });
  }, function (err) { clearTimeout(timer); throw err; });
}

function markNotification(cfg, selectionId, sent, fetchImpl) {
  var doFetch = fetchImpl || fetch;
  // Misma regla de "solicitud abierta" que inquiries.js (Nueva, Contactando, Cotizado, Confirmado).
  var open = "status=in.(inquiry_requested,provider_contacted,quoted,confirmed)";
  return store.request(doFetch, api(cfg, "plan_inquiries?" + open + "&plan_selection_id=eq." + encodeURIComponent(selectionId)), {
    method: "PATCH",
    headers: store.headersFor(cfg.key, { "Prefer": "return=minimal" }),
    body: JSON.stringify(sent
      ? { notification_status: "sent", notified_at: new Date().toISOString() }
      : { notification_status: "failed", notified_at: null })
  }, "marcar aviso");
}

// Nunca lanza errores: lo que pase acá no afecta la respuesta al usuario.
function notifyInquiry(cfg, info, fetchImpl) {
  var apiKey = String(process.env.RESEND_API_KEY || "").trim();
  var sent = false;
  var work = !apiKey
    ? Promise.reject(new Error("Falta RESEND_API_KEY en Vercel"))
    : loadContext(cfg, info.eventRequestId, info.placeId, fetchImpl).catch(function (err) {
        console.error("[notify] no se pudo leer el contexto:", err.step || "", err.status || "", err.code || "");
        return livePlace(info.placeId, fetchImpl).then(function (provider) { return { request: {}, provider: provider }; });   // igual avisamos con lo que hay
      }).then(function (ctx) {
        return sendEmail(apiKey, buildEmail({
          request: ctx.request, provider: ctx.provider, contact: info.contact,
          updated: info.updated, receivedAt: nowAR()
        }), fetchImpl);
      });

  return work.then(function () { sent = true; }, function (err) {
    // El detalle sólo va a los registros de Vercel (no a Supabase).
    console.error("[notify] el email no se envió:", err && err.name === "AbortError" ? "tiempo de espera agotado" : (err && err.message));
  }).then(function () {
    return markNotification(cfg, info.selectionId, sent, fetchImpl).catch(function (err) {
      console.error("[notify] no se pudo marcar notification_status:", err.step || "", err.status || "", err.code || "");
    });
  }).then(function () { return sent; });
}

/* ---------- Aviso cuando el usuario responde una propuesta ---------- */

function amountText(n, cur) {
  if (n === null || n === undefined || n === "") return "";
  return (cur === "USD" ? "US$ " : "$ ") + Number(n).toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

// Arma el email de "Propuesta aceptada" / "Pidió otra opción" (sólo para el equipo de LISTO).
function buildProposalEmail(ctx) {
  var c = ctx.contact || {}, q = ctx.quote || {}, r = ctx.request || {}, p = ctx.provider || {};
  var accepted = ctx.action === "accept";
  var providerName = p.name || "Lugar elegido";
  var wa = whatsappNumber(c.contact_phone);
  var waLink = wa ? "https://wa.me/" + wa : "";
  var price = [q.total_price !== null && q.total_price !== undefined ? amountText(q.total_price, q.currency) + " total" : "",
    q.price_per_person !== null && q.price_per_person !== undefined ? amountText(q.price_per_person, q.currency) + " por persona" : ""]
    .filter(Boolean).join(" · ");
  var rows = [
    ["Respuesta", accepted ? "ACEPTÓ la propuesta" : "Pidió otra opción"],
    ["Comentario del usuario", ctx.comment],
    ["Contacto", c.contact_name],
    ["WhatsApp", c.contact_phone],
    ["Proveedor", p.name || (p.unavailable ? placeDetails.UNAVAILABLE : providerName)],
    ["Dirección", p.address],
    ["Google Maps", p.maps_url],
    ["Plan", r.event_type],
    ["Fecha", dateAR(c.event_date)],
    ["Horario", c.approximate_time],
    ["Personas", r.guests],
    ["Zona", r.zone],
    ["Cotización", price],
    ["Válida hasta", q.valid_until ? dateAR(q.valid_until) : ""],
    ["Respondió", nowAR()]
  ].filter(function (row) { return row[1] !== null && row[1] !== undefined && row[1] !== ""; });

  var subject = (accepted ? "Propuesta aceptada · " : "Pidió otra opción · ") + providerName;
  var lead = accepted
    ? "El usuario aceptó la propuesta. Falta confirmar la reserva con el lugar (todavía NO está confirmada)."
    : "El usuario pidió otra opción" + (ctx.comment ? ". Su comentario está abajo." : " (no dejó comentario).");
  var admin = ctx.adminUrl ? '<p style="margin:22px 0 0"><a href="' + esc(ctx.adminUrl) + '">Gestionar en /admin</a></p>' : "";

  var html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#141210">' +
    '<p style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#5E4431;margin:0 0 8px">LISTO · Propuesta</p>' +
    '<h1 style="font-size:24px;margin:0 0 6px">' + esc(accepted ? "Propuesta aceptada" : "Pidió otra opción") + '</h1>' +
    '<p style="margin:0 0 18px;color:#5A5046">' + esc(lead) + '</p>' +
    (ctx.comment ? '<div style="border-left:4px solid #5E4431;background:#F5F1EA;padding:12px 14px;margin:0 0 18px"><strong>Comentario:</strong><br>' + esc(ctx.comment).replace(/\n/g, "<br>") + '</div>' : '') +
    (waLink ? '<p style="margin:0 0 22px"><a href="' + esc(waLink) + '" style="display:inline-block;background:#141210;color:#EFE8DC;text-decoration:none;padding:14px 22px;font-weight:bold;letter-spacing:2px;font-size:13px">ABRIR WHATSAPP</a></p>' : '') +
    '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px">' +
    rows.map(function (row) {
      var val = esc(row[1]);
      if (row[0] === "Google Maps" && /^https:\/\//.test(row[1])) val = '<a href="' + esc(row[1]) + '">Abrir en Google Maps</a>';
      return '<tr><td style="padding:8px 12px 8px 0;border-bottom:1px solid #E2D9CB;color:#8C857A;white-space:nowrap;vertical-align:top">' + esc(row[0]) +
        '</td><td style="padding:8px 0;border-bottom:1px solid #E2D9CB;vertical-align:top">' + val + '</td></tr>';
    }).join("") + '</table>' + GMAPS_HTML + admin + '</div>';

  var text = subject + "\n" + lead + "\n\n" +
    rows.map(function (row) { return row[0] + ": " + row[1]; }).join("\n") +
    (waLink ? "\n\nABRIR WHATSAPP: " + waLink : "") + (ctx.adminUrl ? "\nGestionar: " + ctx.adminUrl : "") + "\n\n" + GMAPS_TEXT;
  return { subject: subject, html: html, text: text };
}

// Nunca lanza errores: si Resend falla, la respuesta del usuario ya quedó guardada.
function notifyProposalResponse(cfg, info, fetchImpl) {
  var apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) { console.error("[notify] respuesta de propuesta sin email: falta RESEND_API_KEY"); return Promise.resolve(false); }
  var doFetch = fetchImpl || fetch;
  var path = "plan_inquiries?select=contact_name,contact_phone,event_date,approximate_time," +
    "plan_selections(provider_google_place_id,event_requests(event_type,guests,zone))&id=eq." + encodeURIComponent(info.planInquiryId);
  return store.request(doFetch, api(cfg, path), { method: "GET", headers: store.headersFor(cfg.key) }, "leer contexto propuesta")
    .then(first, function (err) {
      console.error("[notify] no se pudo leer el contexto de la propuesta:", err.status || "", err.code || "");
      return null;
    })
    .then(function (inq) {
      inq = inq || {};
      var sel = inq.plan_selections || {};
      // Sin Google: aceptar / pedir otra opción nunca consulta Place Details.
      // Sólo el link a Maps armado con el google_place_id; el nombre se ve en /admin.
      var provider = { name: null, address: null, maps_url: placeDetails.mapsLinkFor(sel.provider_google_place_id), unavailable: false };
      return sendEmail(apiKey, buildProposalEmail({
        action: info.action, comment: info.comment, quote: info.quote, adminUrl: info.adminUrl,
        contact: inq, request: sel.event_requests || {}, provider: provider
      }), doFetch);
    })
    .then(function () { return true; }, function (err) {
      console.error("[notify] el email de respuesta no se envió:", err && err.name === "AbortError" ? "tiempo de espera agotado" : (err && err.message));
      return false;
    });
}

module.exports = {
  NOTIFY_TO: NOTIFY_TO, buildEmail: buildEmail, whatsappNumber: whatsappNumber, notifyInquiry: notifyInquiry,
  buildProposalEmail: buildProposalEmail, notifyProposalResponse: notifyProposalResponse
};
