/* Bisú Studio — Interfaz.
   Pantallas, pasos y formularios. No contiene fórmulas: todo cálculo sale de pricing.js. */

import { D } from "./decimal.js";
import { computeProduct, evaluatePrice, makeSnapshot, roundingLabel } from "./pricing.js";
import * as M from "./model.js";
import * as S from "./storage.js";
import { money, moneyAuto, percent, signedPercent, qty, date, parseInput, inputValue } from "./format.js";

/* ---------- Estado ---------- */

const state = {
  view: "calc",
  step: 0,
  config: S.loadConfig(),
  product: null,
  result: null,
  dirty: false,
  showTrace: false,
  customDiscount: "25",
  productSearch: "",
};
state.product = S.loadDraft(state.config) || M.newProduct(state.config);

const STEPS = [
  { id: "product", label: "Producto" },
  { id: "materials", label: "Materiales" },
  { id: "production", label: "Producción" },
  { id: "expenses", label: "Gastos" },
  { id: "margin", label: "Margen" },
  { id: "payments", label: "Pagos" },
  { id: "result", label: "Resultado" },
];

const TIPS = {
  margin: "Margen: qué parte del precio es ganancia. Con 60%, de cada $100 que cobrás, $60 son ganancia. Precio = costo ÷ (1 − margen).",
  markup: "Markup: cuánto le sumás al costo. Margen 60% equivale a markup 150% (costo × 2,5). No es lo mismo que costo × 1,60.",
  replacement: "Costo de reposición: cuánto te costaría volver a fabricar la misma prenda cuando repongas, con la inflación estimada (compuesta mes a mes).",
  breakEven: "Recupero de inversión: cuántas prendas tenés que vender para que lo que cobrás (neto de comisiones) cubra lo que invertiste en el lote.",
  financial: "Costo financiero: lo que te descuentan por ofrecer cuotas o cobrar antes. Se calcula sobre el precio publicado, igual que las comisiones.",
  minimum: "Precio mínimo: con este precio, después de comisiones e impuestos, cobrás exactamente el costo base. Ganancia cero.",
  target: "Precio objetivo: el precio exacto para que, después de comisiones, te quede el margen elegido.",
  recommended: "Precio objetivo redondeado comercialmente. El redondeo se configura en Pagos o Configuración.",
  fixed: "Gastos fijos imputados: la parte del alquiler, sueldos, luz, etc. que le toca a cada prenda. Gastos fijos del mes ÷ prendas producidas por mes.",
  waste: "Desperdicio: la tela que se pierde en el corte (encimada, orillos, fallas). Se suma al consumo.",
  net: "Neto recibido: lo que efectivamente entra a Bisú después de comisiones, impuestos y cargos.",
  reference: "El precio publicado es uno solo. Calculalo con el medio de pago más caro que ofrezcas (por ejemplo, 6 cuotas) para no perder margen cuando la clienta elige ese medio.",
  basis: "Si vendés al costo actual, cuando vuelvas a fabricar no te va a alcanzar la plata. Calcular sobre costo de reposición preserva tu capital de trabajo.",
  maxDiscount: "El descuento más grande que podés hacer sin que lo que cobrás quede debajo del costo base.",
  settlement: "Cuánto pierde por inflación el dinero mientras esperás que se acredite. Es solo informativo: si calculás sobre costo de reposición, ya está cubierto.",
};

/* ---------- Utilidades ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = (x) => JSON.parse(JSON.stringify(x));

function scopeRoot(scope) {
  if (scope === "config") return state.config;
  if (scope === "ui") return state;
  return state.product;
}

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = value;
}

function tip(key) {
  const text = TIPS[key] || key;
  return `<button type="button" class="tip" aria-label="${esc(text)}" data-tip="${esc(text)}">?</button>`;
}

let toastTimer;
function toast(msg, kind = "") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast is-on " + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = "toast"; }, 2600);
}

/* Campo de formulario. kind: num | text | date | select | check */
function field({ label, path, scope = "product", kind = "num", prefix = "", suffix = "", tipKey = "", placeholder = "", options = [], hint = "", cls = "", compact = false }) {
  const value = getPath(scopeRoot(scope), path);
  const id = "f_" + scope + "_" + path.replace(/\./g, "_");
  const attrs = `id="${id}" data-bind="${esc(path)}" data-scope="${scope}" data-kind="${kind}"`;
  let control;
  if (kind === "select") {
    control = `<select ${attrs}>${options.map((o) => `<option value="${esc(o.value)}"${String(o.value) === String(value) ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
  } else if (kind === "check") {
    return `<label class="check ${cls}"><input type="checkbox" ${attrs}${value ? " checked" : ""}><span>${esc(label)}</span></label>`;
  } else if (kind === "text" || kind === "date") {
    control = `<input type="${kind}" ${attrs} value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off"${kind === "text" && path.endsWith("name") ? ' list="dl-' + esc(path.split(".")[0]) + '"' : ""}>`;
  } else {
    control = `<input type="text" inputmode="decimal" ${attrs} value="${esc(inputValue(value))}" placeholder="${esc(placeholder)}" autocomplete="off">`;
  }
  const affix = prefix || suffix
    ? `<div class="affix">${prefix ? `<span class="pre">${prefix}</span>` : ""}${control}${suffix ? `<span class="suf">${suffix}</span>` : ""}</div>`
    : control;
  return `<div class="field ${compact ? "is-compact" : ""} ${cls}">
    ${label ? `<label for="${id}">${esc(label)}${tipKey ? tip(tipKey) : ""}</label>` : ""}
    ${affix}
    ${hint ? `<p class="hint">${hint}</p>` : ""}
  </div>`;
}

const out = (name, i = "") => `<span data-out="${name}"${i !== "" ? ` data-i="${i}"` : ""}></span>`;

/* ---------- Cálculo y refresco ---------- */

function recompute() {
  state.result = computeProduct(state.product);
}

let draftTimer;
function scheduleDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => S.saveDraft(state.product), 400);
}

let configTimer;
function scheduleConfigSave() {
  clearTimeout(configTimer);
  configTimer = setTimeout(() => {
    S.saveConfig(state.config);
    const el = $("[data-out='config-saved']");
    if (el) el.textContent = "Guardado automáticamente";
  }, 400);
}

function refreshOutputs() {
  const r = state.result;
  $$("[data-out]").forEach((el) => {
    const fn = OUT[el.dataset.out];
    if (!fn) return;
    const html = fn(r, el.dataset.i !== undefined ? Number(el.dataset.i) : null, el);
    if (html !== undefined && el.innerHTML !== html) el.innerHTML = html;
  });
}

/* ---------- Salidas en vivo ---------- */

function card(label, value, note = "", cls = "", tipKey = "") {
  return `<div class="kpi ${cls}">
    <p class="kpi-label">${label}${tipKey ? tip(tipKey) : ""}</p>
    <p class="kpi-value">${value}</p>
    ${note ? `<p class="kpi-note">${note}</p>` : ""}
  </div>`;
}

function lossClass(ev) {
  if (!ev) return "";
  return ev.loss ? "is-bad" : "";
}

const OUT = {
  "calc-title": () => esc(state.product.name || "Sin nombre"),
  "calc-eyebrow": () => {
    const cat = M.CATEGORIES.find((c) => c.id === state.product.category);
    const bits = [state.product.id ? "Editando" : "Nueva prenda"];
    if (state.product.sku) bits.push(esc(state.product.sku));
    if (cat) bits.push(cat.label);
    return bits.join(" · ");
  },
  progress: (r, i, el) => { el.style.width = ((state.step + 1) / STEPS.length) * 100 + "%"; return undefined; },

  "fabric-adj": (r, i) => (r.fabrics[i] ? qty(r.fabrics[i].adjustedConsumption) + " m" : "—"),
  "fabric-cost": (r, i) => (r.fabrics[i] ? money(r.fabrics[i].cost) : "—"),
  "trim-total": (r, i) => (r.trims.lines[i] ? moneyAuto(r.trims.lines[i].total) : "—"),
  "pack-total": (r, i) => (r.packaging.lines[i] ? moneyAuto(r.packaging.lines[i].total) : "—"),
  "fabric-sum": (r) => money(r.fabricTotal),
  "trims-sum": (r) => moneyAuto(r.trims.total),
  "pack-sum": (r) => moneyAuto(r.packaging.total),
  "materials-sum": (r) => money(r.fabricTotal.plus(r.trims.total).plus(r.packaging.total)),
  "labor-sum": (r) => money(r.labor),
  "process-sum": (r) => money(r.processes),
  "production-sum": (r) => money(r.labor.plus(r.processes)),

  "fixed-monthly": (r) => money(r.fixed.monthly),
  "fixed-computed": (r) => (r.fixed.computed ? money(r.fixed.computed) : "—"),
  "fixed-applied": (r) => money(r.fixed.applied) + (r.fixed.isManual ? ` <span class="tag">manual</span>` : ""),
  "cost-compare": (r) => `
    <div class="kpis kpis-2">
      ${card("Costo actual", money(r.currentCost), "Lo que cuesta fabricarla hoy")}
      ${card("Costo de reposición", money(r.replacementCost), `En ${qty(r.months, 1)} meses con ${percent(r.inflation)} mensual · ${signedPercent(r.replacementFactor.minus(1))}`, "is-accent", "replacement")}
    </div>`,

  "margin-live": (r) => {
    const ev = r.atRecommended;
    return `<div class="kpis kpis-4">
      ${card("Margen bruto", percent(r.margin), "sobre lo que cobra Bisú", "", "margin")}
      ${card("Markup", percent(r.markupTarget), "sobre el costo base", "", "markup")}
      ${card("Precio antes de comisiones", money(r.netTarget), "costo base ÷ (1 − margen)")}
      ${card("Ganancia bruta", r.netTarget ? money(r.netTarget.minus(r.basisCost)) : "—", "por prenda")}
    </div>
    <p class="note">Precio publicado con ${esc(r.reference.name)}: <strong>${money(r.recommendedPrice)}</strong>${ev && ev.margin ? ` · margen real ${percent(ev.margin)}` : ""}</p>`;
  },
  "margin-value": (r) => percent(r.margin, 1),
  "scenario-preview": (r) => scenarioCards(r),

  "payments-table": (r) => paymentsTable(r),

  summary: (r) => summaryHtml(r),
  "mobile-bar": (r) => (state.view === "calc"
    ? `<div><span class="label">Recomendado</span><strong>${money(r.recommendedPrice)}</strong></div>
       <div><span class="label">Costo</span><strong>${money(r.currentCost)}</strong></div>
       <div><span class="label">Margen</span><strong>${r.atPublish && r.atPublish.margin ? percent(r.atPublish.margin, 0) : "—"}</strong></div>`
    : ""),

  "result-alert": (r) => alertHtml(r),
  "result-hero": (r) => heroHtml(r),
  "result-profit": (r) => profitHtml(r),
  "result-trace": (r) => (state.showTrace ? traceHtml(r) : ""),
  "result-payment": (r) => paymentBreakdownHtml(r),
  "result-scenarios": (r) => scenarioCards(r),
  "result-discounts": (r) => discountsHtml(r),
  "result-wholesale": (r) => wholesaleHtml(r),
  "result-production": (r) => productionHtml(r),
  "trace-label": () => (state.showTrace ? "Ocultar cálculo" : "Ver cálculo"),

  "config-fixed-total": () => {
    const total = D.sum(Object.values(state.config.fixedCosts).map((v) => D(v || 0)));
    const per = D(state.config.monthlyUnits || 0).gt(0) ? total.div(state.config.monthlyUnits) : null;
    return `<div class="kpis kpis-2">${card("Gastos fijos mensuales", money(total))}${card("Gasto fijo por prenda", money(per), "gastos fijos ÷ prendas por mes", "is-accent", "fixed")}</div>`;
  },
  "config-saved": () => undefined,
};

function warningsHtml(r) {
  const items = r.errors.map((e) => `<li class="is-bad">${esc(e)}</li>`).concat(r.warnings.map((w) => `<li>${esc(w)}</li>`));
  return items.length ? `<ul class="warnings">${items.join("")}</ul>` : "";
}

function summaryHtml(r) {
  const ev = r.atPublish;
  return `
    <p class="eyebrow">En vivo</p>
    <dl class="sum-list">
      <div><dt>Costo actual</dt><dd>${money(r.currentCost)}</dd></div>
      <div><dt>Costo de reposición</dt><dd>${money(r.replacementCost)}</dd></div>
      <div><dt>Precio mínimo</dt><dd>${money(r.minimumPrice)}</dd></div>
    </dl>
    <div class="sum-hero">
      <p class="kpi-label">Precio recomendado Bisú</p>
      <p class="sum-price">${money(r.recommendedPrice)}</p>
      <p class="kpi-note">Margen objetivo ${percent(r.margin, 0)} · base: ${r.basis === "current" ? "costo actual" : "reposición"}</p>
    </div>
    ${ev ? `<dl class="sum-list">
      ${r.hasPublish ? `<div><dt>Precio publicado</dt><dd>${money(ev.price)}</dd></div>` : ""}
      <div><dt>Neto que recibís</dt><dd>${money(ev.net)}</dd></div>
      <div><dt>Margen real</dt><dd class="${lossClass(ev)}">${percent(ev.margin)}</dd></div>
    </dl>` : ""}
    ${warningsHtml(r)}
    ${state.step < STEPS.length - 1 ? `<button type="button" class="btn btn-link" data-action="go-step" data-step="${STEPS.length - 1}">Ver resultado completo →</button>` : ""}`;
}

function alertHtml(r) {
  const a = r.alert;
  if (!a || !a.changed) return "";
  const up = a.variation.gt(0);
  let keep = "";
  if (up && a.previousPrice && a.priceToKeep && a.priceToKeep.gt(a.previousPrice)) {
    keep = `<p>Para mantener tu margen actual (${percent(a.previousMargin, 0)}) deberías aumentar el precio de <strong>${money(a.previousPrice)}</strong> a <strong>${money(a.priceToKeep)}</strong>.</p>`;
  } else if (a.priceToKeep) {
    keep = `<p>Precio para mantener tu margen de ${percent(a.previousMargin, 0)}: <strong>${money(a.priceToKeep)}</strong>.</p>`;
  }
  return `<div class="alert ${up ? "is-bad" : "is-ok"}">
    <p class="alert-title">Costo ${signedPercent(a.variation)} desde el último cálculo (${date(a.date)})</p>
    <div class="alert-grid">
      <div><span class="label">Costo anterior</span><strong>${money(a.previousCost)}</strong></div>
      <div><span class="label">Costo nuevo</span><strong>${money(a.currentCost)}</strong></div>
      <div><span class="label">Variación</span><strong>${signedPercent(a.variation)}</strong></div>
    </div>
    ${keep}
  </div>`;
}

function heroHtml(r) {
  const rawNote = r.targetPrice && r.recommendedPrice && !r.targetPrice.eq(r.recommendedPrice)
    ? `Resultado matemático ${money(r.targetPrice)} · ${esc(roundingLabel(state.product.settings.rounding))}`
    : "Sin redondeo";
  return `${warningsHtml(r)}
  <div class="hero">
    <div class="kpis kpis-4">
      ${card("Costo actual", money(r.currentCost), "Fabricarla hoy")}
      ${card("Costo de reposición", money(r.replacementCost), `${qty(r.months, 1)} meses · ${percent(r.inflation)} mensual`, "", "replacement")}
      ${card("Precio mínimo", money(r.minimumPrice), "Cubrís costos y gastos de la venta. Ganancia cero.", "", "minimum")}
      ${card("Precio objetivo", money(r.targetPrice), `Para un margen de ${percent(r.margin, 0)}`, "", "target")}
    </div>
    <div class="kpi kpi-hero">
      <p class="kpi-label">Precio recomendado Bisú${tip("recommended")}</p>
      <p class="kpi-value">${money(r.recommendedPrice)}</p>
      <p class="kpi-note">${rawNote}</p>
      <p class="kpi-note">Calculado con ${esc(r.reference.name)} sobre ${r.basis === "current" ? "costo actual" : "costo de reposición"}</p>
    </div>
  </div>`;
}

function profitHtml(r) {
  const ev = r.atPublish;
  if (!ev) return "";
  return `<div class="kpis kpis-4">
    ${card("Neto que recibís", money(ev.net), "después de comisiones e impuestos", "", "net")}
    ${card("Ganancia por prenda", money(ev.profit), "neto − costo base", lossClass(ev))}
    ${card("Margen real", percent(ev.margin), `sobre lo que cobrás · ${percent(ev.marginOnPublished)} sobre el precio publicado`, lossClass(ev), "margin")}
    ${card("Markup", percent(ev.markup), "sobre el costo base", "", "markup")}
  </div>
  <div class="split-note">
    <div><span class="label">Ganancia sobre costo actual (contable)</span><strong class="${ev.lossCurrent ? "neg" : ""}">${money(ev.profitCurrent)}</strong> <span class="muted">· ${percent(ev.marginCurrent)}</span></div>
    <div><span class="label">Ganancia después de reponer</span><strong class="${ev.net.lt(r.replacementCost) ? "neg" : ""}">${money(ev.net.minus(r.replacementCost))}</strong> <span class="muted">· lo que queda si volvés a fabricarla</span></div>
  </div>`;
}

function traceHtml(r) {
  const fmt = (s) => (s.type === "pct" ? percent(s.value, 2) : s.type === "qty" ? qty(s.value) : money(s.value));
  return `<div class="trace">${r.trace.map((s) => (s.section
    ? `<p class="trace-section">${esc(s.section)}</p>`
    : `<div class="trace-row ${s.strong ? "is-strong" : ""}"><span class="trace-label">${esc(s.label)}${s.formula ? `<small>${esc(s.formula)}</small>` : ""}</span><span class="trace-value">${fmt(s)}</span></div>`)).join("")}</div>`;
}

function paymentBreakdownHtml(r) {
  const ev = r.atPublish;
  if (!ev) return "";
  const lines = ev.fees.lines.map((l) => `<div class="trace-row"><span class="trace-label">${esc(l.name)} <small>${percent(l.rate, 2)}</small></span><span class="trace-value neg">${money(l.amount.neg())}</span></div>`).join("");
  return `<div class="cols-2">
    <div class="trace">
      <div class="trace-row is-strong"><span class="trace-label">Precio publicado</span><span class="trace-value">${money(ev.price)}</span></div>
      ${lines || `<div class="trace-row"><span class="trace-label muted">Sin comisiones cargadas para ${esc(r.reference.name)}</span><span></span></div>`}
      ${ev.fees.fixed.isZero() ? "" : `<div class="trace-row"><span class="trace-label">Cargo fijo</span><span class="trace-value neg">${money(ev.fees.fixed.neg())}</span></div>`}
      <div class="trace-row is-strong"><span class="trace-label">Monto neto recibido por Bisú</span><span class="trace-value">${money(ev.net)}</span></div>
      <div class="trace-row"><span class="trace-label">Margen real después de financiación</span><span class="trace-value ${ev.loss ? "neg" : ""}">${percent(ev.margin)}</span></div>
    </div>
    <div>${paymentsTable(r)}</div>
  </div>`;
}

function paymentsTable(r) {
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>Medio de pago</th><th class="num">Comisiones</th><th class="num">Precio necesario</th><th class="num">Neto con el precio publicado</th><th class="num">Margen</th><th class="num">Inflación en el plazo${tip("settlement")}</th></tr></thead>
    <tbody>${r.paymentTable.map((row) => `<tr class="${row.method.id === r.reference.id ? "is-ref" : ""}">
      <td>${esc(row.method.name)}${row.method.id === r.reference.id ? ' <span class="tag">referencia</span>' : ""}</td>
      <td class="num">${percent(row.method.rate, 2)}${row.method.fixed.isZero() ? "" : " + " + money(row.method.fixed)}</td>
      <td class="num">${money(row.requiredPrice)}</td>
      <td class="num">${row.eval ? money(row.eval.net) : "—"}</td>
      <td class="num ${row.eval && row.eval.loss ? "neg" : ""}">${row.eval ? percent(row.eval.margin) : "—"}</td>
      <td class="num muted">${row.settlementLoss && !row.settlementLoss.isZero() ? money(row.settlementLoss.neg()) + " · " + qty(row.method.settlementDays, 0) + " días" : "—"}</td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function scenarioCards(r) {
  return `<div class="scenarios">${r.scenarios.map((sc) => `
    <div class="scenario ${sc.id === "target" ? "is-target" : ""}">
      <p class="kpi-label">${sc.label}</p>
      <p class="scenario-price">${money(sc.price)}</p>
      <p class="kpi-note">Margen ${sc.eval ? percent(sc.eval.margin, 0) : "—"} <span class="muted">(objetivo ${percent(sc.margin, 0)})</span></p>
      ${sc.eval ? `<p class="kpi-note muted">Ganancia ${money(sc.eval.profit)}</p>` : ""}
    </div>`).join("")}</div>`;
}

function discountsHtml(r) {
  if (!r.publishPrice) return `<p class="muted">Falta un precio para simular.</p>`;
  const custom = parseInput(state.customDiscount);
  const rows = r.discounts.slice();
  if (custom && D(custom).gt(0) && D(custom).lt(100)) rows.push(r.discountFor(D(custom).div(100)));
  return `
  <div class="callout">
    <p class="kpi-label">Descuento máximo posible${tip("maxDiscount")}</p>
    <p class="callout-value">${percent(r.maxDiscount, 1)}</p>
    <p class="kpi-note">Hasta ${money(r.publishPrice.times(D(1).minus(r.maxDiscount || 0)))} cubrís el ${r.basis === "current" ? "costo actual" : "costo de reposición"}. Contra el costo actual: ${percent(r.maxDiscountCurrent, 1)}.</p>
  </div>
  <div class="table-wrap"><table class="table">
    <thead><tr><th>Descuento</th><th class="num">Precio con descuento</th><th class="num">Ingreso neto</th><th class="num">Ganancia</th><th class="num">Margen final</th><th></th></tr></thead>
    <tbody>${rows.map((d) => `<tr class="${d.loss ? "is-loss" : ""}">
      <td>${percent(d.rate, 0)} OFF</td>
      <td class="num">${money(d.price)}</td>
      <td class="num">${money(d.net)}</td>
      <td class="num">${money(d.profit)}</td>
      <td class="num">${percent(d.margin)}</td>
      <td>${d.loss ? '<span class="loss">Este descuento genera pérdida.</span>' : d.lossCurrent ? '<span class="loss soft">Pérdida contra costo actual</span>' : ""}</td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function wholesaleHtml(r) {
  const w = r.wholesale;
  return `<div class="kpis kpis-3">
    ${card("Costo base", money(r.basisCost))}
    ${card("Precio mayorista", money(w.price), w.rawPrice && !w.rawPrice.eq(w.price || 0) ? "Matemático " + money(w.rawPrice) : "", "is-accent")}
    ${card("Ganancia Bisú", w.eval ? money(w.eval.profit) : "—", `Margen mayorista ${w.eval ? percent(w.eval.margin) : "—"} · cobro: ${esc(w.method.name)}`)}
  </div>
  <div class="kpis kpis-3">
    ${card("Precio minorista sugerido", money(w.retailerRetail), "para el local que revende")}
    ${card("Margen aproximado del retailer", percent(w.retailerRealMargin), "sin contar sus impuestos ni comisiones")}
    ${card("Markup del retailer", percent(w.retailerMarkup), "")}
  </div>
  ${w.channelConflict ? `<p class="note warn">El precio sugerido al retailer (${money(w.retailerRetail)}) queda por debajo de tu precio publicado (${money(r.publishPrice)}). Puede competir con tu propia tienda.</p>` : ""}`;
}

function productionHtml(r) {
  const p = r.production;
  if (!p) return "";
  if (p.units.isZero()) return `<p class="muted">Cargá la cantidad de unidades en el paso Producto.</p>`;
  const n = qty(p.units, 0);
  return `<div class="kpis kpis-4">
    ${card("Inversión total", money(p.investment), `${n} unidades × ${money(r.currentCost)}`)}
    ${card("Facturación si vendés todas", money(p.revenue), `Neto: ${money(p.netTotal)}`)}
    ${card("Ganancia bruta", money(p.profit), "neto − inversión", p.profit.isNeg() ? "is-bad" : "")}
    ${card("Margen", percent(p.margin), "sobre lo que cobrás")}
  </div>
  <div class="callout">
    <p class="kpi-label">Recupero de inversión${tip("breakEven")}</p>
    <p class="callout-value">${p.breakEvenUnits ? qty(p.breakEvenUnits, 0) + " unidades" : "—"}</p>
    <p class="kpi-note">${p.breakEvenUnits
      ? (p.breakEvenUnits.gt(p.units)
        ? `<span class="neg">Aunque vendas las ${n} prendas no recuperás la inversión.</span>`
        : `Necesitás vender <strong>${qty(p.breakEvenUnits, 0)}</strong> de las <strong>${n}</strong> prendas producidas para recuperar la inversión.`)
      : "Con este precio no hay ingreso neto positivo."}</p>
    <p class="kpi-note muted">Si vendés todas y volvés a fabricarlas: te quedan ${money(p.profitAfterReplacement)}.</p>
  </div>`;
}

/* ---------- Pasos ---------- */

function renderSteps() {
  $("#steps").innerHTML = STEPS.map((s, i) => `<li>
    <button type="button" class="step ${i === state.step ? "is-current" : ""} ${i < state.step ? "is-done" : ""}" data-action="go-step" data-step="${i}">
      <span class="step-n">${i + 1}</span><span class="step-l">${s.label}</span>
    </button></li>`).join("");
}

function section(title, body, lead = "") {
  return `<section class="block"><header class="block-head"><h2>${title}</h2>${lead ? `<p class="lead">${lead}</p>` : ""}</header>${body}</section>`;
}

const DATALISTS = `
  <datalist id="dl-trims">${["Cierre", "Botones", "Etiqueta Bisú", "Etiqueta de talle", "Broches", "Elástico", "Hilo", "Entretela"].map((v) => `<option value="${v}">`).join("")}</datalist>
  <datalist id="dl-packaging">${["Bolsa", "Caja", "Papel de seda", "Sticker", "Tarjeta"].map((v) => `<option value="${v}">`).join("")}</datalist>`;

function itemRows(list, listKey, outKey, addLabel) {
  const items = state.product[listKey];
  return `<div class="rows">
    ${items.length ? `<div class="row row-head row-items"><span>Nombre</span><span>Cantidad</span><span>Precio unitario</span><span class="num">Total</span><span></span></div>` : ""}
    ${items.map((it, i) => `<div class="row row-items">
      ${field({ label: "", path: `${listKey}.${i}.name`, kind: "text", placeholder: "Nombre", compact: true })}
      ${field({ label: "", path: `${listKey}.${i}.qty`, placeholder: "1", compact: true })}
      ${field({ label: "", path: `${listKey}.${i}.unitPrice`, prefix: "$", placeholder: "0", compact: true })}
      <span class="row-out num">${out(outKey, i)}</span>
      <button type="button" class="icon-btn" data-action="list-remove" data-scope="product" data-list="${listKey}" data-i="${i}" aria-label="Quitar">×</button>
    </div>`).join("")}
    <button type="button" class="btn btn-add" data-action="list-add" data-scope="product" data-list="${listKey}">${addLabel}</button>
  </div>`;
}

const STEP_RENDER = {
  product() {
    return section("La prenda", `
      <div class="grid grid-2">
        ${field({ label: "Nombre de la prenda", path: "name", kind: "text", placeholder: "Pantalón Siena" })}
        ${field({ label: "Código / SKU", path: "sku", kind: "text", placeholder: "PA001" })}
        ${field({ label: "Categoría", path: "category", kind: "select", options: M.CATEGORIES.map((c) => ({ value: c.id, label: c.label })) })}
        ${field({ label: "Fecha de cálculo", path: "date", kind: "date" })}
        ${field({ label: "Cantidad de unidades a producir", path: "units", placeholder: "40", suffix: "u." })}
      </div>
      <div class="inline-actions"><button type="button" class="btn btn-ghost" data-action="load-example">Cargar ejemplo: Pantalón Siena</button></div>`,
    "Empezá por lo básico. Todo se calcula en vivo a la derecha.");
  },

  materials() {
    const fabrics = state.product.fabrics.map((f, i) => `
      <div class="fabric">
        <div class="grid grid-4">
          ${field({ label: "Tela", path: `fabrics.${i}.name`, kind: "text", placeholder: "Tencel" })}
          ${field({ label: "Precio por metro", path: `fabrics.${i}.pricePerMeter`, prefix: "$", placeholder: "12.000" })}
          ${field({ label: "Consumo promedio por prenda", path: `fabrics.${i}.consumption`, suffix: "m", placeholder: "1,40" })}
          ${field({ label: "Desperdicio", path: `fabrics.${i}.wastePct`, suffix: "%", placeholder: "8", tipKey: "waste" })}
        </div>
        <div class="fabric-out">
          <div><span class="label">Consumo ajustado</span><strong>${out("fabric-adj", i)}</strong><small>consumo × (1 + desperdicio)</small></div>
          <div><span class="label">Costo de tela por prenda</span><strong>${out("fabric-cost", i)}</strong><small>consumo ajustado × precio por metro</small></div>
          ${state.product.fabrics.length > 1 ? `<button type="button" class="btn btn-link" data-action="list-remove" data-scope="product" data-list="fabrics" data-i="${i}">Quitar tela</button>` : ""}
        </div>
      </div>`).join("");
    return DATALISTS + section("Tela", `${fabrics}
        <button type="button" class="btn btn-add" data-action="list-add" data-scope="product" data-list="fabrics">+ Agregar tela (forro, entretela…)</button>
        <p class="subtotal">Total tela ${out("fabric-sum")}</p>`,
      "Cargá precios de hoy: la inflación se proyecta después, en Gastos.")
      + section("Avíos", itemRows(state.product.trims, "trims", "trim-total", "+ Agregar avío") + `<p class="subtotal">Total avíos ${out("trims-sum")}</p>`,
        "Cierres, botones, etiquetas, elástico, hilo…")
      + section("Packaging", itemRows(state.product.packaging, "packaging", "pack-total", "+ Agregar packaging") + `<p class="subtotal">Total packaging ${out("pack-sum")}</p>`,
        "Bolsa, caja, papel. Cargalo solo acá (no como avío) para no contarlo dos veces.");
  },

  production() {
    return section("Mano de obra", `<div class="grid grid-4">${M.LABOR_FIELDS.map((f) => field({ label: f.label, path: `labor.${f.id}`, prefix: "$", placeholder: "0" })).join("")}</div>
      <p class="subtotal">Mano de obra por unidad ${out("labor-sum")}</p>`, "Costo por unidad. Los campos vacíos cuentan como cero.")
      + section("Procesos adicionales", `<div class="grid grid-4">${M.PROCESS_FIELDS.map((f) => field({ label: f.label, path: `processes.${f.id}`, prefix: "$", placeholder: "0" })).join("")}</div>
      <p class="subtotal">Procesos por unidad ${out("process-sum")}</p>`);
  },

  expenses() {
    const s = state.product.settings;
    return section("Gastos fijos imputados", `
      <div class="grid grid-3">
        <div class="field"><label>Gastos fijos mensuales</label><p class="static">${out("fixed-monthly")}</p></div>
        ${field({ label: "¿Cuántas prendas produce Bisú por mes?", path: "settings.monthlyUnits", suffix: "prendas" })}
        <div class="field"><label>Gasto fijo por prenda (automático)${tip("fixed")}</label><p class="static">${out("fixed-computed")}</p></div>
      </div>
      <details class="more">
        <summary>Ver o editar los gastos fijos de esta prenda</summary>
        <div class="grid grid-4">${M.FIXED_COST_FIELDS.map((f) => field({ label: f.label, path: `settings.fixedCosts.${f.id}`, prefix: "$", placeholder: "0" })).join("")}</div>
        <p class="hint">En "Sueldos" cargá solo lo que no pusiste por prenda en Mano de obra; si no, se cuenta dos veces.</p>
      </details>
      <div class="grid grid-2">
        ${field({ label: "Gasto fijo manual para esta prenda", path: "fixedOverride", prefix: "$", placeholder: "Vacío = automático", hint: "Usalo si esta prenda consume más (o menos) recursos que el promedio." })}
        <div class="field"><label>Gasto fijo aplicado</label><p class="static">${out("fixed-applied")}</p></div>
      </div>`, "La parte de alquiler, sueldos, luz, etc. que le corresponde a cada prenda. Viene de Configuración.")
      + section("Inflación y reposición", `
      <div class="grid grid-2">
        ${field({ label: "Inflación mensual estimada", path: "settings.inflationMonthly", suffix: "%" })}
        ${field({ label: "Meses hasta reposición", path: "settings.monthsToReplacement", suffix: "meses" })}
      </div>
      ${out("cost-compare")}
      <fieldset class="choice">
        <legend>¿Sobre qué costo calculamos el precio?${tip("basis")}</legend>
        <label class="radio"><input type="radio" name="basis" data-bind="settings.priceBasis" data-scope="product" data-kind="radio" value="replacement"${s.priceBasis !== "current" ? " checked" : ""}>
          <span><strong>B. Costo de reposición</strong> <span class="tag">recomendado</span><small>Preserva tu capital de trabajo: lo que cobrás alcanza para volver a fabricarla.</small></span></label>
        <label class="radio"><input type="radio" name="basis" data-bind="settings.priceBasis" data-scope="product" data-kind="radio" value="current"${s.priceBasis === "current" ? " checked" : ""}>
          <span><strong>A. Costo actual</strong><small>Lo que te costó hoy. Con inflación, puede no alcanzar para reponer.</small></span></label>
      </fieldset>`, "No se suma inflación al precio: se estima cuánto costaría volver a fabricar la misma prenda.")
      + `<div class="inline-actions"><button type="button" class="btn btn-ghost" data-action="pull-config">Traer configuración general actual</button></div>`;
  },

  margin() {
    const s = state.product.settings;
    return section("Margen objetivo", `
      <div class="slider-wrap">
        <div class="slider-head"><span class="label">Margen sobre venta${tip("margin")}</span><span class="slider-value">${out("margin-value")}</span></div>
        <input type="range" min="0" max="90" step="0.5" value="${esc(s.margin)}" data-bind="settings.margin" data-scope="product" data-kind="range" aria-label="Margen objetivo">
        <div class="grid grid-3">${field({ label: "Margen exacto", path: "settings.margin", suffix: "%" })}</div>
      </div>
      ${out("margin-live")}
      <div class="explain">
        <p><strong>Margen</strong> = qué parte del <em>precio</em> es ganancia. <strong>Markup</strong> = cuánto le sumás al <em>costo</em>.</p>
        <p>Costo $60.000 con margen 60% → $60.000 ÷ (1 − 0,60) = <strong>$150.000</strong> (markup 150%). Hacer $60.000 × 1,60 = $96.000 da solo 37,5% de margen.</p>
      </div>`, "Se mide sobre lo que efectivamente cobra Bisú, después de comisiones.")
      + section("Escenarios", `
      <div class="grid grid-3">
        ${field({ label: "Conservador", path: "settings.scenarioConservative", suffix: "%" })}
        <div class="field"><label>Objetivo</label><p class="static">${out("margin-value")}</p></div>
        ${field({ label: "Premium", path: "settings.scenarioPremium", suffix: "%" })}
      </div>
      ${out("scenario-preview")}`);
  },

  payments() {
    return section("Formas de pago", paymentMethodsEditor("product", "settings.") + `
      <div class="grid grid-2">
        ${field({ label: "Medio de pago de referencia para el precio publicado", path: "settings.referenceMethodId", kind: "select", options: methodOptions(state.product.settings), tipKey: "reference" })}
        ${field({ label: "Medio de pago de las ventas mayoristas", path: "settings.wholesaleMethodId", kind: "select", options: methodOptions(state.product.settings) })}
      </div>`, "Las comisiones se cobran sobre el precio publicado: el precio se calcula para que Bisú reciba el neto buscado.")
      + section("Impuestos y comisiones generales", taxesEditor("product", "settings."),
        "Se aplican a todas las ventas. No se asume ningún régimen: cargá los porcentajes que te indique tu contador.")
      + section("Redondeo comercial", roundingEditor("product", "settings."))
      + section("Resultado por medio de pago", out("payments-table"));
  },

  result() {
    return `${out("result-alert")}
      ${out("result-hero")}
      ${section("Rentabilidad", `
        <div class="grid grid-3 publish">
          ${field({ label: "Precio que vas a publicar", path: "publishPrice", prefix: "$", placeholder: "Vacío = recomendado" })}
          <div class="field"><label>&nbsp;</label><button type="button" class="btn btn-ghost" data-action="use-recommended">Usar recomendado</button></div>
        </div>
        ${out("result-profit")}
        <div class="inline-actions"><button type="button" class="btn btn-ghost" data-action="toggle-trace">${out("trace-label")}</button></div>
        ${out("result-trace")}`)}
      ${section("Cobro y financiación", out("result-payment"), "Qué pasa con el precio publicado según cómo te paguen.")}
      ${section("Escenarios", out("result-scenarios"))}
      ${section("Simulador de descuentos", `
        <div class="grid grid-3">${field({ label: "Probar otro descuento", path: "customDiscount", scope: "ui", suffix: "% OFF" })}</div>
        ${out("result-discounts")}`, "Sobre el precio publicado, con el medio de pago de referencia. Ideal para planificar SALE.")}
      ${section("Precio mayorista", `
        <div class="grid grid-3">
          ${field({ label: "Margen mayorista objetivo", path: "settings.marginWholesale", suffix: "%" })}
          ${field({ label: "Margen que busca el retailer", path: "settings.retailerMargin", suffix: "%" })}
        </div>
        ${out("result-wholesale")}`)}
      ${section("Análisis de producción", out("result-production"), "Con el precio publicado y todas las unidades vendidas.")}
      <div class="inline-actions end"><button type="button" class="btn btn-primary" data-action="save-product">Guardar prenda</button></div>`;
  },
};

function methodOptions(settings) {
  return settings.paymentMethods.map((m) => ({ value: m.id, label: m.name || "Sin nombre" }));
}

function paymentMethodsEditor(scope, prefix) {
  const root = scopeRoot(scope);
  const list = getPath(root, prefix + "paymentMethods");
  return `<div class="table-wrap"><table class="table table-edit">
    <thead><tr><th>Medio</th>${M.PAYMENT_FEE_FIELDS.map((f) => `<th class="num">${f.label}${f.id === "financingPct" ? tip("financial") : ""}</th>`).join("")}<th class="num">Cargo fijo</th><th class="num">Días hasta cobrar</th><th></th></tr></thead>
    <tbody>${list.map((m, i) => `<tr>
      <td>${field({ label: "", path: `${prefix}paymentMethods.${i}.name`, scope, kind: "text", compact: true })}</td>
      ${M.PAYMENT_FEE_FIELDS.map((f) => `<td>${field({ label: "", path: `${prefix}paymentMethods.${i}.${f.id}`, scope, suffix: "%", compact: true })}</td>`).join("")}
      <td>${field({ label: "", path: `${prefix}paymentMethods.${i}.fixedCharge`, scope, prefix: "$", compact: true })}</td>
      <td>${field({ label: "", path: `${prefix}paymentMethods.${i}.settlementDays`, scope, compact: true })}</td>
      <td><button type="button" class="icon-btn" data-action="list-remove" data-scope="${scope}" data-list="${prefix}paymentMethods" data-i="${i}" aria-label="Quitar">×</button></td>
    </tr>`).join("")}</tbody>
  </table></div>
  <button type="button" class="btn btn-add" data-action="list-add" data-scope="${scope}" data-list="${prefix}paymentMethods">+ Agregar medio de pago</button>`;
}

function taxesEditor(scope, prefix) {
  const list = getPath(scopeRoot(scope), prefix + "taxes");
  return `<div class="rows">${list.map((t, i) => `<div class="row row-tax">
      ${field({ label: "Activo", path: `${prefix}taxes.${i}.active`, scope, kind: "check" })}
      ${field({ label: "", path: `${prefix}taxes.${i}.name`, scope, kind: "text", compact: true })}
      ${field({ label: "", path: `${prefix}taxes.${i}.pct`, scope, suffix: "%", compact: true })}
      ${field({ label: "Aplica a mayorista", path: `${prefix}taxes.${i}.wholesale`, scope, kind: "check" })}
      <button type="button" class="icon-btn" data-action="list-remove" data-scope="${scope}" data-list="${prefix}taxes" data-i="${i}" aria-label="Quitar">×</button>
    </div>`).join("")}
    <button type="button" class="btn btn-add" data-action="list-add" data-scope="${scope}" data-list="${prefix}taxes">+ Agregar impuesto o comisión</button>
  </div>
  <p class="hint">Si la comisión de Mercado Pago o del gateway ya está cargada en un medio de pago, dejala desactivada acá para no descontarla dos veces. Si sos Responsable Inscripto, el IVA incluido en el precio equivale a 17,36% (21 ÷ 121); confirmalo con tu contador.</p>`;
}

function roundingEditor(scope, prefix) {
  const modes = [
    { value: "up", label: "Hacia arriba (recomendado)" },
    { value: "nearest", label: "Al más cercano" },
    { value: "down", label: "Hacia abajo" },
    { value: "none", label: "Sin redondeo" },
  ];
  return `<div class="grid grid-3">
      ${field({ label: "Precio minorista", path: `${prefix}rounding.mode`, scope, kind: "select", options: modes })}
      ${field({ label: "Múltiplo", path: `${prefix}rounding.step`, scope, prefix: "$" })}
      ${field({ label: "Terminación", path: `${prefix}rounding.ending`, scope, prefix: "$", hint: "Ej.: múltiplo 10.000 y terminación 9.000 → $283.746 pasa a $289.000." })}
    </div>
    <div class="grid grid-3">
      ${field({ label: "Precio mayorista", path: `${prefix}wholesaleRounding.mode`, scope, kind: "select", options: modes })}
      ${field({ label: "Múltiplo", path: `${prefix}wholesaleRounding.step`, scope, prefix: "$" })}
      ${field({ label: "Terminación", path: `${prefix}wholesaleRounding.ending`, scope, prefix: "$" })}
    </div>`;
}

function renderCalc() {
  renderSteps();
  $("#step-body").innerHTML = STEP_RENDER[STEPS[state.step].id]();
  $("[data-action='prev']").disabled = state.step === 0;
  const next = $("[data-action='next']");
  next.hidden = state.step === STEPS.length - 1;
  refreshOutputs();
}

/* ---------- Productos ---------- */

function renderProducts() {
  const list = S.loadProducts(state.config);
  const q = state.productSearch.trim().toLowerCase();
  const rows = list
    .filter((p) => !q || (p.name + " " + p.sku).toLowerCase().includes(q))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map((p) => {
      const r = computeProduct(p);
      const ev = r.atPublish;
      const cat = M.CATEGORIES.find((c) => c.id === p.category);
      return `<tr>
        <td>${esc(p.sku || "—")}</td>
        <td><strong>${esc(p.name || "Sin nombre")}</strong><small class="muted block">${cat ? cat.label : ""}</small></td>
        <td class="num">${money(r.currentCost)}</td>
        <td class="num">${money(r.publishPrice)}</td>
        <td class="num ${ev && ev.loss ? "neg" : ""}">${ev ? percent(ev.margin, 0) : "—"}</td>
        <td>${date(p.updatedAt)}</td>
        <td class="actions">
          <button type="button" class="btn btn-link" data-action="edit-product" data-id="${p.id}">Editar</button>
          <button type="button" class="btn btn-link" data-action="dup-product" data-id="${p.id}">Duplicar</button>
          <button type="button" class="btn btn-link danger" data-action="del-product" data-id="${p.id}">Eliminar</button>
        </td>
      </tr>`;
    });
  $("#view-products").innerHTML = `
    <div class="page-head">
      <div><p class="eyebrow">${list.length} ${list.length === 1 ? "prenda guardada" : "prendas guardadas"}</p><h1 class="page-title">Productos</h1></div>
      <div class="head-actions">
        <input type="search" class="search" placeholder="Buscar por nombre o SKU" value="${esc(state.productSearch)}" data-action-input="search">
        <button type="button" class="btn btn-primary" data-action="new-product">Nueva prenda</button>
      </div>
    </div>
    ${list.length ? `<div class="table-wrap"><table class="table table-products">
      <thead><tr><th>SKU</th><th>Producto</th><th class="num">Costo</th><th class="num">Precio actual</th><th class="num">Margen${tip("margin")}</th><th>Última actualización</th><th></th></tr></thead>
      <tbody>${rows.join("") || `<tr><td colspan="7" class="muted">Sin resultados.</td></tr>`}</tbody>
    </table></div>
    <p class="hint">Costo: costo actual por unidad. Precio actual: el publicado (o el recomendado si no cargaste uno). Margen: real, sobre lo que cobrás, contra el costo base de cada prenda.</p>`
    : `<div class="empty"><p class="page-title small">Todavía no hay prendas guardadas.</p><p class="muted">Calculá una prenda y tocá "Guardar prenda".</p></div>`}`;
}

/* ---------- Configuración ---------- */

function renderConfig() {
  const c = state.config;
  $("#view-config").innerHTML = `
    <div class="page-head">
      <div><p class="eyebrow" data-out="config-saved">${c.updatedAt ? "Última modificación " + date(c.updatedAt) : "Valores iniciales: revisalos"}</p><h1 class="page-title">Configuración</h1></div>
      <div class="head-actions">
        <button type="button" class="btn btn-ghost" data-action="export">Exportar copia</button>
        <label class="btn btn-ghost file-btn">Importar copia<input type="file" accept="application/json,.json" data-action-input="import" hidden></label>
      </div>
    </div>
    <p class="lead">Estos valores se copian a cada prenda nueva. Después podés cambiarlos en cada prenda sin afectar a las demás.</p>
    ${section("Inflación y reposición", `<div class="grid grid-3">
      ${field({ label: "Inflación mensual estimada", path: "inflationMonthly", scope: "config", suffix: "%" })}
      ${field({ label: "Meses estimados hasta reposición", path: "monthsToReplacement", scope: "config", suffix: "meses" })}
      ${field({ label: "Calcular precios sobre", path: "priceBasis", scope: "config", kind: "select", options: [{ value: "replacement", label: "Costo de reposición (recomendado)" }, { value: "current", label: "Costo actual" }], tipKey: "basis" })}
    </div>`)}
    ${section("Márgenes", `<div class="grid grid-3">
      ${field({ label: "Margen retail objetivo (estándar Bisú)", path: "marginRetail", scope: "config", suffix: "%", tipKey: "margin" })}
      ${field({ label: "Escenario conservador", path: "scenarioConservative", scope: "config", suffix: "%" })}
      ${field({ label: "Escenario premium", path: "scenarioPremium", scope: "config", suffix: "%" })}
      ${field({ label: "Margen mayorista", path: "marginWholesale", scope: "config", suffix: "%" })}
      ${field({ label: "Margen que busca el retailer", path: "retailerMargin", scope: "config", suffix: "%" })}
    </div>`)}
    ${section("Gastos fijos mensuales", `<div class="grid grid-4">
      ${M.FIXED_COST_FIELDS.map((f) => field({ label: f.label, path: `fixedCosts.${f.id}`, scope: "config", prefix: "$", placeholder: "0" })).join("")}
    </div>
    <div class="grid grid-3">${field({ label: "Producción mensual estimada", path: "monthlyUnits", scope: "config", suffix: "prendas" })}</div>
    ${out("config-fixed-total")}
    <p class="hint">En "Sueldos" cargá solo lo que no cargás por prenda en Mano de obra (por ejemplo, si pagás confección por prenda, no la sumes acá).</p>`)}
    ${section("Comisiones por medio de pago", paymentMethodsEditor("config", "") + `<div class="grid grid-2">
      ${field({ label: "Medio de referencia para el precio publicado", path: "referenceMethodId", scope: "config", kind: "select", options: methodOptions(c), tipKey: "reference" })}
      ${field({ label: "Medio de pago mayorista", path: "wholesaleMethodId", scope: "config", kind: "select", options: methodOptions(c) })}
    </div>`, "Valores en 0 hasta que cargues los de tu pasarela y tu banco.")}
    ${section("Impuestos y comisiones variables", taxesEditor("config", ""))}
    ${section("Redondeo comercial", roundingEditor("config", ""))}
    ${section("Datos", `<p class="muted">Todo se guarda en este navegador. Exportá una copia de vez en cuando para no perder tus prendas si borrás los datos del navegador o cambiás de computadora.</p>
      <div class="inline-actions"><button type="button" class="btn btn-link danger" data-action="reset-config">Volver a los valores iniciales</button></div>`)}`;
  refreshOutputs();
}

/* ---------- Navegación ---------- */

function show(view) {
  state.view = view;
  ["calc", "products", "config"].forEach((v) => { $("#view-" + v).hidden = v !== view; });
  $$(".nav-link").forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
  document.body.dataset.view = view;
  if (view === "calc") renderCalc();
  if (view === "products") renderProducts();
  if (view === "config") renderConfig();
  refreshOutputs();
  window.scrollTo({ top: 0 });
}

function goStep(i) {
  state.step = Math.max(0, Math.min(STEPS.length - 1, i));
  renderCalc();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function loadProductIntoCalc(product) {
  state.product = product;
  state.dirty = false;
  state.showTrace = false;
  recompute();
  S.saveDraft(state.product);
}

function confirmDiscard() {
  return !state.dirty || confirm("Tenés cambios sin guardar en la prenda actual. ¿Descartarlos?");
}

/* ---------- Listas ---------- */

function newListItem(listKey) {
  if (listKey.endsWith("fabrics")) return M.emptyFabric();
  if (listKey.endsWith("paymentMethods")) return { id: M.uid("pm"), name: "Nuevo medio", gatewayPct: "0", bankPct: "0", financingPct: "0", otherPct: "0", fixedCharge: "0", settlementDays: "0" };
  if (listKey.endsWith("taxes")) return { id: M.uid("tx"), name: "Nuevo cargo", pct: "0", active: true, wholesale: false };
  return M.emptyItem();
}

function afterScopeChange(scope) {
  if (scope === "config") {
    scheduleConfigSave();
    renderConfig();
  } else {
    state.dirty = true;
    recompute();
    scheduleDraft();
    renderCalc();
  }
}

/* ---------- Eventos ---------- */

function onInput(e) {
  const el = e.target;
  if (el.dataset.actionInput === "search") {
    state.productSearch = el.value;
    renderProducts();
    const s = $(".search");
    s.focus();
    s.setSelectionRange(s.value.length, s.value.length);
    return;
  }
  const path = el.dataset.bind;
  if (!path) return;
  const scope = el.dataset.scope;
  const kind = el.dataset.kind;
  let value;
  if (kind === "check") value = el.checked;
  else if (kind === "num") {
    value = parseInput(el.value);
    el.classList.toggle("is-invalid", value === null);
    if (value === null) return;
  } else value = el.value;

  if (scope === "ui") {
    state.customDiscount = value;
    refreshOutputs();
    return;
  }
  setPath(scopeRoot(scope), path, value);

  // Mantener sincronizados el slider y el campo del mismo dato.
  $$(`[data-bind="${CSS.escape(path)}"][data-scope="${scope}"]`).forEach((other) => {
    if (other === el || other.dataset.kind === "radio" || other.dataset.kind === "check") return;
    other.value = other.dataset.kind === "num" ? inputValue(value) : value;
  });

  // Los nombres de medios de pago aparecen en los selectores: actualizarlos sin re-render.
  if (/paymentMethods\.\d+\.name$/.test(path)) {
    const id = getPath(scopeRoot(scope), path.replace(/name$/, "id"));
    $$(`select[data-scope="${scope}"] option[value="${CSS.escape(id)}"]`).forEach((o) => { o.textContent = value || "Sin nombre"; });
  }

  if (scope === "config") {
    scheduleConfigSave();
    refreshOutputs();
    return;
  }
  state.dirty = true;
  recompute();
  scheduleDraft();
  refreshOutputs();
}

function onChange(e) {
  const el = e.target;
  if (el.dataset.actionInput === "import") return importFile(el);
  if (!el.dataset.bind) return;
  // Radios, selects y casillas cambian qué se muestra: se vuelve a dibujar la pantalla.
  // (Los campos de texto y números no, para no perder el foco mientras se tipea.)
  if (!["radio", "select", "check"].includes(el.dataset.kind)) return;
  if (el.dataset.scope === "config") renderConfig();
  else if (el.dataset.scope === "product") renderCalc();
}

function onClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const a = btn.dataset.action;
  switch (a) {
    case "nav": return show(btn.dataset.view);
    case "go-step": if (state.view !== "calc") show("calc"); return goStep(Number(btn.dataset.step));
    case "next": return goStep(state.step + 1);
    case "prev": return goStep(state.step - 1);
    case "list-add": {
      const scope = btn.dataset.scope;
      getPath(scopeRoot(scope), btn.dataset.list).push(newListItem(btn.dataset.list));
      return afterScopeChange(scope);
    }
    case "list-remove": {
      const scope = btn.dataset.scope;
      const list = getPath(scopeRoot(scope), btn.dataset.list);
      if (btn.dataset.list.endsWith("paymentMethods") && list.length <= 1) return toast("Tiene que haber al menos un medio de pago.");
      list.splice(Number(btn.dataset.i), 1);
      return afterScopeChange(scope);
    }
    case "load-example":
      if (!confirmDiscard()) return;
      loadProductIntoCalc(M.exampleProduct(state.config));
      state.dirty = true;
      toast("Ejemplo cargado: Pantalón Siena.");
      return renderCalc();
    case "new-product":
      if (!confirmDiscard()) return;
      loadProductIntoCalc(M.newProduct(state.config));
      state.step = 0;
      return show("calc");
    case "save-product": return saveCurrent();
    case "toggle-trace":
      state.showTrace = !state.showTrace;
      return refreshOutputs();
    case "use-recommended":
      state.product.publishPrice = "";
      return afterScopeChange("product");
    case "pull-config":
      if (!confirm("Se reemplazan inflación, márgenes, gastos fijos, medios de pago, impuestos y redondeo de esta prenda por los de Configuración. ¿Seguir?")) return;
      state.product.settings = M.settingsFromConfig(state.config);
      toast("Configuración general aplicada a esta prenda.");
      return afterScopeChange("product");
    case "edit-product": {
      if (!confirmDiscard()) return;
      const p = S.loadProducts(state.config).find((x) => x.id === btn.dataset.id);
      if (!p) return;
      loadProductIntoCalc(p);
      state.step = STEPS.length - 1;
      return show("calc");
    }
    case "dup-product": {
      const p = S.loadProducts(state.config).find((x) => x.id === btn.dataset.id);
      if (!p) return;
      const copy = clone(p);
      Object.assign(copy, { id: null, name: p.name + " (copia)", sku: p.sku ? p.sku + "-2" : "", snapshot: null, createdAt: null, updatedAt: null });
      S.saveProduct(copy, state.config);
      toast("Prenda duplicada.");
      return renderProducts();
    }
    case "del-product": {
      const p = S.loadProducts(state.config).find((x) => x.id === btn.dataset.id);
      if (!p || !confirm(`¿Eliminar "${p.name || "Sin nombre"}"? No se puede deshacer.`)) return;
      S.deleteProduct(p.id, state.config);
      if (state.product.id === p.id) state.product.id = null;
      toast("Prenda eliminada.");
      return renderProducts();
    }
    case "export": return exportFile();
    case "reset-config":
      if (!confirm("¿Volver la configuración a los valores iniciales? Las prendas guardadas no cambian.")) return;
      state.config = M.defaultConfig();
      S.saveConfig(state.config);
      return renderConfig();
    default:
  }
}

function saveCurrent() {
  const p = state.product;
  if (!p.name.trim()) {
    toast("Poné un nombre a la prenda antes de guardar.", "is-bad");
    return goStep(0);
  }
  recompute();
  p.snapshot = makeSnapshot(state.result);
  if (!S.saveProduct(p, state.config)) return toast("No se pudo guardar (el navegador bloqueó el almacenamiento).", "is-bad");
  state.dirty = false;
  S.saveDraft(p);
  recompute();
  toast("Prenda guardada en Productos.", "is-ok");
  refreshOutputs();
}

function exportFile() {
  const blob = new Blob([S.exportAll(state.config)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "bisu-costeo-" + M.today() + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!confirm("Importar reemplaza la configuración y las prendas guardadas en este navegador. ¿Seguir?")) return;
  file.text().then((text) => {
    const { config, count } = S.importAll(text);
    state.config = config;
    toast(`Copia importada: ${count} prendas.`, "is-ok");
    renderConfig();
  }).catch((err) => toast(err.message || "No se pudo leer el archivo.", "is-bad"));
}

/* ---------- Inicio ---------- */

document.addEventListener("input", onInput);
document.addEventListener("change", onChange);
document.addEventListener("click", onClick);
window.addEventListener("beforeunload", () => S.saveDraft(state.product));

recompute();
show("calc");
